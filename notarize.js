// Script per la notarizzazione dell'applicazione HudlOps con Apple
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  // Procedere con la notarizzazione solo su macOS e se ci sono gli ID appropriati impostati
  if (context.electronPlatformName !== 'darwin') {
    console.log('Notarizzazione saltata: piattaforma non macOS');
    return;
  }

  // Ottieni il percorso dell'app .app creata
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Tentativo di notarizzazione per: ${appPath}`);

  // Prova prima con APPLE_API_KEY (metodo consigliato e più sicuro)
  if (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) {
    console.log('Notarizzazione con APPLE_API_KEY');
    try {
      await notarize({
        appPath,
        tool: 'notarytool',
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      });
      return;
    } catch (error) {
      console.error(`Errore durante la notarizzazione con API Key: ${error.message}`);
      // Continua con il prossimo metodo se questo fallisce
    }
  }

  // Prova con APPLE_ID (metodo classico)
  if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
    console.log('Notarizzazione con APPLE_ID e password per app specifica');
    try {
      await notarize({
        appBundleId: packager.appInfo.id,
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      });
      return;
    } catch (error) {
      console.error(`Errore durante la notarizzazione con Apple ID: ${error.message}`);
      // Continua con il prossimo metodo se questo fallisce
    }
  }

  // Prova con APPLE_KEYCHAIN (metodo alternativo)
  if (process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE) {
    console.log('Notarizzazione con APPLE_KEYCHAIN');
    try {
      await notarize({
        appPath,
        tool: 'notarytool',
        keychainProfile: process.env.APPLE_KEYCHAIN_PROFILE
      });
      return;
    } catch (error) {
      console.error(`Errore durante la notarizzazione con Keychain: ${error.message}`);
    }
  }

  // Se arriviamo qui, nessun metodo è disponibile o tutti hanno fallito
  if (!process.env.APPLE_API_KEY && !process.env.APPLE_ID && !process.env.APPLE_KEYCHAIN) {
    console.log('Notarizzazione saltata: nessuna variabile di ambiente per la notarizzazione trovata');
    console.log('Per attivare la notarizzazione, imposta le variabili di ambiente appropriate:');
    console.log('  - APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER (consigliato)');
    console.log('  - APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID');
    console.log('  - APPLE_KEYCHAIN, APPLE_KEYCHAIN_PROFILE');
  } else {
    console.error('Tutti i metodi di notarizzazione disponibili hanno fallito. Verifica le credenziali.');
  }
};