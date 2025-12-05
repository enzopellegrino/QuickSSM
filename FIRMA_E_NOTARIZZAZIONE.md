# Guida alla Firma e Notarizzazione di HudlOps

Questa guida ti aiuterà a configurare la firma digitale e la notarizzazione dell'applicazione HudlOps per la distribuzione interna su macOS.

## 📋 Prerequisiti

- ✅ Account Apple Developer attivo (hai già questo)
- 🔐 Certificato "Developer ID Application" installato
- 🔑 Password specifica per app generata
- 👥 Team ID dal portale Apple Developer

---

## Passo 1️⃣: Installare il Certificato Developer ID

### 1.1 Accedi al portale Apple Developer
1. Vai su [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
2. Accedi con il tuo Apple ID

### 1.2 Crea il certificato (se non lo hai già)
1. Clicca sul pulsante "+" per creare un nuovo certificato
2. Seleziona **"Developer ID Application"** (per distribuire fuori dall'App Store)
3. Segui le istruzioni per creare un Certificate Signing Request (CSR):
   - Apri **Accesso Portachiavi** sul tuo Mac
   - Menu → Accesso Portachiavi → Assistente Certificato → Richiedi un certificato da un'Autorità di Certificazione
   - Inserisci la tua email
   - Seleziona "Salvata su disco"
   - Clicca Continua
4. Carica il file CSR sul portale Apple Developer
5. Scarica il certificato (.cer) e fai doppio clic per installarlo

### 1.3 Verifica l'installazione
Apri il Terminale e esegui:
```bash
security find-identity -v -p codesigning
```

Dovresti vedere una riga simile a:
```
1) XXXXXXXXXX "Developer ID Application: Il Tuo Nome (TEAMID)"
```

---

## Passo 2️⃣: Ottieni il Team ID

1. Vai su [developer.apple.com/account](https://developer.apple.com/account)
2. Nella sezione "Membership", troverai il tuo **Team ID** (es: `ABCDE12345`)
3. Annotalo, ne avrai bisogno

---

## Passo 3️⃣: Crea una Password Specifica per App

### 3.1 Genera la password
1. Vai su [appleid.apple.com](https://appleid.apple.com)
2. Accedi con il tuo Apple ID
3. Nella sezione **Sicurezza**, trova **Password specifiche per app**
4. Clicca su "Genera una password..."
5. Inserisci un nome (es: "HudlOps Notarization")
6. **Copia e salva** la password generata (formato: `xxxx-xxxx-xxxx-xxxx`)
   ⚠️ Non potrai più visualizzarla dopo aver chiuso la finestra!

---

## Passo 4️⃣: Configura le Variabili d'Ambiente

### Metodo A: Per una singola build (temporaneo)

Nel terminale, prima di eseguire la build:

```bash
export APPLE_ID="tua.email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
```

Poi esegui:
```bash
npm run dist:mac
```

### Metodo B: Configurazione permanente (consigliato)

Aggiungi queste righe al file `~/.zshrc` (o `~/.bash_profile` se usi bash):

```bash
# Credenziali Apple Developer per HudlOps
export APPLE_ID="tua.email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
```

Dopo aver modificato il file, ricarica la configurazione:
```bash
source ~/.zshrc
```

### Metodo C: File .env locale (più sicuro)

1. Crea un file `.env` nella cartella del progetto (già ignorato da git):
```bash
APPLE_ID=tua.email@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=ABCDE12345
```

2. Aggiungi questo script al package.json:
```json
"dist:mac-env": "export $(cat .env | xargs) && electron-builder --mac --publish never"
```

3. Esegui con:
```bash
npm run dist:mac-env
```

---

## Passo 5️⃣: Compila e Notarizza l'App

### Build con firma e notarizzazione
```bash
npm run dist:mac
```

### Cosa succede durante il processo:

1. **Compilazione** dell'app Electron
2. **Firma** dell'applicazione con il certificato Developer ID
3. **Caricamento** su Apple per la notarizzazione (può richiedere 1-5 minuti)
4. **Attesa** dell'approvazione da Apple
5. **Graffatura** (stapling) del ticket di notarizzazione all'app
6. **Creazione** del file DMG e ZIP finali

### Output
I file verranno creati in:
```
dist/
  ├── HudlOps-1.0.0-arm64.dmg          # Per Mac con chip Apple Silicon
  ├── HudlOps-1.0.0-arm64-mac.zip      # Versione ZIP
  └── mac-arm64/
      └── HudlOps.app                   # App firmata e notarizzata
```

---

## 🧪 Verifica della Firma e Notarizzazione

### Verifica la firma
```bash
codesign -dv --verbose=4 dist/mac-arm64/HudlOps.app
```

Dovresti vedere:
```
Authority=Developer ID Application: Il Tuo Nome (TEAMID)
```

### Verifica la notarizzazione
```bash
spctl -a -vv dist/mac-arm64/HudlOps.app
```

Dovresti vedere:
```
dist/mac-arm64/HudlOps.app: accepted
source=Notarized Developer ID
```

### Verifica lo stapling (graffatura)
```bash
stapler validate dist/mac-arm64/HudlOps.app
```

Dovresti vedere:
```
The validate action worked!
```

---

## 📦 Distribuzione

### Opzione 1: Condivisione diretta
- Condividi il file **DMG** o **ZIP** dalla cartella `dist/`
- Gli utenti potranno aprirlo senza messaggi di errore su macOS

### Opzione 2: Hosting interno
- Carica il file su un server interno o cloud storage
- Gli utenti scaricano e installano normalmente

### Opzione 3: Gestione tramite MDM
- Se la tua azienda usa un MDM (Mobile Device Management)
- Distribuisci l'app attraverso il sistema MDM

---

## ⚠️ Risoluzione Problemi

### Errore: "No signing identity found"
**Soluzione**: Il certificato Developer ID non è installato correttamente
```bash
security find-identity -v -p codesigning
```
Se non vedi il certificato, ripeti il Passo 1.

### Errore: "Invalid credentials"
**Soluzione**: Le credenziali non sono corrette
- Verifica che APPLE_ID sia corretto
- Rigenera la password specifica per app se necessario
- Controlla che il TEAM_ID sia esatto

### Errore: "Notarization failed"
**Soluzione**: Controlla i log di notarizzazione
```bash
xcrun notarytool history --apple-id tua.email@example.com --team-id TEAMID
```

### Build senza notarizzazione (solo firma)
Se vuoi solo firmare senza notarizzare (per test rapidi):
```bash
npm run dist:mac-unsigned
```

---

## 🔐 Sicurezza

⚠️ **IMPORTANTE**: Non condividere mai le tue credenziali o commitarle su Git!

- Il file `.env` è già ignorato da git
- Le password specifiche per app possono essere revocate in qualsiasi momento
- Considera l'uso di un password manager per conservarle

---

## 📞 Supporto

Se incontri problemi:
1. Controlla i log della build
2. Verifica i certificati con `security find-identity`
3. Testa la firma con `codesign -dv`
4. Verifica la notarizzazione con `spctl -a -vv`

---

## 📚 Risorse Utili

- [Apple Developer Portal](https://developer.apple.com)
- [Electron Builder - Code Signing](https://www.electron.build/code-signing)
- [Apple - Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [electron-notarize Documentation](https://github.com/electron/notarize)
