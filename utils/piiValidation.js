/**
 * PII (Personally Identifiable Information) Validatie Utility
 * Valideert tekst op gevoelige persoonsgegevens via externe AVG validatie API
 */

// Gebruik node-fetch voor compatibiliteit (Node.js 18+ heeft ingebouwde fetch, maar node-fetch is expliciet)
const fetch = require('node-fetch');

const PII_VALIDATION_API_URL = 'https://avg-validation-api-main-l1rdhb.laravel.cloud/api/pii/validate-public';

// Model voor LLM-validatie (hardcoded voor testen)
const PII_VALIDATION_MODEL = 'gpt-oss:20b';

/**
 * Valideert tekst op gevoelige persoonsgegevens
 * @param {string} text - De tekst die gevalideerd moet worden
 * @returns {Promise<{isValid: boolean, violations: Array, message: string}>}
 */
async function validatePII(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.log('[piiValidation] ⏭️  Geen tekst om te valideren');
    return {
      isValid: true,
      violations: [],
      message: 'Geen tekst om te valideren'
    };
  }

  console.log('[piiValidation] 🔍 Start PII validatie voor tekst:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
  console.log('[piiValidation] 📡 API URL:', PII_VALIDATION_API_URL);

  const body = { text: text };
  if (PII_VALIDATION_MODEL) {
    body.model = PII_VALIDATION_MODEL;
    console.log('[piiValidation] 🤖 Model:', PII_VALIDATION_MODEL);
  }

  try {
    const response = await fetch(PII_VALIDATION_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    console.log('[piiValidation] 📥 Response status:', response.status, response.statusText);

    if (!response.ok) {
      // Als de API niet beschikbaar is, loggen we dit maar blokkeren we niet
      // Dit voorkomt dat de hele flow stilvalt als de PII API down is
      console.error('[piiValidation] ❌ API request failed:', response.status, response.statusText);
      return {
        isValid: true, // Bij API fouten gaan we door (fail-open voor beschikbaarheid)
        violations: [],
        message: 'PII validatie API niet beschikbaar, validatie overgeslagen'
      };
    }

    const data = await response.json();
    console.log('[piiValidation] 📋 Volledige API response:', JSON.stringify(data, null, 2));
    
    // De API retourneert een array met validatieresultaten
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[piiValidation] ⚠️  Geen validatieresultaten ontvangen (lege array)');
      return {
        isValid: true,
        violations: [],
        message: 'Geen validatieresultaten ontvangen',
        rawResponse: data // Voeg raw response toe voor debugging
      };
    }

    // Check of er violations zijn (voldoet: false)
    const violations = data.filter(item => item.voldoet === false);
    const allValid = data.every(item => item.voldoet === true);
    
    console.log('[piiValidation] 📊 Validatie resultaten:');
    console.log('[piiValidation]   - Totaal items:', data.length);
    console.log('[piiValidation]   - Violations:', violations.length);
    console.log('[piiValidation]   - Alle items valide:', allValid);
    console.log('[piiValidation]   - Volledige data:', JSON.stringify(data, null, 2));
    
    if (violations.length > 0) {
      // Er zijn gevoelige gegevens gedetecteerd
      const labels = violations.flatMap(v => v.labels || []);
      const reasons = violations.map(v => v.reason || 'Onbekende reden').join('; ');
      const articles = violations.flatMap(v => v.article ? [v.article] : []).filter((v, i, a) => a.indexOf(v) === i);
      
      console.log('[piiValidation] ⚠️  PII GEDETECTEERD!');
      console.log('[piiValidation] 🏷️  Labels:', labels);
      console.log('[piiValidation] 📝 Reden:', reasons);
      console.log('[piiValidation] 📚 Artikelen:', articles);
      
      return {
        isValid: false,
        violations: violations,
        labels: labels,
        reason: reasons,
        articles: articles,
        message: `Je antwoord bevat gevoelige persoonsgegevens: ${labels.join(', ')}. ${reasons}`,
        rawResponse: data // Voeg raw response toe voor debugging
      };
    }

    // Geen violations gevonden
    console.log('[piiValidation] ✅ Geen PII gedetecteerd - tekst is veilig');
    console.log('[piiValidation] 📋 Volledige validatie resultaten:', JSON.stringify(data, null, 2));
    return {
      isValid: true,
      violations: [],
      message: 'Geen gevoelige gegevens gedetecteerd',
      rawResponse: data // Voeg raw response toe voor debugging
    };

  } catch (error) {
    // Bij netwerkfouten of andere errors, loggen we dit maar blokkeren we niet
    // Dit voorkomt dat de hele flow stilvalt als de PII API problemen heeft
    console.error('[piiValidation] Error during validation:', error.message);
    return {
      isValid: true, // Bij errors gaan we door (fail-open voor beschikbaarheid)
      violations: [],
      message: 'PII validatie kon niet worden uitgevoerd, validatie overgeslagen'
    };
  }
}

module.exports = {
  validatePII
};
