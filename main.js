const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const { SsmSession } = require('./src/aws-ssm-api');

// Definisci un percorso AWS predefinito
const DEFAULT_AWS_PATH = '/Users/enzo.pellegrino/homebrew/bin/aws';

// Funzione per trovare il percorso di AWS CLI
function findAwsCliPath() {
  try {
    // Controlla se esiste il percorso predefinito
    if (fs.existsSync(DEFAULT_AWS_PATH)) {
      console.log('AWS CLI trovato in:', DEFAULT_AWS_PATH);
      return DEFAULT_AWS_PATH;
    }
    
    // Altri percorsi comuni su macOS
    const macPaths = [
      '/usr/local/bin/aws',
      '/opt/homebrew/bin/aws',
      '/usr/bin/aws',
      `${os.homedir()}/homebrew/bin/aws`,
      `${os.homedir()}/.local/bin/aws`
    ];
    
    for (const p of macPaths) {
      if (fs.existsSync(p)) {
        console.log('AWS CLI trovato in:', p);
        return p;
      }
    }
    
    // Prova a rilevare il percorso tramite which/where
    try {
      let awsPath;
      if (process.platform === 'win32') {
        awsPath = execSync('where aws').toString().trim().split('\n')[0];
      } else {
        awsPath = execSync('which aws').toString().trim();
      }
      
      if (awsPath && fs.existsSync(awsPath)) {
        console.log('AWS CLI trovato tramite which/where:', awsPath);
        return awsPath;
      }
    } catch (e) {
      console.log('Impossibile trovare AWS CLI tramite which/where');
    }
    
    // Fallback: usa il comando aws senza percorso
    return 'aws';
  } catch (error) {
    console.warn('Errore nella ricerca del percorso AWS CLI:', error);
    return 'aws';  // Fallback al comando aws di base
  }
}

// Trova il percorso AWS CLI una volta all'avvio
const AWS_CLI_PATH = findAwsCliPath();
console.log('Utilizzando AWS CLI path:', AWS_CLI_PATH);

let mainWindow;
const sessions = {}; // sessionId -> processo o oggetto di sessione

// Creo una nuova funzione di inizializzazione che controlla solo le credenziali AWS
async function checkAwsCredentials() {
  const { fromIni } = require('@aws-sdk/credential-provider-ini');
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  return new Promise((resolve) => {
    // Verifica se il file di configurazione AWS esiste
    const awsConfigPath = path.join(os.homedir(), '.aws', 'config');
    const awsCredsPath = path.join(os.homedir(), '.aws', 'credentials');
    
    if (!fs.existsSync(awsConfigPath) && !fs.existsSync(awsCredsPath)) {
      console.warn('File di configurazione AWS non trovati');
      const result = dialog.showMessageBox({
        type: 'warning',
        title: 'Configurazione AWS mancante',
        message: 'I file di configurazione AWS non sono stati trovati',
        detail: 'Per utilizzare questa applicazione:\n\n' +
                '1. Apri il Terminale\n' +
                '2. Esegui: aws configure\n' +
                '   oppure: aws sso login\n' +
                '3. Riavvia questa applicazione',
        buttons: ['Continua comunque', 'Chiudi'],
        defaultId: 0
      });
      
      result.then(res => {
        if (res.response === 1) {
          app.exit(0);
          resolve(false);
        } else {
          resolve(true);
        }
      });
      return;
    }

    // Determina se esiste almeno un profilo che possiamo usare
    // Prima, verifichiamo se esiste un file di credenziali o config
    try {
      // Controlla se c'è almeno un profilo configurato
      let hasProfiles = false;
      
      if (fs.existsSync(awsConfigPath)) {
        const configContent = fs.readFileSync(awsConfigPath, 'utf8');
        hasProfiles = configContent.includes('[profile ') || configContent.includes('[default]');
      }
      
      if (!hasProfiles && fs.existsSync(awsCredsPath)) {
        const credsContent = fs.readFileSync(awsCredsPath, 'utf8');
        hasProfiles = credsContent.includes('[') && credsContent.includes(']');
      }
      
      if (!hasProfiles) {
        console.warn('Nessun profilo AWS trovato nei file di configurazione');
        resolve(true); // Continua comunque
        return;
      }
      
      // A questo punto sappiamo che esiste almeno un profilo
      console.log('Trovati profili AWS, l\'app dovrebbe funzionare correttamente');
      resolve(true);
    } catch (error) {
      console.error('Errore durante la verifica dei profili AWS:', error);
      resolve(true); // Continua comunque
    }
  });
}

// Richiedi autorizzazioni terminal - rimane per compatibilità
async function requestTerminalPermissions() {
  if (process.platform !== 'darwin') return true; // Solo per macOS
  
  return new Promise((resolve) => {
    // Verifica l'accesso al terminale con un comando semplice
    const testProcess = spawn('/bin/bash', ['-c', 'echo "Testing terminal access"']);
    
    testProcess.on('error', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Autorizzazioni richieste',
        message: 'HudlOps potrebbe richiedere autorizzazioni per alcune funzionalità',
        detail: 'Per alcune funzionalità opzionali, l\'app potrebbe richiedere autorizzazioni del terminale. Puoi continuare senza concederle.',
        buttons: ['OK'],
      });
      resolve(true);
    });
    
    testProcess.on('close', () => {
      resolve(true);
    });
  });
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'src/renderer.js'),
      contextIsolation: false,
      nodeIntegration: true
    },
    icon: path.join(__dirname, 'src/icon.png') // Imposta l'icona anche per la finestra
  });

  mainWindow.maximize();
  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(async () => {
  // Verifica credenziali AWS all'avvio (molto più leggero)
  await checkAwsCredentials();
  await requestTerminalPermissions();
  
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Funzione per avviare una sessione SSM nel terminale di sistema (utilizzabile come fallback)
function startNativeTerminalSession(event, { profile, instanceId, region, awsPath }) {
  // Comando per avviare il terminale nativo
  if (os.platform() === 'darwin') { // macOS
    // Usa il percorso AWS individuato all'avvio o il parametro specificato
    const awsCliPath = awsPath || AWS_CLI_PATH;
    // Costruisci un comando SSM sicuro con tutte le variabili d'ambiente necessarie
    // Gestiamo correttamente le virgolette per evitare problemi con AppleScript
    const ssmCommand = `export AWS_PROFILE='${profile}' && export AWS_REGION='${region}' && ${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}`;
    
    // Script AppleScript più robusto con un titolo personalizzato
    // Usiamo virgolette singole per la stringa principale e doppie all'interno
    const script = `tell application "Terminal"
  activate
  do script "${ssmCommand.replace(/"/g, '\\"')}"
  tell window 1
    set custom title to "SSM: ${instanceId} (${profile})"
    set background color to {1000, 5000, 5000}
    set normal text color to {65535, 65535, 65535}
  end tell
end tell`;
    
    const { exec } = require('child_process');
    exec(`osascript -e '${script}'`, (err, stdout, stderr) => {
      if (err) {
        console.error('Error opening terminal:', err);
        safeSend(event, 'native-terminal-error', { error: err.message });
      } else {
        safeSend(event, 'native-terminal-opened');
        console.log('Terminal opened successfully');
      }
    });
  } else if (os.platform() === 'win32') { // Windows
    const { exec } = require('child_process');
    const awsCliPath = awsPath || AWS_CLI_PATH;
    const command = `start cmd.exe /K "${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}"`;
    exec(command, (err) => {
      if (err) {
        console.error('Error opening Windows command prompt:', err);
        safeSend(event, 'native-terminal-error', { error: err.message });
      } else {
        safeSend(event, 'native-terminal-opened');
      }
    });
  } else { // Linux
    const { exec } = require('child_process');
    const awsCliPath = awsPath || AWS_CLI_PATH;
    // Cerca un terminale disponibile su Linux
    const terminals = ['gnome-terminal', 'konsole', 'xterm', 'xfce4-terminal'];
    
    // Comando da eseguire nel terminale
    const command = `${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}`;
    
    // Funzione per trovare e aprire un terminale
    const findAndOpenTerminal = (index) => {
      if (index >= terminals.length) {
        console.error('Nessun terminale trovato su Linux');
        safeSend(event, 'native-terminal-error', { error: 'Nessun terminale supportato trovato' });
        return;
      }
      
      const terminal = terminals[index];
      exec(`which ${terminal}`, (err, stdout) => {
        if (!err && stdout.trim()) {
          let terminalCommand;
          
          if (terminal === 'gnome-terminal') {
            terminalCommand = `gnome-terminal -- bash -c "echo 'Connessione SSM a ${instanceId}...'; ${command}; echo 'Sessione terminata. Premi un tasto per chiudere.'; read -n 1"`;
          } else if (terminal === 'konsole') {
            terminalCommand = `konsole --noclose -e bash -c "echo 'Connessione SSM a ${instanceId}...'; ${command}; echo 'Sessione terminata. Premi un tasto per chiudere.'; read -n 1"`;
          } else if (terminal === 'xterm') {
            terminalCommand = `xterm -hold -e "echo 'Connessione SSM a ${instanceId}...'; ${command}; echo 'Sessione terminata. Premi un tasto per chiudere.'; read -n 1"`;
          } else if (terminal === 'xfce4-terminal') {
            terminalCommand = `xfce4-terminal --hold -e "bash -c 'echo Connessione SSM a ${instanceId}...; ${command}; echo Sessione terminata. Premi un tasto per chiudere.; read -n 1'"`;
          }
          
          exec(terminalCommand, (err) => {
            if (err) {
              console.error(`Error opening ${terminal}:`, err);
              findAndOpenTerminal(index + 1);
            } else {
              safeSend(event, 'native-terminal-opened');
              console.log(`Terminal ${terminal} opened successfully`);
            }
          });
        } else {
          findAndOpenTerminal(index + 1);
        }
      });
    };
    
    findAndOpenTerminal(0);
  }
}

// Funzione di utilità per verificare se un WebContents è ancora valido
function isWebContentsValid(contents) {
  try {
    // Se è stato distrutto, questa proprietà solleverà un'eccezione o sarà true
    return contents && !contents.isDestroyed();
  } catch (e) {
    return false;
  }
}

// Funzione sicura per inviare messaggi IPC
function safeSend(event, channel, ...args) {
  try {
    if (event && event.sender && isWebContentsValid(event.sender)) {
      event.sender.send(channel, ...args);
    }
  } catch (error) {
    console.warn(`Impossibile inviare messaggio su ${channel}: ${error.message}`);
  }
}

// Nuova gestione delle sessioni SSM utilizzando node-pty direttamente
ipcMain.on('start-ssm-session', async (event, { profile, instanceId, sessionId, region, awsPath }) => {
  console.log(`Avvio sessione SSM per ${instanceId} con profilo ${profile} in regione ${region} usando node-pty`);
  
  try {
    // Notifica iniziale
    safeSend(event, `terminal-data-${sessionId}`, `\r\n\x1b[33mAvvio sessione SSM per ${instanceId}...\x1b[0m\r\n`);
    
    // Usa il percorso AWS individuato all'avvio o il parametro specificato
    const awsCliPath = awsPath || AWS_CLI_PATH;
    console.log('Utilizzando percorso AWS CLI:', awsCliPath);
    
    // Crea un processo di terminale usando node-pty
    const pty = require('node-pty');
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    
    // Costruisci il comando AWS SSM
    const ssmCommand = `${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}`;
    
    // Ambienti di esecuzione
    const env = {
      ...process.env,
      AWS_PROFILE: profile,
      AWS_REGION: region,
      TERM: 'xterm-color',
      // Aggiungi tutti i percorsi comuni che possono contenere AWS CLI
      PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/opt/local/bin:' + 
            `${os.homedir()}/homebrew/bin:` +
            (process.env.HOME ? `${process.env.HOME}/.local/bin` : '')
    };
    
    // Crea una sessione PTY che esegue il comando AWS SSM
    const ptyProcess = pty.spawn(shell, ['-c', ssmCommand], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      env: env,
      cwd: process.env.HOME
    });
    
    // Salva la sessione PTY
    sessions[sessionId] = ptyProcess;
    
    // Gestisci l'output del processo
    ptyProcess.onData(data => {
      safeSend(event, `terminal-data-${sessionId}`, data);
    });
    
    // Gestisci la chiusura del processo
    ptyProcess.onExit(({ exitCode }) => {
      safeSend(event, `terminal-data-${sessionId}`, `\r\n\x1b[33mSessione terminata con codice ${exitCode}\x1b[0m\r\n`);
      safeSend(event, `terminal-exit-${sessionId}`);
      delete sessions[sessionId];
    });
    
    // Imposta handler per l'input dell'utente
    ipcMain.on(`terminal-input-${sessionId}`, (_, input) => {
      if (sessions[sessionId]) {
        sessions[sessionId].write(input);
      }
    });
    
    // Imposta handler per il ridimensionamento del terminale
    ipcMain.on(`terminal-resize-${sessionId}`, (_, { cols, rows }) => {
      if (sessions[sessionId]) {
        sessions[sessionId].resize(cols, rows);
      }
    });
    
  } catch (error) {
    console.error(`Errore generale nell'avvio della sessione SSM: ${error.message}`);
    safeSend(event, `terminal-data-${sessionId}`, `\r\n\x1b[31mErrore nell'avvio della sessione SSM: ${error.message}\x1b[0m\r\n`);
    
    // In caso di errore grave, offri l'opzione di aprire nel terminale nativo
    if (isWebContentsValid(event.sender)) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Errore sessione SSM',
        message: 'Impossibile avviare la sessione SSM integrata',
        detail: `Errore: ${error.message}\n\nVuoi provare ad aprire la sessione nel terminale di sistema?`,
        buttons: ['Sì', 'No'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          startNativeTerminalSession(event, { profile, instanceId, region, awsPath });
        } else {
          safeSend(event, `terminal-exit-${sessionId}`);
        }
      }).catch(err => console.error('Dialog error:', err));
    }
  }
});

// Funzione di diagnosi per gli errori di connessione SSM
async function diagnoseSsmError(profile, instanceId, region) {
  console.log(`Diagnosi connessione SSM per ${instanceId} con profilo ${profile} in regione ${region}`);
  
  const diagnosticResults = {
    credenzialiValide: false,
    istanzaConnessa: false,
    permessiSufficienti: false,
    dettagli: []
  };
  
  try {
    // Test delle credenziali AWS
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const { fromIni } = require('@aws-sdk/credential-provider-ini');
    
    const stsClient = new STSClient({
      region: region,
      credentials: fromIni({ profile: profile }),
    });
    
    try {
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      diagnosticResults.credenzialiValide = true;
      diagnosticResults.dettagli.push(`✅ Credenziali valide: ${identity.Arn}`);
    } catch (credError) {
      diagnosticResults.dettagli.push(`❌ Credenziali non valide: ${credError.message}`);
      diagnosticResults.dettagli.push('   Prova a eseguire: aws sso login --profile ' + profile);
    }
    
    if (diagnosticResults.credenzialiValide) {
      // Verifica che l'istanza sia connessa a SSM
      const { SSMClient, DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');
      
      const ssmClient = new SSMClient({
        region: region,
        credentials: fromIni({ profile: profile }),
      });
      
      try {
        const response = await ssmClient.send(new DescribeInstanceInformationCommand({
          Filters: [
            {
              Key: "InstanceIds",
              Values: [instanceId]
            }
          ]
        }));
        
        if (response.InstanceInformationList && response.InstanceInformationList.length > 0) {
          diagnosticResults.istanzaConnessa = true;
          const status = response.InstanceInformationList[0].PingStatus;
          diagnosticResults.dettagli.push(`✅ Istanza connessa a SSM (Status: ${status})`);
        } else {
          diagnosticResults.dettagli.push('❌ Istanza NON connessa a SSM. Verificare:');
          diagnosticResults.dettagli.push('   - L\'agente SSM è in esecuzione sull\'istanza');
          diagnosticResults.dettagli.push('   - L\'istanza ha accesso all\'endpoint SSM');
          diagnosticResults.dettagli.push('   - L\'istanza ha un ruolo IAM appropriato');
        }
      } catch (ssmError) {
        if (ssmError.name === 'AccessDeniedException') {
          diagnosticResults.dettagli.push(`❌ Permessi insufficienti per verificare lo stato SSM: ${ssmError.message}`);
        } else {
          diagnosticResults.dettagli.push(`❌ Errore durante la verifica dello stato SSM: ${ssmError.message}`);
        }
      }
      
      // Verifica i permessi per StartSession
      try {
        const { IAMClient, SimulatePrincipalPolicyCommand } = require('@aws-sdk/client-iam');
        
        // Estraiamo l'ARN dell'identità per i test dei permessi
        const identityResponse = await stsClient.send(new GetCallerIdentityCommand({}));
        const principalArn = identityResponse.Arn;
        
        const iamClient = new IAMClient({
          region: region,
          credentials: fromIni({ profile: profile }),
        });
        
        // Test del permesso StartSession
        try {
          const simResponse = await iamClient.send(new SimulatePrincipalPolicyCommand({
            PolicySourceArn: principalArn,
            ActionNames: ['ssm:StartSession'],
            ResourceArns: [`arn:aws:ssm:${region}::document/AWS-StartSSHSession`]
          }));
          
          if (simResponse.EvaluationResults && 
              simResponse.EvaluationResults[0] && 
              simResponse.EvaluationResults[0].EvalDecision === 'allowed') {
            diagnosticResults.permessiSufficienti = true;
            diagnosticResults.dettagli.push('✅ Hai i permessi necessari per ssm:StartSession');
          } else {
            diagnosticResults.dettagli.push('❌ Permessi insufficienti per ssm:StartSession');
            diagnosticResults.dettagli.push('   Il tuo ruolo IAM richiede almeno il permesso ssm:StartSession');
          }
        } catch (iamError) {
          // Alcuni ruoli potrebbero non avere il permesso di simulare le policy
          diagnosticResults.dettagli.push(`ℹ️  Impossibile verificare i permessi: ${iamError.message}`);
          diagnosticResults.dettagli.push('   Questo è normale se stai usando credenziali temporanee');
        }
      } catch (identityError) {
        diagnosticResults.dettagli.push(`ℹ️  Impossibile determinare l'identità per verificare i permessi`);
      }
    }
    
    // Verifica la presenza e il funzionamento dell'AWS CLI
    try {
      const { execSync } = require('child_process');
      const awsVersionTest = execSync('aws --version', { encoding: 'utf8' });
      diagnosticResults.dettagli.push(`✅ AWS CLI trovato: ${awsVersionTest.trim()}`);
    } catch (cliError) {
      diagnosticResults.dettagli.push('❌ AWS CLI non trovato o non funzionante. Verificare che sia installato.');
    }
    
  } catch (error) {
    diagnosticResults.dettagli.push(`❌ Errore durante la diagnosi: ${error.message}`);
  }
  
  return diagnosticResults;
}

// Gestiamo l'evento per avviare la diagnosi
ipcMain.on('diagnose-ssm-connection', async (event, { profile, instanceId, region }) => {
  try {
    const results = await diagnoseSsmError(profile, instanceId, region);
    safeSend(event, 'diagnostic-results', { results });
  } catch (error) {
    safeSend(event, 'diagnostic-results', { 
      error: error.message,
      dettagli: ['Errore durante la diagnosi della connessione']
    });
  }
});

// Termination
ipcMain.on('terminate-session', async (event, sessionId) => {
  if (sessions[sessionId]) {
    console.log(`Terminazione sessione ${sessionId}`);
    
    // Check if it's a PTY session
    if (sessions[sessionId].kill) {
      sessions[sessionId].kill();
      delete sessions[sessionId];
    }
  }
  
  // Remove all related listeners
  ipcMain.removeAllListeners(`terminal-input-${sessionId}`);
  ipcMain.removeAllListeners(`terminal-resize-${sessionId}`);
});
