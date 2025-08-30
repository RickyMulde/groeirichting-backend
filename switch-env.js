#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Kleurcodes voor mooiere output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Configuratie
const envFiles = {
  test: '.env.test',
  production: '.env.production'
};

const targetFile = '.env';
const backupFile = '.env.backup';

// Functie om bestand te controleren
function checkFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    logError(`${description} bestaat niet: ${filePath}`);
    return false;
  }
  
  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      logError(`${description} is leeg: ${filePath}`);
      return false;
    }
    return true;
  } catch (error) {
    logError(`Kan ${description} niet lezen: ${error.message}`);
    return false;
  }
}

// Functie om .env bestand te valideren
function validateEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    if (lines.length === 0) {
      logError('Omgevingsbestand bevat geen geldige variabelen');
      return false;
    }
    
    // Controleer of er belangrijke variabelen zijn
    const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
    const missingVars = requiredVars.filter(varName => 
      !lines.some(line => line.startsWith(varName + '='))
    );
    
    // Controleer productie bevestiging
    if (filePath.includes('.env.production')) {
      const hasConfirmProduction = lines.some(line => line.startsWith('CONFIRM_PRODUCTION=YES'));
      if (!hasConfirmProduction) {
        logWarning('LET OP: CONFIRM_PRODUCTION=YES ontbreekt in productieomgeving!');
        logInfo('Dit is verplicht om bewust in productie te werken');
        logInfo('Voeg CONFIRM_PRODUCTION=YES toe aan je .env.production bestand');
        return false;
      }
    }
    
    if (missingVars.length > 0) {
      logWarning(`Let op: De volgende variabelen ontbreken: ${missingVars.join(', ')}`);
      logInfo('Dit kan problemen veroorzaken bij het starten van de backend');
    }
    
    return true;
  } catch (error) {
    logError(`Kan omgevingsbestand niet valideren: ${error.message}`);
    return false;
  }
}

// Functie om backup te maken
function createBackup() {
  if (fs.existsSync(targetFile)) {
    try {
      fs.copyFileSync(targetFile, backupFile);
      logInfo(`Backup gemaakt van huidige .env: ${backupFile}`);
      return true;
    } catch (error) {
      logWarning(`Kon geen backup maken: ${error.message}`);
      return false;
    }
  }
  return true;
}

// Functie om omgeving te schakelen
function switchEnvironment(env) {
  log(`🔄 Bezig met schakelen naar ${env} omgeving...`, 'cyan');
  
  // Controleer of de omgeving geldig is
  if (!envFiles[env]) {
    logError(`Ongeldige omgeving: ${env}`);
    logInfo('Beschikbare omgevingen: test, production');
    process.exit(1);
  }
  
  const sourceFile = envFiles[env];
  
  // Controleer of het bronbestand bestaat en geldig is
  if (!checkFile(sourceFile, `Omgevingsbestand voor ${env}`)) {
    process.exit(1);
  }
  
  // Valideer het bronbestand
  if (!validateEnvFile(sourceFile)) {
    logError(`Omgevingsbestand voor ${env} is niet geldig`);
    process.exit(1);
  }
  
  // Maak backup van huidige .env (als die bestaat)
  createBackup();
  
  // Kopieer het gekozen bestand naar .env
  try {
    fs.copyFileSync(sourceFile, targetFile);
    logSuccess(`Omgeving gewijzigd naar: ${env}`);
    logInfo(`📁 ${sourceFile} → ${targetFile}`);
    
    // Toon een samenvatting van de wijziging
    const content = fs.readFileSync(targetFile, 'utf8');
    const varCount = content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
    logInfo(`Aantal omgevingsvariabelen geladen: ${varCount}`);
    
    // Controleer of er een backup is gemaakt
    if (fs.existsSync(backupFile)) {
      logInfo(`Je kunt terug naar de vorige omgeving met: node switch-env.js restore`);
    }
    
  } catch (error) {
    logError(`Kon omgeving niet wijzigen: ${error.message}`);
    
    // Probeer backup te herstellen als die bestaat
    if (fs.existsSync(backupFile)) {
      try {
        fs.copyFileSync(backupFile, targetFile);
        logInfo('Backup hersteld vanwege fout');
      } catch (restoreError) {
        logError(`Kon backup niet herstellen: ${restoreError.message}`);
      }
    }
    
    process.exit(1);
  }
}

// Functie om backup te herstellen
function restoreBackup() {
  if (!fs.existsSync(backupFile)) {
    logError('Geen backup gevonden om te herstellen');
    process.exit(1);
  }
  
  try {
    fs.copyFileSync(backupFile, targetFile);
    logSuccess('Backup hersteld');
    logInfo(`📁 ${backupFile} → ${targetFile}`);
  } catch (error) {
    logError(`Kon backup niet herstellen: ${error.message}`);
    process.exit(1);
  }
}

// Functie om status te tonen
function showStatus() {
  log('📊 Huidige omgevingsstatus:', 'cyan');
  
  // Toon welke omgevingsbestanden bestaan
  Object.entries(envFiles).forEach(([env, file]) => {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      const size = (stats.size / 1024).toFixed(1);
      log(`  ${env}: ${file} (${size} KB)`, 'green');
    } else {
      log(`  ${env}: ${file} (niet gevonden)`, 'red');
    }
  });
  
  // Toon actieve omgeving
  if (fs.existsSync(targetFile)) {
    log(`  Actief: ${targetFile}`, 'bright');
    
    // Probeer te bepalen welke omgeving actief is
    try {
      const content = fs.readFileSync(targetFile, 'utf8');
      const firstLine = content.split('\n')[0];
      if (firstLine.includes('TEST') || firstLine.includes('test')) {
        log('  Type: Testomgeving', 'yellow');
      } else if (firstLine.includes('PRODUCTION') || firstLine.includes('production')) {
        log('  Type: Productieomgeving', 'magenta');
      }
    } catch (error) {
      log('  Type: Onbekend', 'yellow');
    }
  } else {
    log('  Actief: Geen omgeving geladen', 'red');
  }
  
  // Toon backup status
  if (fs.existsSync(backupFile)) {
    log(`  Backup: ${backupFile} beschikbaar`, 'blue');
  }
}

// Functie om help te tonen
function showHelp() {
  log('🔧 Omgevingsbeheer Script', 'bright');
  log('========================', 'bright');
  log('');
  log('Gebruik:', 'cyan');
  log('  node switch-env.js <omgeving>', 'bright');
  log('');
  log('Beschikbare omgevingen:', 'cyan');
  log('  test        - Schakel naar testomgeving', 'green');
  log('  production  - Schakel naar productieomgeving', 'green');
  log('');
  log('Extra commando\'s:', 'cyan');
  log('  status      - Toon huidige omgevingsstatus', 'blue');
  log('  restore     - Herstel vorige omgeving uit backup', 'blue');
  log('  help        - Toon deze help', 'blue');
  log('');
  log('Voorbeelden:', 'cyan');
  log('  node switch-env.js test        # Schakel naar testomgeving', 'green');
  log('  node switch-env.js production  # Schakel naar productieomgeving', 'green');
  log('  node switch-env.js status      # Toon status', 'blue');
  log('  node switch-env.js restore     # Herstel backup', 'blue');
  log('');
  log('💡 Tips:', 'yellow');
  log('  - Maak altijd een backup voordat je wijzigt', 'yellow');
  log('  - Controleer de status als je twijfelt', 'yellow');
  log('  - Gebruik restore als er iets misgaat', 'yellow');
}

// Hoofdprogramma
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }
  
  const command = args[0].toLowerCase();
  
  try {
    switch (command) {
      case 'test':
      case 'production':
        switchEnvironment(command);
        break;
        
      case 'status':
        showStatus();
        break;
        
      case 'restore':
        restoreBackup();
        break;
        
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;
        
      default:
        logError(`Onbekend commando: ${command}`);
        logInfo('Gebruik "node switch-env.js help" voor meer informatie');
        process.exit(1);
    }
  } catch (error) {
    logError(`Onverwachte fout: ${error.message}`);
    logInfo('Gebruik "node switch-env.js help" voor meer informatie');
    process.exit(1);
  }
}

// Start het script
main();
