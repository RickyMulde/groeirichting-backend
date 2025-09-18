const OpenAI = require('openai')

/**
 * Azure OpenAI Client Utility
 * Configureert OpenAI client voor Azure OpenAI service
 */
class AzureOpenAIClient {
  constructor() {
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT
    this.apiKey = process.env.AZURE_OPENAI_KEY
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION

    // Valideer environment variables
    this._validateConfig()

    // Maak OpenAI client
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: `${this.endpoint}openai/deployments/${this.deployment}`,
      defaultQuery: { 'api-version': this.apiVersion },
      defaultHeaders: {
        'api-key': this.apiKey
      }
    })
  }

  /**
   * Valideer Azure OpenAI configuratie
   */
  _validateConfig() {
    const missing = []
    
    if (!this.endpoint) missing.push('AZURE_OPENAI_ENDPOINT')
    if (!this.apiKey) missing.push('AZURE_OPENAI_KEY')
    if (!this.deployment) missing.push('AZURE_OPENAI_DEPLOYMENT')
    if (!this.apiVersion) missing.push('AZURE_OPENAI_API_VERSION')

    if (missing.length > 0) {
      throw new Error(`Ontbrekende Azure OpenAI environment variables: ${missing.join(', ')}`)
    }

    // Valideer endpoint format
    if (!this.endpoint.startsWith('https://')) {
      throw new Error('AZURE_OPENAI_ENDPOINT moet beginnen met https://')
    }

    console.log('✅ Azure OpenAI configuratie geldig')
    console.log(`   Endpoint: ${this.endpoint}`)
    console.log(`   Deployment: ${this.deployment}`)
    console.log(`   API Version: ${this.apiVersion}`)
  }

  /**
   * Maak een chat completion aan
   * @param {Object} options - Completion opties
   * @param {string} options.model - Model naam (wordt genegeerd, gebruikt deployment)
   * @param {Array} options.messages - Chat messages
   * @param {number} options.temperature - Temperature (0-1)
   * @param {number} options.max_completion_tokens - Max completion tokens
   * @param {number} options.max_tokens - Max tokens (wordt omgezet naar max_completion_tokens)
   * @returns {Promise<Object>} Completion response
   */
  async createCompletion(options) {
    try {
      // Converteer max_tokens naar max_completion_tokens voor backward compatibility
      if (options.max_tokens && !options.max_completion_tokens) {
        options.max_completion_tokens = options.max_tokens
        delete options.max_tokens
      }

      // Gebruik deployment name als model
      const azureOptions = {
        ...options,
        model: this.deployment
        // response_format wordt niet ondersteund door alle Azure modellen
      }

      console.log(`🤖 Azure OpenAI call: ${options.messages?.length || 0} messages, max_tokens: ${options.max_completion_tokens || options.max_tokens}`)

      const completion = await this.client.chat.completions.create(azureOptions)

      // Log de response voor debugging
      console.log('Azure response:', JSON.stringify(completion, null, 2))
      
      // Check of er een content is
      if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
        console.error('Azure response heeft geen choices of message')
        return {
          success: false,
          error: 'Azure response heeft geen choices of message',
          provider: 'azure',
          details: completion
        }
      }

      return {
        success: true,
        data: completion,
        provider: 'azure',
        usage: completion.usage
      }
    } catch (error) {
      console.error('❌ Azure OpenAI Error:', error.message)
      console.error('Error details:', error)
      console.error('Request options:', JSON.stringify(azureOptions, null, 2))
      
      return {
        success: false,
        error: error.message,
        provider: 'azure',
        details: error.response?.data || null
      }
    }
  }

  /**
   * Test de Azure OpenAI verbinding
   * @returns {Promise<boolean>} Verbinding succesvol
   */
  async testConnection() {
    try {
      const result = await this.createCompletion({
        messages: [{ role: 'user', content: 'Test verbinding' }],
        max_completion_tokens: 10
      })

      if (result.success) {
        console.log('✅ Azure OpenAI verbinding succesvol')
        return true
      } else {
        console.error('❌ Azure OpenAI verbinding gefaald:', result.error)
        return false
      }
    } catch (error) {
      console.error('❌ Azure OpenAI test error:', error.message)
      return false
    }
  }

  /**
   * Log configuratie status
   */
  logStatus() {
    console.log('🔧 Azure OpenAI Status:')
    console.log(`   Endpoint: ${this.endpoint}`)
    console.log(`   Deployment: ${this.deployment}`)
    console.log(`   API Version: ${this.apiVersion}`)
    console.log(`   API Key: ${this.apiKey ? '✅ Set' : '❌ Missing'}`)
  }
}

// Export singleton instance
const azureClient = new AzureOpenAIClient()
module.exports = azureClient
