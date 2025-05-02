# HudlOps - Gestione Sessioni SSM per AWS

HudlOps è un'applicazione desktop che semplifica la gestione e l'avvio di sessioni AWS Systems Manager (SSM) verso istanze EC2. Permette di navigare facilmente tra profili AWS, regioni e istanze, e avviare sessioni di terminale direttamente nell'applicazione o nel terminale di sistema.

![Screenshot applicazione](src/screenshot.png)

## Funzionalità principali

- 🔄 Gestione di sessioni SSM multiple in tab
- 🔐 Supporto per profili AWS multipli, incluso AWS SSO
- 🌎 Selezione di regioni AWS
- 🖥️ Visualizzazione e selezione di istanze EC2 
- 📝 Terminale integrato con supporto xterm completo
- 🐚 Opzione per aprire sessioni nel terminale di sistema

## Requisiti

- AWS CLI installato e configurato
- Node.js v14+ (per lo sviluppo)
- Profili AWS configurati in `~/.aws/config` o `~/.aws/credentials`
- Permessi IAM appropriati per SSM (`ssm:StartSession`, `ssm:DescribeInstanceInformation`)

## Installazione

### Da binari precompilati

1. Scarica l'ultima versione dall'area Releases
2. Estrai il file zip (Windows/Linux) o installa il file .dmg (macOS)
3. Avvia l'applicazione HudlOps

### Da sorgente

```bash
# Clona il repository
git clone https://github.com/yourusername/hudlops.git
cd hudlops

# Installa le dipendenze
npm install

# Avvia l'applicazione in modalità sviluppo
npm start

# Build dell'applicazione
npm run dist
```

## Risoluzione dei problemi comuni

### Errore 254 durante l'avvio della sessione SSM

Questo errore indica un problema di connessione con l'istanza. Possibili cause:

1. **Credenziali scadute**: Le tue credenziali AWS potrebbero essere scadute.
   - Soluzione: Esegui `aws sso login --profile <nome-profilo>` o usa il pulsante "Setup SSO Session"

2. **Istanza non connessa a SSM**: L'istanza EC2 non è registrata con AWS Systems Manager.
   - Verifica che l'agente SSM sia installato e in esecuzione sull'istanza
   - Controlla che l'istanza abbia accesso a internet o endpoint VPC per SSM
   - Assicurati che l'istanza abbia un ruolo IAM con i permessi necessari per SSM

3. **Permessi insufficienti**: Il tuo utente/ruolo AWS non ha i permessi necessari.
   - Verifica di avere almeno i permessi `ssm:StartSession`

4. **Problemi di rete**: Possibili problemi di connettività tra l'applicazione e AWS.
   - Verifica la tua connessione internet
   - Controlla eventuali problemi con firewall o VPN

### Usa lo strumento di diagnostica

HudlOps include uno strumento di diagnostica che può aiutarti a identificare la causa dei problemi di connessione:

1. Seleziona un profilo e un'istanza
2. Clicca sul pulsante "🔍 Diagnostica Connessione"
3. Analizza i risultati per identificare e risolvere il problema

### Soluzione alternativa: Terminale nativo

Se riscontri problemi con il terminale integrato, puoi utilizzare il pulsante "🖥️ Open in Terminal" per avviare la sessione SSM nel terminale di sistema nativo, che potrebbe funzionare meglio in alcuni ambienti.

## Sviluppo

HudlOps è sviluppato utilizzando:

- Electron per l'interfaccia desktop
- AWS SDK v3 per JavaScript
- node-pty per l'integrazione del terminale
- xterm.js per l'emulazione del terminale

### Struttura del progetto

```
hudlops/
  ├── main.js            # Processo principale Electron
  ├── package.json       # Configurazione del progetto
  ├── src/
  │   ├── aws-ssm-api.js # API per AWS SSM
  │   ├── index.html     # UI dell'applicazione
  │   └── renderer.js    # Logica dell'interfaccia utente
  └── build/
      └── ...            # File per il packaging
```

## Licenza

MIT