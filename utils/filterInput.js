const nlp = require('compromise');
const {
  voornamenSet,
  achternamenSet,
  medischeSet,
  seksueleSet,
  religieuzeSet,
  politiekeSet
} = require('./gevoeligeData');

const patterns = {
  email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  // Verfijnde telefoon regex
  phoneMobile: /(?:\+31|0)\s*6(?:[\s-]?\d){8}\b/,
  phoneLandline: /(?:\+31|0)\s*\d(?:[\s-]?\d){8,9}\b/,
  // Generieke IBAN regex
  iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/i,
  // BSN met elfproef
  bsn: /\b\d{9}\b/,
  // Geboortedata patronen
  birthDate: /\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](19|20)\d{2}\b/,
  xss: /<\s*script.*?>.*?<\s*\/\s*script\s*>/gi,
  suspiciousFileLink: /(https?:\/\/)?[a-z0-9.-]+\.(exe|zip|scr|php|bat|cmd|sh)(\b|\/|$)/i,
  base64: /\b([A-Za-z0-9+\/]{40,}={0,2})\b/
};

// Helper functies
function validateBSN(bsn) {
  if (bsn.length !== 9) return false;
  
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(bsn[i]) * (9 - i);
  }
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? remainder : 11 - remainder;
  
  return checkDigit === parseInt(bsn[8]);
}

function validateIBAN(iban) {
  // Eenvoudige IBAN validatie voor Nederlandse IBANs
  if (!iban || typeof iban !== 'string') return false;
  
  // Verwijder spaties en maak hoofdletters
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  
  // Nederlandse IBAN: NL + 2 cijfers + 4 letters + 10 cijfers
  const dutchIbanPattern = /^NL\d{2}[A-Z]{4}\d{10}$/;
  
  if (!dutchIbanPattern.test(cleanIban)) {
    return false;
  }
  
  // Eenvoudige checksum validatie
  const countryCode = cleanIban.substring(0, 2);
  const checkDigits = cleanIban.substring(2, 4);
  const accountNumber = cleanIban.substring(4);
  
  // Basis validatie: check digits moeten numeriek zijn
  if (!/^\d{2}$/.test(checkDigits)) {
    return false;
  }
  
  // Voor nu accepteren we alle Nederlandse IBANs die het patroon volgen
  // Een volledige IBAN validatie zou complexer zijn
  return true;
}

function maskSensitiveData(text) {
  let maskedText = text;
  let maskCounter = { email: 0, phone: 0, iban: 0, name: 0, bsn: 0, birthdate: 0 };
  
  // E-mail maskeren
  maskedText = maskedText.replace(patterns.email, (match) => {
    maskCounter.email++;
    return `[EMAIL_${maskCounter.email}]`;
  });
  
  // Telefoon maskeren
  maskedText = maskedText.replace(patterns.phoneMobile, (match) => {
    maskCounter.phone++;
    return `[TEL_${maskCounter.phone}]`;
  });
  maskedText = maskedText.replace(patterns.phoneLandline, (match) => {
    maskCounter.phone++;
    return `[TEL_${maskCounter.phone}]`;
  });
  
  // IBAN maskeren (alleen als geldig)
  maskedText = maskedText.replace(patterns.iban, (match) => {
    if (validateIBAN(match)) {
      maskCounter.iban++;
      return `[IBAN_${maskCounter.iban}]`;
    }
    return match; // Laat ongeldige IBAN staan
  });
  
  // BSN maskeren (alleen als geldig)
  maskedText = maskedText.replace(patterns.bsn, (match) => {
    if (validateBSN(match)) {
      maskCounter.bsn++;
      return `[BSN_${maskCounter.bsn}]`;
    }
    return match; // Laat ongeldige BSN staan
  });
  
  // Geboortedata maskeren
  maskedText = maskedText.replace(patterns.birthDate, (match) => {
    maskCounter.birthdate++;
    return `[GEBOORTEDATUM_${maskCounter.birthdate}]`;
  });
  
  return { maskedText, maskCounter };
}

function containsSensitiveInfo(text) {
  const lowered = text.toLowerCase();
  console.log('Checking text:', text);

  // Unicode-bewust tokeniseren
  const woorden = lowered.split(/[^\p{L}\p{N}_]+/u);
  console.log('Split words:', woorden);

  // Context-guards voor politieke termen
  const hasNumberBeforeVolt = /\b\d+\s*volt\b/i.test(text);
  
  // Naam detectie met context
  const namePatterns = [
    /\bik\s+heet\b/i,
    /\bmijn\s+naam\s+is\b/i,
    /\bik\s+ben\b/i
  ];
  const hasNameContext = namePatterns.some(pattern => pattern.test(text));
  
  // Twee opeenvolgende naam-tokens detectie
  let consecutiveNames = 0;
  let hasConsecutiveNames = false;
  
  for (let i = 0; i < woorden.length - 1; i++) {
    const currentWord = woorden[i];
    const nextWord = woorden[i + 1];
    
    if (voornamenSet.has(currentWord) && achternamenSet.has(nextWord)) {
      consecutiveNames++;
      if (consecutiveNames >= 1) {
        hasConsecutiveNames = true;
        break;
      }
    } else if (voornamenSet.has(currentWord) || achternamenSet.has(nextWord)) {
      consecutiveNames = 0; // Reset counter
    }
  }

  // Soft-block: maskeren i.p.v. blokkeren
  const { maskedText, maskCounter } = maskSensitiveData(text);
  const hasMaskedData = Object.values(maskCounter).some(count => count > 0);
  
  // Regex-patterns controleren (zonder IBAN/BSN - die worden al gemaskeerd)
  const criticalPatterns = {
    xss: patterns.xss,
    suspiciousFileLink: patterns.suspiciousFileLink,
    base64: patterns.base64
  };
  
  for (const [type, regex] of Object.entries(criticalPatterns)) {
    if (regex.test(text)) {
      console.log('Blocked by critical pattern:', type);
      return {
        flagged: true,
        reason: `Vul a.u.b. geen persoonsgegevens of belangrijke gegevens in.`
      };
    }
  }

  // Woordenlijst-checks met context-guards
  for (const woord of woorden) {
    if (voornamenSet.has(woord) && (hasNameContext || hasConsecutiveNames)) {
      console.log('Blocked by voornamen with context:', woord);
      return { 
        flagged: true, 
        reason: `Noem liever geen voornamen zoals "${woord}".`,
        maskedText: hasMaskedData ? maskedText : undefined
      };
    }
    if (achternamenSet.has(woord) && (hasNameContext || hasConsecutiveNames)) {
      console.log('Blocked by achternamen with context:', woord);
      return { 
        flagged: true, 
        reason: `Noem liever geen achternamen zoals "${woord}".`,
        maskedText: hasMaskedData ? maskedText : undefined
      };
    }
    if (medischeSet.has(woord)) {
      console.log('Blocked by medische termen:', woord);
      return { 
        flagged: true, 
        reason: `Vermijd medische termen zoals "${woord}".`,
        maskedText: hasMaskedData ? maskedText : undefined
      };
    }
    if (seksueleSet.has(woord)) {
      console.log('Blocked by seksuele termen:', woord);
      return { 
        flagged: true, 
        reason: `Vermijd termen over seksuele voorkeur zoals "${woord}".`,
        maskedText: hasMaskedData ? maskedText : undefined
      };
    }
    if (religieuzeSet.has(woord)) {
      console.log('Blocked by religieuze termen:', woord);
      return { 
        flagged: true, 
        reason: `Vermijd religieuze termen zoals "${woord}".`,
        maskedText: hasMaskedData ? maskedText : undefined
      };
    }
    if (politiekeSet.has(woord) && !hasNumberBeforeVolt) {
      console.log('Blocked by politieke termen:', woord);
      return { 
        flagged: true, 
        reason: `Vermijd politieke termen zoals "${woord}".`,
        maskedText: hasMaskedData ? maskedText : undefined
      };
    }
  }

  // Als er data is gemaskeerd, toon melding maar blokkeer niet
  if (hasMaskedData) {
    console.log('Sensitive data masked:', maskCounter);
    return {
      flagged: false,
      maskedText: maskedText,
      message: "We hebben gevoelige gegevens verborgen."
    };
  }

  return { flagged: false };
}

module.exports = { containsSensitiveInfo };

