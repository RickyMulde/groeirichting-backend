const cron = require('node-cron');
const { processEmailQueue } = require('./process-email-queue');
const { processEmailTriggers } = require('./process-email-triggers');

// Voer elke 5 minuten uit
cron.schedule('*/5 * * * *', () => {
  console.log('Processing email queue...');
  processEmailQueue();
});

// Voer elke 15 minuten uit
cron.schedule('*/15 * * * *', () => {
  console.log('Processing email triggers...');
  processEmailTriggers();
});

// Start ook direct bij opstarten (voor testing)
console.log('Email queue processor started - will run every 5 minutes');
console.log('Email triggers processor started - will run every 15 minutes');

module.exports = { processEmailQueue, processEmailTriggers };
