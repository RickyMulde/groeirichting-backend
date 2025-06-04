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
};

function containsSensitiveInfo(text) {
  const lowered = text.toLowerCase();

  for (const [type, regex] of Object.entries(patterns)) {
    if (regex.test(text)) {
      return { flagged: true, reason: `Vul a.u.b. geen ${type} in.` };
    }
  }

  const woorden = lowered.split(/[^\w]+/);
  for (const woord of woorden) {
    if (voornamenSet.has(woord)) {
      return { flagged: true, reason: `Noem liever geen voornamen zoals "${woord}".` };
    }
    if (achternamenSet.has(woord)) {
      return { flagged: true, reason: `Noem liever geen achternamen zoals "${woord}".` };
    }
    if (medischeSet.has(woord)) {
      return { flagged: true, reason: `Vermijd medische termen zoals "${woord}".` };
    }
    if (seksueleSet.has(woord)) {
      return { flagged: true, reason: `Vermijd termen over seksuele voorkeur zoals "${woord}".` };
    }
    if (religieuzeSet.has(woord)) {
      return { flagged: true, reason: `Vermijd religieuze termen zoals "${woord}".` };
    }
    if (politiekeSet.has(woord)) {
      return { flagged: true, reason: `Vermijd politieke termen zoals "${woord}".` };
    }
  }

  const doc = nlp(text);
  const names = doc.people().out('array');
  if (names.length > 0) {
    return { flagged: true, reason: `Naam gedetecteerd: "${names[0]}"` };
  }

  return { flagged: false };
}

module.exports = { containsSensitiveInfo };