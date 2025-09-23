const OpenAI = require('openai')

/**
 * Azure OpenAI Client Utility
 * Configureert OpenAI client voor Azure OpenAI service
 */
class AzureOpenAIClient {
  constructor() {
    // GPT-5-mini configuratie (hoofddeployment)
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT
    this.apiKey = process.env.AZURE_OPENAI_KEY
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION

    // GPT-4o configuratie (secundaire deployment)
    this.gpt4oEndpoint = process.env.AZURE_OPENAI_ENDPOINT_GPT4O
    this.gpt4oApiKey = process.env.AZURE_OPENAI_KEY_GPT4O
    this.gpt4oDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_GPT4O
    this.gpt4oApiVersion = process.env.AZURE_OPENAI_API_VERSION_GPT4O

    // Valideer environment variables
    this._validateConfig()

    // GPT-5-mini client (hoofddeployment)
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: `${this.endpoint}openai/deployments/${this.deployment}`,
      defaultQuery: { 'api-version': this.apiVersion },
      defaultHeaders: {
        'api-key': this.apiKey
      }
    })

    // GPT-4o client (secundaire deployment)
    if (this.gpt4oDeployment && this.gpt4oEndpoint && this.gpt4oApiKey) {
      this.gpt4oClient = new OpenAI({
        apiKey: this.gpt4oApiKey,
        baseURL: `${this.gpt4oEndpoint}openai/deployments/${this.gpt4oDeployment}`,
        defaultQuery: { 'api-version': this.gpt4oApiVersion },
        defaultHeaders: {
          'api-key': this.gpt4oApiKey
        }
      })
    }
  }

  /**
   * Valideer Azure OpenAI configuratie
   */
  _validateConfig() {
    const missing = []
    
    // Verplichte variabelen voor GPT-5-mini (hoofddeployment)
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

    // Configuratie validatie voltooid
  }

  /**
   * Maak een chat completion aan
   * @param {Object} options - Completion opties
   * @param {string} options.model - Model naam ('gpt-4o' of 'gpt-5-mini', default: 'gpt-5-mini')
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

      // Bepaal welk model te gebruiken
      const useGpt4o = options.model === 'gpt-4o'
      const selectedClient = useGpt4o ? this.gpt4oClient : this.client
      const selectedDeployment = useGpt4o ? this.gpt4oDeployment : this.deployment

      if (useGpt4o && !this.gpt4oClient) {
        throw new Error('GPT-4o deployment niet geconfigureerd. Voeg AZURE_OPENAI_GPT4O_DEPLOYMENT toe aan je environment variables.')
      }

      // Gebruik deployment name als model
      const azureOptions = {
        ...options,
        model: selectedDeployment
        // response_format wordt niet ondersteund door alle Azure modellen
      }

      const completion = await selectedClient.chat.completions.create(azureOptions)
      
      // Check of er een content is
      if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
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
const azureClient = new AzureOpenAIClient()
module.exports = azureClient
