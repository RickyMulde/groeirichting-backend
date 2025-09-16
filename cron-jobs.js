const cron = require('node-cron');
const { processEmailQueue } = require('./process-email-queue');

// Voer elke 5 minuten uit
cron.schedule('*/5 * * * *', () => {
  console.log('Processing email queue...');
  processEmailQueue();
});

// Start ook direct bij opstarten (voor testing)
console.log('Email queue processor started - will run every 5 minutes');

module.exports = { processEmailQueue };
