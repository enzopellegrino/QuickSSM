/**
 * Modulo per la gestione delle sessioni AWS SSM usando direttamente le API AWS v3
 */
const { SSMClient, StartSessionCommand, TerminateSessionCommand } = require('@aws-sdk/client-ssm');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const WebSocket = require('ws');
const crypto = require('crypto');

class SsmSession {
  /**
   * Crea una nuova sessione SSM
   * @param {Object} options - Opzioni di configurazione
   * @param {string} options.profile - Profilo AWS da utilizzare
   * @param {string} options.region - Regione AWS
   * @param {string} options.instanceId - ID dell'istanza EC2
   * @param {Function} options.onData - Callback per i dati in arrivo dalla sessione
   * @param {Function} options.onError - Callback per gli errori
   * @param {Function} options.onClose - Callback per la chiusura della sessione
   */
  constructor(options) {
    this.profile = options.profile;
    this.region = options.region;
    this.instanceId = options.instanceId;
    this.onData = options.onData || (() => {});
    this.onError = options.onError || console.error;
    this.onClose = options.onClose || (() => {});
    
    this.sessionId = null;
    this.tokenValue = null;
    this.streamUrl = null;
    this.ws = null;
    this.client = null;
    this.isConnected = false;
    this.pingInterval = null;
    
    // Genera un ID cliente univoco
    this.clientId = crypto.randomUUID();
  }

  /**
   * Avvia la sessione SSM
   */
  async start() {
    try {
      this.onData(`\r\n\x1b[33mConnessione all'istanza ${this.instanceId} con profilo ${this.profile}...\x1b[0m\r\n`);
      
      // Crea il client SSM con le credenziali dal profilo
      this.client = new SSMClient({
        region: this.region,
        credentials: fromIni({ profile: this.profile }),
      });

      this.onData(`\r\n\x1b[32mCredenziali caricate, avvio sessione...\x1b[0m\r\n`);

      // Avvia la sessione SSM usando il documento standard che richiede meno permessi
      const startSessionResponse = await this.client.send(
        new StartSessionCommand({
          Target: this.instanceId
          // Non specifichiamo DocumentName per usare quello predefinito
          // che richiede solo permessi di base ssm:StartSession
        })
      );
      
      // Estrai i dati di sessione dalla risposta
      this.sessionId = startSessionResponse.SessionId;
      this.tokenValue = startSessionResponse.TokenValue;
      this.streamUrl = startSessionResponse.StreamUrl;

      // Notifica l'avvio della sessione
      this.onData(`\r\n\x1b[32mSessione SSM avviata, ID: ${this.sessionId.substring(0, 8)}...\x1b[0m\r\n`);
      
      // Stabilisci la connessione WebSocket
      await this.establishWebSocketConnection();
      
      return true;
    } catch (error) {
      let errorMessage = `\r\n\x1b[31mErrore nell'avvio della sessione SSM: ${error.message}\x1b[0m\r\n`;
      
      if (error.name === 'ExpiredTokenException' || error.message.includes('expired')) {
        errorMessage += `\r\n\x1b[33mLe credenziali AWS sono scadute. Esegui 'aws sso login --profile ${this.profile}' in un terminale e riprova.\x1b[0m\r\n`;
      } else if (error.name === 'AccessDeniedException') {
        errorMessage += `\r\n\x1b[33mPermessi insufficienti. Verifica che il profilo ${this.profile} abbia i permessi SSM necessari.\x1b[0m\r\n`;
      } else if (error.message.includes('Target not connected')) {
        errorMessage += `\r\n\x1b[33mL'istanza ${this.instanceId} non è connessa al servizio SSM. Verifica che l'agente SSM sia in esecuzione sull'istanza.\x1b[0m\r\n`;
      }
      
      try {
        this.onError(errorMessage);
      } catch (e) {
        console.error("Impossibile inviare errore al renderer:", e);
      }
      
      return false;
    }
  }

  /**
   * Stabilisce la connessione WebSocket con il servizio SSM
   */
  async establishWebSocketConnection() {
    return new Promise((resolve, reject) => {
      try {
        // Notifica di avvio connessione WebSocket
        try {
          this.onData(`\r\n\x1b[33mStabilisco la connessione WebSocket...\x1b[0m\r\n`);
        } catch (e) {
          console.warn("Notifica WebSocket fallita:", e);
        }
        
        // Crea una nuova connessione WebSocket
        this.ws = new WebSocket(this.streamUrl, {
          headers: {
            'Cookie': `awsSessionToken=${this.tokenValue}`,
          },
          rejectUnauthorized: true,
          // Aumentiamo ulteriormente il timeout di connessione
          handshakeTimeout: 60000  // 60 secondi
        });

        // Timeout di connessione più lungo
        let connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            try {
              this.onData(`\r\n\x1b[31mTimeout nella connessione WebSocket dopo 60 secondi\x1b[0m\r\n`);
            } catch (e) {
              console.warn("Notifica timeout fallita:", e);
            }
            reject(new Error('Timeout nella connessione WebSocket'));
          }
        }, 60000);

        this.ws.on('open', () => {
          this.isConnected = true;
          // Puliamo il timeout quando la connessione è stabilita
          clearTimeout(connectionTimeout);
          
          try {
            this.onData(`\r\n\x1b[32mConnessione stabilita con l'istanza ${this.instanceId}\x1b[0m\r\n`);
          } catch (e) {
            console.warn("Notifica connessione stabilita fallita:", e);
          }
          
          // Inizia il ping periodico per mantenere viva la connessione
          this.pingInterval = setInterval(() => {
            try {
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Invia un ping per mantenere attiva la connessione
                this.ws.ping();
              }
            } catch (error) {
              console.error('Errore durante il ping:', error);
            }
          }, 30000); // Ping ogni 30 secondi
          
          // Invia una sequenza di comandi per inizializzare correttamente la shell
          setTimeout(() => {
            // Prima inviamo un ritorno a capo per pulire eventuali output pendenti
            this.sendInput('\r\n');
            
            // Poi impostiamo una shell bash con il prompt standard
            setTimeout(() => {
              this.sendInput('export PS1="\\u@\\h:\\w\\$ "\r\n');
              
              // Dopo un altro breve ritardo, un comando echo per verificare che tutto funzioni
              setTimeout(() => {
                this.sendInput('echo "Connessione SSH stabilita - Terminale pronto"\r\n');
              }, 500);
            }, 500);
          }, 1000);
          
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            // Prima verifichiamo se il messaggio contiene binari incomprensibili
            const isBinaryGarbage = Buffer.isBuffer(data) && data.some(byte => byte < 32 && ![9, 10, 13].includes(byte));
            
            // Converti i dati in stringa per l'analisi iniziale
            let dataString;
            try {
              dataString = data.toString('utf8');
            } catch (e) {
              // Se fallisce, tenta di trattarlo come binario
              dataString = data.toString('binary');
            }
            
            // Log dei dati grezzi in modalità debug
            if (process.env.DEBUG) {
              console.log('Dati ricevuti (raw):', dataString.substring(0, 100) + (dataString.length > 100 ? '...' : ''));
            }
            
            // Caso speciale per output_stream_data o contenuto binario
            if (dataString.includes('output_stream_data') || isBinaryGarbage) {
              // Per i dati binari non interpretabili, inviamo un messaggio una sola volta
              // invece di continuare a inviare prompt che impediscono l'input
              try {
                // Invia un solo prompt iniziale se è la prima connessione
                if (!this.initialPromptSent) {
                  this.initialPromptSent = true;
                  
                  // Invia un comando di inizializzazione per stabilire l'ambiente shell
                  setTimeout(() => {
                    this.sendInput('\r\n');
                  }, 500);
                  
                  // Questo è per mostrare un feedback che la connessione è attiva
                  this.onData('\r\nConnessione stabilita. Usa la shell normalmente.\r\n');
                }
                
                // Assicuriamoci che i dati vengano processati ma non inviano prompt excessivi
                return;
              } catch (callbackErr) {
                console.warn('Callback onData fallita:', callbackErr.message);
                return;
              }
            }
            
            // Se il messaggio contiene sequenze di escape del terminale o ritorni a capo, è output valido
            if (dataString.includes('\u001B[') || dataString.includes('\r\n')) {
              try {
                this.onData(dataString);
                return;
              } catch (callbackErr) {
                console.warn('Callback onData fallita:', callbackErr.message);
                return;
              }
            }
            
            // Gestione speciale per messaggi JSON formattati correttamente
            const trimmedData = dataString.trim();
            if (trimmedData.startsWith('{') && trimmedData.endsWith('}')) {
              try {
                const message = JSON.parse(trimmedData);
                
                // Verifica che message sia un oggetto
                if (!message || typeof message !== 'object') {
                  return;
                }
                
                // Gestisci diversi tipi di messaggi
                if (message.type === 'stdout' && message.payload) {
                  try {
                    const output = Buffer.from(message.payload, 'base64').toString('utf-8');
                    this.onData(output);
                  } catch (e) {
                    // Fallback: invia il payload grezzo
                    this.onData(message.payload);
                  }
                } else if (message.type === 'error') {
                  const errorMsg = message.error || 'Errore sconosciuto';
                  this.onError(`\r\n\x1b[31mErrore dal server SSM: ${errorMsg}\x1b[0m\r\n`);
                } else if (message.output) {
                  // Formato alternativo 
                  this.onData(message.output);
                } else if (message.content) {
                  this.onData(message.content);
                }
              } catch (jsonError) {
                // Non è JSON valido, ma potrebbe comunque contenere dati utili
                this.onData(dataString);
              }
            } else {
              // Non è JSON, ma potrebbe essere testo utile
              if (dataString && dataString.trim() !== '') {
                try {
                  this.onData(dataString);
                } catch (callbackErr) {
                  console.warn('Callback onData fallita:', callbackErr.message);
                }
              }
            }
          } catch (error) {
            // Errore generale nella gestione dei messaggi
            console.error(`Errore nell'elaborazione del messaggio:`, error);
            
            try {
              // Invia un messaggio generico di errore
              this.onData(`\r\n\x1b[31mErrore nella decodifica del messaggio dal server SSM\x1b[0m\r\n`);
            } catch (callbackErr) {
              console.warn('Callback onData fallita:', callbackErr.message);
            }
          }
        });

        // Gestione dei ping/pong
        this.ws.on('ping', () => {
          if (process.env.DEBUG) console.log('Ping ricevuto dal server');
          // Rispondiamo automaticamente con un pong (gestito internamente da ws)
        });
        
        this.ws.on('pong', () => {
          if (process.env.DEBUG) console.log('Pong ricevuto dal server');
        });

        this.ws.on('error', (error) => {
          this.onError(`\r\n\x1b[31mErrore WebSocket: ${error.message}\x1b[0m\r\n`);
          
          // Non terminiamo immediatamente, proviamo a riconnetterci
          if (this.isConnected) {
            this.onData(`\r\n\x1b[33mTentativo di riconnessione...\x1b[0m\r\n`);
            // La riconnessione verrà gestita dall'evento 'close'
          } else {
            reject(error);
          }
        });

        this.ws.on('close', (code, reason) => {
          this.isConnected = false;
          
          // Ferma il ping periodico
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
          
          const reasonStr = reason ? `: ${reason.toString()}` : '';
          this.onData(`\r\n\x1b[33mConnessione WebSocket chiusa (codice: ${code}${reasonStr})\x1b[0m\r\n`);
          
          this.onClose();
        });
      } catch (error) {
        this.onError(`\r\n\x1b[31mErrore nella connessione WebSocket: ${error.message}\x1b[0m\r\n`);
        reject(error);
      }
    });
  }

  /**
   * Invia input alla sessione SSM
   * @param {string} data - Dati da inviare
   */
  sendInput(data) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (data && data.trim() !== '') {  // Non mostriamo errori per i ping vuoti
        this.onError("\r\n\x1b[31mSessione non connessa\x1b[0m\r\n");
      }
      return;
    }

    try {
      // Codifica i dati come payload binario
      const payload = Buffer.from(data).toString('base64');
      
      // Crea il messaggio da inviare
      const message = {
        type: 'stdin',
        payload,
        clientId: this.clientId,
        TokenValue: this.tokenValue,
        sessionId: this.sessionId
      };
      
      // Log di debug dell'invio (solo in modalità debug)
      if (process.env.DEBUG) {
        console.log('Invio comando:', data.replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
      }
      
      // Invia il messaggio tramite WebSocket
      this.ws.send(JSON.stringify(message));
      
      // Se il comando contiene un ritorno a capo, inviamo anche un eco locale
      // per migliorare l'interattività percepita
      if (data.includes('\r\n') || data.includes('\n')) {
        const localEcho = data.replace(/\r\n|\n/g, '');
        if (localEcho.trim()) {
          try {
            // Non richiamare direttamente this.onData per evitare loop
          } catch (e) {
            // Ignora errori nell'eco locale
          }
        }
      }
    } catch (error) {
      if (data && data.trim() !== '') {  // Non mostriamo errori per i ping vuoti
        this.onError(`\r\n\x1b[31mErrore nell'invio dell'input: ${error.message}\x1b[0m\r\n`);
      }
    }
  }

  /**
   * Ridimensiona il terminale
   * @param {number} cols - Numero di colonne
   * @param {number} rows - Numero di righe
   */
  resize(cols, rows) {
    if (!this.isConnected || !this.ws) {
      return;
    }

    try {
      this.ws.send(JSON.stringify({
        type: 'resize',
        cols,
        rows,
        clientId: this.clientId,
        sessionId: this.sessionId,
        TokenValue: this.tokenValue  // Corretto da 'token' a 'TokenValue' per coerenza con l'API SSM
      }));
    } catch (error) {
      this.onError(`\r\n\x1b[31mErrore nel ridimensionamento del terminale: ${error.message}\x1b[0m\r\n`);
    }
  }

  /**
   * Chiude la sessione SSM
   */
  async terminate() {
    // Ferma il ping periodico
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Chiudi WebSocket se esistente
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.error('Errore nella chiusura del WebSocket:', e);
      }
    }

    // Termina la sessione SSM se abbiamo un ID sessione
    if (this.sessionId && this.client) {
      try {
        await this.client.send(
          new TerminateSessionCommand({
            SessionId: this.sessionId
          })
        );
        this.onData("\r\n\x1b[32mSessione SSM terminata correttamente\x1b[0m\r\n");
      } catch (error) {
        // Ignoriamo errori di AccessDeniedException per TerminateSession
        if (!error.name?.includes('AccessDeniedException')) {
          this.onError(`\r\n\x1b[31mErrore nella terminazione della sessione: ${error.message}\x1b[0m\r\n`);
        }
      }
    }

    // Reset variabili di istanza
    this.sessionId = null;
    this.tokenValue = null;
    this.streamUrl = null;
    this.ws = null;
    this.isConnected = false;
  }
}

module.exports = { SsmSession };