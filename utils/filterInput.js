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
  phone: /\+?\d{6,15}/,
  iban: /\bNL\d{2}[A-Z]{4}\d{10}\b/i,
  xss: /<\s*script.*?>.*?<\s*\/\s*script\s*>/gi,
  suspiciousFileLink: /(https?:\/\/)?[a-z0-9.-]+\.(exe|zip|scr|php|bat|cmd|sh)(\b|\/|$)/i,
  base64: /\b([A-Za-z0-9+\/]{40,}={0,2})\b/
};

function containsSensitiveInfo(text) {
  const lowered = text.toLowerCase();
  console.log('Checking text:', text);

  // Regex-patterns controleren
  for (const [type, regex] of Object.entries(patterns)) {
    if (regex.test(text)) {
      console.log('Blocked by regex pattern:', type);
      return {
        flagged: true,
        reason: `Vul a.u.b. geen persoonsgegevens of belangrijke gegevens in.`
      };
    }
  }

  // Woordenlijst-checks
  const woorden = lowered.split(/[^\w]+/);
  console.log('Split words:', woorden);
  for (const woord of woorden) {
    if (voornamenSet.has(woord)) {
      console.log('Blocked by voornamen:', woord);
      return { flagged: true, reason: `Noem liever geen voornamen zoals "${woord}".` };
    }
    if (achternamenSet.has(woord)) {
      console.log('Blocked by achternamen:', woord);
      return { flagged: true, reason: `Noem liever geen achternamen zoals "${woord}".` };
    }
    if (medischeSet.has(woord)) {
      console.log('Blocked by medische termen:', woord);
      return { flagged: true, reason: `Vermijd medische termen zoals "${woord}".` };
    }
    if (seksueleSet.has(woord)) {
      console.log('Blocked by seksuele termen:', woord);
      return { flagged: true, reason: `Vermijd termen over seksuele voorkeur zoals "${woord}".` };
    }
    if (religieuzeSet.has(woord)) {
      console.log('Blocked by religieuze termen:', woord);
      return { flagged: true, reason: `Vermijd religieuze termen zoals "${woord}".` };
    }
    if (politiekeSet.has(woord)) {
      console.log('Blocked by politieke termen:', woord);
      return { flagged: true, reason: `Vermijd politieke termen zoals "${woord}".` };
    }
  }

  // Compromise-naamdetectie is uitgeschakeld
  /*
  try {
    const doc = nlp(text);
    const names = doc.people().out('array');
    if (names.length > 0) {
      // Filter vals positieven
      const falsePositives = ['dit', 'dat', 'deze', 'die', 'het', 'een', 'de'];
      const detectedName = names[0].toLowerCase();
      
      // Alleen blokkeren als het geen vals positief is
      if (!falsePositives.includes(detectedName)) {
        return { flagged: true, reason: `Naam gedetecteerd: "${names[0]}"` };
      }
    }
  } catch (err) {
    console.warn('Compromise error:', err.message);
  }
  */

  return { flagged: false };
}

module.exports = { containsSensitiveInfo };
