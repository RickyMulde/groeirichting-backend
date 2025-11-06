const OpenAI = require('openai')

/**
 * Direct OpenAI Client Utility
 * Configureert OpenAI client voor directe OpenAI API (niet via Azure)
 */
class DirectOpenAIClient {
  constructor() {
    // Basis configuratie
    this.apiKey = process.env.OPENAI_API_KEY
    this.baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-5'
    
    // Valideer environment variables
    this._validateConfig()
    
    // OpenAI client
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL
    })
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
   * Maak een chat completion aan
   * @param {Object} options - Completion opties
   * @param {string} options.model - Model naam (bijv. 'gpt-5', 'gpt-5-mini', 'gpt-4o', default: OPENAI_MODEL of 'gpt-5')
   * @param {Array} options.messages - Chat messages
   * @param {number} options.temperature - Temperature (0-1)
   * @param {number} options.max_completion_tokens - Max completion tokens
   * @param {number} options.max_tokens - Max tokens (wordt gebruikt als max_completion_tokens niet is ingesteld)
   * @returns {Promise<Object>} Completion response
   */
  async createCompletion(options) {
    try {
      // Gebruik model uit options, anders default model
      const model = options.model || this.defaultModel
      
      // Converteer max_completion_tokens naar max_tokens voor OpenAI API
      // OpenAI gebruikt max_tokens, niet max_completion_tokens
      const maxTokens = options.max_completion_tokens || options.max_tokens
      
      // Bouw OpenAI API options
      const openaiOptions = {
        model: model,
        messages: options.messages,
        temperature: options.temperature !== undefined ? options.temperature : 1,
        ...(maxTokens && { max_tokens: maxTokens })
      }

      // Voeg response_format toe als het is opgegeven
      if (options.response_format) {
        openaiOptions.response_format = options.response_format
      }

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
        max_tokens: 10
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
