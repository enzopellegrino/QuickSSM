/**
 * Script per la notarizzazione dell'applicazione HudlOps con Apple
 * 
 * Questo script viene eseguito automaticamente dopo la firma dell'app da electron-builder.
 * Supporta tre metodi di autenticazione:
 * 1. App Store Connect API (consigliato): APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER
 * 2. Apple ID (classico): APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 * 3. Keychain Profile: APPLE_KEYCHAIN, APPLE_KEYCHAIN_PROFILE
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  // Procedere con la notarizzazione solo su macOS
  if (context.electronPlatformName !== 'darwin') {
    console.log('⏭️  Notarizzazione saltata: non è una build macOS');
    return;
  }

  // Skip notarization se SKIP_NOTARIZE è impostato
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('\n⏭️  Notarizzazione saltata: SKIP_NOTARIZE=true');
    return;
  }

  // Ottieni il percorso dell'app .app creata
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log('\n🔐 Inizio processo di notarizzazione...');
  console.log(`📦 App: ${appPath}`);
  console.log(`🆔 Bundle ID: ${packager.appInfo.id}`);

  // Metodo 1: Keychain Profile (preferito se presente per evitare prompt/OTP)
  if (process.env.APPLE_KEYCHAIN_PROFILE) {
    console.log('🔑 Metodo: Keychain Profile');
    console.log(`🔐 Profile: ${process.env.APPLE_KEYCHAIN_PROFILE}`);
    try {
      await notarize({
        appPath,
        tool: 'notarytool',
        keychainProfile: process.env.APPLE_KEYCHAIN_PROFILE
      });
      console.log('✅ Notarizzazione completata con successo!');
      return;
    } catch (error) {
      console.error(`❌ Errore durante la notarizzazione con Keychain: ${error.message}`);
      // Non rilanciamo ancora: proviamo metodi alternativi
    }
  }

  // Metodo 2: App Store Connect API (consigliato per CI/CD)
  if (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) {
    console.log('🔑 Metodo: App Store Connect API Key');
    try {
      await notarize({
        appPath,
        tool: 'notarytool',
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      });
      console.log('✅ Notarizzazione completata con successo!');
      return;
    } catch (error) {
      console.error(`❌ Errore durante la notarizzazione con API Key: ${error.message}`);
      // Proviamo metodo successivo
    }
  }

  // Metodo 3: Apple ID con password specifica per app (fallback)
  if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
    console.log('🔑 Metodo: Apple ID con password specifica per app');
    console.log(`📧 Apple ID: ${process.env.APPLE_ID}`);
    console.log(`👥 Team ID: ${process.env.APPLE_TEAM_ID}`);
    try {
      await notarize({
        appPath,
        tool: 'notarytool',
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      });
      console.log('✅ Notarizzazione completata con successo!');
      return;
    } catch (error) {
      console.error(`❌ Errore durante la notarizzazione con Apple ID: ${error.message}`);
      throw error;
    }
  }

  // Nessun metodo di autenticazione configurato
  console.log('\n⚠️  Notarizzazione saltata: nessuna credenziale configurata');
  console.log('\n📝 Per attivare la notarizzazione, imposta una delle seguenti combinazioni di variabili d\'ambiente:\n');
  console.log('Metodo 1 (consigliato per CI/CD):');
  console.log('  export APPLE_API_KEY="percorso/alla/chiave/AuthKey_XXXXX.p8"');
  console.log('  export APPLE_API_KEY_ID="YYYYYY"');
  console.log('  export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"\n');
  console.log('Metodo 2 (più comune):');
  console.log('  export APPLE_ID="tua.email@example.com"');
  console.log('  export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"');
  console.log('  export APPLE_TEAM_ID="ABCDE12345"\n');
  console.log('Metodo 3 (con keychain configurato):');
  console.log('  export APPLE_KEYCHAIN_PROFILE="nome-profilo"\n');
  console.log('L\'app verrà firmata ma non notarizzata.');
};