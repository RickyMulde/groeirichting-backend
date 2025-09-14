// Backend/services/mailer/mailer.js
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ---- helpers ----
function parseList(v) {
  return (v || '')
    .split(/[,\s]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}
function normalize(e) { return String(e || '').trim().toLowerCase(); }
function coerceArray(v) { return Array.isArray(v) ? v : [v]; }
function isProd() {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  return env === 'prod' || env === 'production';
}
function isWhitelistEnabled() {
  return String(process.env.EMAIL_WHITELIST_ENABLED || '').toLowerCase() === 'true';
}
function isAllowedRecipient(email) {
  if (isProd() || !isWhitelistEnabled()) return true; // prod: nooit blokkeren
  const allowedDomains = parseList(process.env.EMAIL_WHITELIST_DOMAINS); // e.g. ['@groeirichting.nl']
  const allowedAddrs   = parseList(process.env.EMAIL_WHITELIST_ADDRESSES);

  const e = normalize(email);
  if (allowedAddrs.includes(e)) return true;

  const at = e.lastIndexOf('@');
  if (at === -1) return false;
  const domain = e.slice(at);            // '@domein.nl'
  const domainNoAt = domain.slice(1);    // 'domein.nl'

  return allowedDomains.some(d => {
    const dNorm = d.startsWith('@') ? d : '@' + d;
    const dNoAt = d.replace(/^@/, '');
    return domain === dNorm || domainNoAt === dNoAt || domain.endsWith(dNorm);
  });
}
function assertAllowedRecipient(to) {
  const arr = coerceArray(to).map(normalize);
  const blocked = arr.filter(e => !isAllowedRecipient(e));
  if (blocked.length) {
    throw new Error(`Email whitelist blokkeert (test/staging): ${blocked.join(', ')}. Voeg toe aan EMAIL_WHITELIST_* env.`);
  }
}
function maybeRedirectAll(to) {
  const sink = (process.env.EMAIL_REDIRECT_ALL_TO || '').trim();
  if (!sink || isProd()) return to; // redirect alleen in niet-prod
  return sink;
}

// ---- main ----
/**
 * Verstuur e-mail via de centrale mailer.
 * @param {Object} opts
 * @param {string|string[]} opts.to - ontvanger(s)
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]
 * @param {string} [opts.tag] - bv 'INVITE', 'REM1'
 * @param {Object} [opts.metadata] - bv { orgId, teamId, roundId }
 * @param {string} [opts.from] - override default FROM
 * @param {string} [opts.replyTo] - override default Reply-To
 * @param {boolean} [opts.trackOpens=true]
 * @param {boolean} [opts.trackClicks=true]
 * @param {Object} [opts.headers] - extra headers
 * @returns {Promise<{messageId?: string, provider: 'resend'}>}
 */
async function sendEmail(opts = {}) {
  const {
    to, subject, html, text,
    tag, metadata,
    from, replyTo,
    trackOpens = true,
    trackClicks = true,
    headers = {},
  } = opts;

  if (!to) throw new Error('sendEmail: "to" is verplicht');
  if (!subject) throw new Error('sendEmail: "subject" is verplicht');
  if (!html && !text) throw new Error('sendEmail: "html" of "text" is verplicht');

  // 1) whitelist / redirect
  assertAllowedRecipient(to);
  const finalTo = maybeRedirectAll(to);

  // 2) afzender velden
  const fromAddr = from || process.env.FROM_EMAIL;
  const reply = replyTo || process.env.REPLY_TO_DEFAULT || undefined;

  // 3) headers samenstellen
  const hdrs = { ...headers };
  if (tag) hdrs['X-Tag'] = String(tag);
  if (metadata) hdrs['X-Metadata'] = JSON.stringify(metadata);
  if (finalTo !== to) {
    hdrs['X-Original-To'] = Array.isArray(to) ? to.join(',') : String(to);
  }

  try {
    const res = await resend.emails.send({
      from: fromAddr,
      to: finalTo,
      subject,
      html,
      text,
      headers: hdrs,
      // Resend tracking flags:
      track_opens: !!trackOpens,
      track_clicks: !!trackClicks,
      // Reply-To (Resend ondersteunt 'reply_to')
      reply_to: reply,
    });

    const messageId = res && res.data && res.data.id ? res.data.id : undefined;
    return { messageId, provider: 'resend' };
  } catch (err) {
    const safeTo = Array.isArray(finalTo) ? finalTo.join(',') : String(finalTo);
    const context = `EmailSendError (to: ${safeTo}, tag: ${tag || '-'}, provider: resend)`;
    const msg = err && err.message ? err.message : String(err);
    const e = new Error(`${context}: ${msg}`);
    e.cause = err;
    throw e;
  }
}

// Minimalistische sender voor verificatie emails
async function sendMail({ to, subject, html }) {
  return await resend.emails.send({
    from: 'GroeiRichting Support <support@groeirichting.nl>',
    to,
    subject,
    html,
  });
}

module.exports = {
  sendEmail,
  sendMail, // Nieuwe functie voor verificatie emails
  // Helpers exporteren kan handig zijn voor tests:
  __test__: { isProd, isWhitelistEnabled, isAllowedRecipient, assertAllowedRecipient, maybeRedirectAll },
};
