const OpenAI = require('openai')

/**
 * Direct OpenAI Client Utility
 * Configureert OpenAI client voor directe OpenAI API (niet via Azure)
 * 
 * 🔄 MIGRATIE NOTITIE:
 * - createCompletion(): Legacy Chat Completions API (voor gpt-4o, gpt-5, gpt-5-mini)
 * - createResponse(): Nieuwe Responses API (voor gpt-5.2, gpt-5.2-instant)
 */
class DirectOpenAIClient {
  constructor() {
    // Basis configuratie
    this.apiKey = process.env.OPENAI_API_KEY
    // Zorg dat baseURL altijd eindigt op /v1 (zonder /chat/completions - SDK voegt dat toe)
    const customBaseURL = process.env.OPENAI_BASE_URL
    this.baseURL = customBaseURL || 'https://api.openai.com/v1'
    
    // Zorg dat baseURL niet eindigt op /chat/completions of /responses
    if (this.baseURL.includes('/chat/completions') || this.baseURL.includes('/responses') || this.baseURL.includes('/assistants')) {
      console.warn('⚠️ [openaiClient] baseURL bevat een endpoint pad. Verwijder dit - de SDK voegt automatisch /chat/completions toe.')
      this.baseURL = this.baseURL.replace(/\/chat\/completions.*$/, '').replace(/\/responses.*$/, '').replace(/\/assistants.*$/, '')
    }
    
    // Zorg dat baseURL eindigt op /v1
    if (!this.baseURL.endsWith('/v1')) {
      this.baseURL = this.baseURL.replace(/\/$/, '') + '/v1'
    }
    
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-5.2'
    
    // Valideer environment variables
    this._validateConfig()
    
    // OpenAI client - baseURL moet zijn: https://api.openai.com/v1
    // SDK voegt automatisch /chat/completions of /responses toe
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL
    })
    
    console.log('[openaiClient] Client geïnitialiseerd met baseURL:', this.baseURL)
  }

  /**
   * Valideer OpenAI configuratie
   */
  _validateConfig() {
    const missing = []
    
    if (!this.apiKey) {
      missing.push('OPENAI_API_KEY')
    }

    if (missing.length > 0) {
      throw new Error(`Ontbrekende OpenAI environment variables: ${missing.join(', ')}`)
    }

    // Valideer baseURL format (als aangepast)
    if (this.baseURL && !this.baseURL.startsWith('http')) {
      throw new Error('OPENAI_BASE_URL moet beginnen met http:// of https://')
    }
  }

  /**
   * 🆕 Maak een response aan met de Responses API (GPT-5.2+)
   * @param {Object} options - Response opties
   * @param {string} options.model - Model naam (bijv. 'gpt-5.2', 'gpt-5.2-instant')
   * @param {string} options.instructions - System instructies
   * @param {Array} options.input - Input messages [{role: 'user', content: '...'}]
   * @param {number} options.max_output_tokens - Max output tokens
   * @param {Object} options.text - Text format opties (optioneel, voor structured outputs)
   * @returns {Promise<Object>} Response object
   */
  async createResponse(options) {
    try {
      const model = options.model || this.defaultModel
      
      console.log('[openaiClient] ===== RESPONSES API REQUEST =====')
      console.log('[openaiClient] Model:', model)
      console.log('[openaiClient] Max output tokens:', options.max_output_tokens)
      console.log('[openaiClient] Has instructions:', !!options.instructions)
      console.log('[openaiClient] Input messages:', options.input?.length || 0)
      console.log('[openaiClient] ================================')

      // Bouw de request options voor Responses API
      const responseOptions = {
        model: model,
        input: options.input,
        max_output_tokens: options.max_output_tokens || 2500,
        // Priority tier voor snellere verwerking
        service_tier: options.service_tier || 'default'
      }

      // Voeg instructions toe als aanwezig
      if (options.instructions) {
        responseOptions.instructions = options.instructions
      }

      // Voeg text format toe voor structured outputs (JSON)
      if (options.text) {
        responseOptions.text = options.text
      }

      // Roep de Responses API aan
      const response = await this.client.responses.create(responseOptions)
      
      // Check of er output is
      if (!response.output_text) {
        return {
          success: false,
          error: 'OpenAI Responses API gaf geen output_text terug',
          provider: 'openai-responses',
          details: response
        }
      }

      return {
        success: true,
        data: {
          output_text: response.output_text,
          id: response.id,
          model: response.model,
          usage: response.usage
        },
        provider: 'openai-responses',
        usage: response.usage
      }
    } catch (error) {
      console.error('[openaiClient] Responses API error:', error.message)
      return {
        success: false,
        error: error.message,
        provider: 'openai-responses',
        details: error.response?.data || error.error || null
      }
    }
  }

  /**
   * 📜 LEGACY: Maak een chat completion aan (voor oudere modellen)
   * @param {Object} options - Completion opties
   * @param {string} options.model - Model naam (bijv. 'gpt-5', 'gpt-5-mini', 'gpt-4o', default: OPENAI_MODEL of 'gpt-5')
   * @param {Array} options.messages - Chat messages
   * @param {number} options.temperature - Temperature (0-1)
   * @param {number} options.max_completion_tokens - Max completion tokens (vereist voor GPT-5)
   * @param {number} options.max_tokens - Max tokens (wordt geconverteerd naar max_completion_tokens voor backward compatibility)
   * @returns {Promise<Object>} Completion response
   */
  async createCompletion(options) {
    try {
      // Gebruik model uit options, anders default model
      const model = options.model || this.defaultModel
      
      // GPT-5 gebruikt max_completion_tokens, niet max_tokens
      // Converteer max_tokens naar max_completion_tokens voor backward compatibility
      const maxCompletionTokens = options.max_completion_tokens || options.max_tokens
      
      // GPT-5 is een preview model met beperkte parameter ondersteuning
      // Ondersteunt alleen: temperature (alleen 1), max_completion_tokens, response_format, stream
      // Ondersteunt NIET: top_p, frequency_penalty, presence_penalty, temperature andere waarden dan 1
      const isGpt5 = model.startsWith('gpt-5')
      
      // Bouw OpenAI API options
      const openaiOptions = {
        model: model,
        messages: options.messages,
        ...(maxCompletionTokens && { max_completion_tokens: maxCompletionTokens }),
        // Priority tier voor snellere verwerking (2x duurder dan Standard)
        service_tier: 'priority'
      }

      // Temperature: GPT-5 ondersteunt alleen temperature: 1
      if (isGpt5) {
        // GPT-5: alleen temperature 1 is ondersteund (geforceerd, ongeacht wat er wordt opgegeven)
        openaiOptions.temperature = 1
      } else {
        // Andere modellen (gpt-4o, etc.): gebruik opgegeven temperature of default 1
        openaiOptions.temperature = options.temperature !== undefined ? options.temperature : 1
      }

      // Voeg optionele parameters toe - alleen als model ze ondersteunt
      if (!isGpt5) {
        // top_p, frequency_penalty, presence_penalty worden alleen ondersteund door andere modellen (gpt-4o, etc.)
        if (options.top_p !== undefined) {
          openaiOptions.top_p = options.top_p
        }
        if (options.frequency_penalty !== undefined) {
          openaiOptions.frequency_penalty = options.frequency_penalty
        }
        if (options.presence_penalty !== undefined) {
          openaiOptions.presence_penalty = options.presence_penalty
        }
      }
      // Stream en response_format worden wel ondersteund door GPT-5
      if (options.stream !== undefined) {
        openaiOptions.stream = options.stream
      }
      if (options.response_format) {
        openaiOptions.response_format = options.response_format
      }

      // DEBUG: Log welke endpoint we aanroepen
      // De SDK voegt automatisch /chat/completions toe aan baseURL
      const expectedEndpoint = `${this.baseURL}/chat/completions`
      console.log('[openaiClient] ===== CHAT COMPLETIONS REQUEST =====')
      console.log('[openaiClient] Model:', model)
      console.log('[openaiClient] Verwachtte endpoint:', expectedEndpoint)
      console.log('[openaiClient] Request options:', JSON.stringify({
        model: openaiOptions.model,
        temperature: openaiOptions.temperature,
        max_completion_tokens: openaiOptions.max_completion_tokens,
        has_response_format: !!openaiOptions.response_format
      }))
      console.log('[openaiClient] ====================================')

      // Roep expliciet chat.completions.create() aan - dit zou moeten resulteren in POST https://api.openai.com/v1/chat/completions
      const completion = await this.client.chat.completions.create(openaiOptions)
      
      // Check of er een content is
      if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
        return {
          success: false,
          error: 'OpenAI response heeft geen choices of message',
          provider: 'openai',
          details: completion
        }
      }

      return {
        success: true,
        data: completion,
        provider: 'openai',
        usage: completion.usage
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: 'openai',
        details: error.response?.data || error.error || null
      }
    }
  }

  /**
   * Test de OpenAI verbinding
   * @returns {Promise<boolean>} Verbinding succesvol
   */
  async testConnection() {
    try {
      const result = await this.createCompletion({
        messages: [{ role: 'user', content: 'Test verbinding' }],
        max_completion_tokens: 10
      })

      if (result.success) {
        return true
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  }

  /**
   * Log configuratie status (alleen voor debugging)
   */
  logStatus() {
    // Status logging verwijderd voor productie
  }
}

// Export singleton instance
const openaiClient = new DirectOpenAIClient()
module.exports = openaiClient
