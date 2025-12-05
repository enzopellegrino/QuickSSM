# 🚀 QuickSSM - Prossimi Passi per il Rilascio

## ✅ Completato

1. ✅ **Code Signing Setup**
   - Certificato trovato: `Developer ID Application: Enzo Pellegrino (T4T6H838Y2)`
   - Configurazione nel package.json aggiornata

2. ✅ **AppID Aggiornato**
   - Cambiato da `com.hudl.ops` a `com.enzopellegrino.quickssm`

3. ✅ **Documentazione Creata**
   - README.md con istruzioni complete
   - DISTRIBUTION.md con guida tecnica
   - CHANGELOG.md per tracking versioni
   - LICENSE (MIT)
   - .env.example per notarizzazione

4. ✅ **Repository Pulito**
   - Tutti i file committati su GitHub
   - Struttura pronta per il rilascio

---

## 🔜 Prossimi Passi

### 1. Setup Notarizzazione (30 minuti)

**a) Crea App-Specific Password:**
1. Vai su https://appleid.apple.com/account/manage
2. Sezione "Sign-In and Security"
3. Clicca "App-Specific Passwords"
4. Genera nuova password per "QuickSSM Builder"
5. Copia la password (formato: `xxxx-xxxx-xxxx-xxxx`)

**b) Crea file .env:**
```bash
cd /Users/enzo.pellegrino/Progetti/QuickSSM
cp .env.example .env
nano .env
```

Inserisci:
```
APPLE_ID=tuo-apple-id@email.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=T4T6H838Y2
```

**c) Aggiungi .env al .gitignore:**
```bash
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Add .env to gitignore"
git push
```

### 2. Primo Build di Test (10 minuti)

**Test build non firmato:**
```bash
npm run dist:mac-unsigned
```

Verifica:
- Si crea `dist/QuickSSM-1.0.0.dmg`
- L'app si apre correttamente
- Tutte le funzioni funzionano

### 3. Build Firmato (15 minuti)

```bash
npm run dist:mac-env
```

Questo processo:
1. Compila l'app
2. Firma con il tuo certificato
3. Crea DMG
4. Carica su Apple per notarizzazione
5. Attende approvazione (~5-10 minuti)
6. Staple della notarizzazione al DMG

**Output atteso:**
```
✔ Building DMG
✔ Building universal macOS image for arch x64, arm64 using self-signing
✔ Notarizing app with Apple
✔ Done after 10m 23s
```

### 4. Testing Finale (20 minuti)

**Test su macOS pulito:**
1. Apri la DMG
2. Trascina in Applications
3. Lancia l'app
4. **NON dovrebbe apparire**: "app danneggiata" o "sviluppatore non identificato"
5. Testa tutte le funzionalità

**Checklist test:**
- [ ] App si apre senza warning
- [ ] Rileva AWS CLI
- [ ] Carica profili AWS
- [ ] Connessione singola funziona
- [ ] Connessione multipla funziona
- [ ] Select All/Deselect All funzionano
- [ ] Ricerca istanze funziona
- [ ] Chiusura tab funziona
- [ ] Logo centrale appare quando vuoto

### 5. Creazione Release GitHub (15 minuti)

```bash
# Tag versione
git tag -a v1.0.0 -m "QuickSSM v1.0.0 - First public release"
git push origin v1.0.0
```

**Su GitHub:**
1. Vai su https://github.com/enzopellegrino/QuickSSM/releases
2. Clicca "Draft a new release"
3. Scegli tag: `v1.0.0`
4. Titolo: `QuickSSM v1.0.0 - First Release 🚀`
5. Descrizione:
   ```markdown
   ## QuickSSM v1.0.0 - First Public Release
   
   Fast and beautiful AWS Session Manager for EC2 instances.
   
   ### Features
   - Multi-instance SSM sessions
   - Bulk operations with Select All
   - Beautiful dark mode UI
   - AWS SSO support
   
   ### Requirements
   - macOS 10.15+
   - AWS CLI v2
   
   ### Installation
   1. Download QuickSSM.dmg
   2. Open and drag to Applications
   3. Launch QuickSSM
   
   See [README](https://github.com/enzopellegrino/QuickSSM#readme) for full docs.
   ```
6. Upload `dist/QuickSSM-1.0.0.dmg`
7. Spunta "Set as the latest release"
8. Clicca "Publish release"

### 6. Verifica Finale

**Download dalla release:**
```bash
# Download dal browser
open https://github.com/enzopellegrino/QuickSSM/releases/latest

# Oppure via curl
curl -L -o QuickSSM.dmg \
  https://github.com/enzopellegrino/QuickSSM/releases/download/v1.0.0/QuickSSM-1.0.0.dmg
```

**Test installazione:**
1. Scarica DMG dalla release
2. Installa in /Applications
3. Apri senza warning di sicurezza
4. Testa tutte le funzioni

---

## 🎯 Decisioni da Prendere

### AWS CLI Bundling

**❌ NON Includere (Consigliato):**
- ✅ App più leggera (~150MB vs ~210MB)
- ✅ Utenti hanno già AWS CLI installato
- ✅ Nessun problema di aggiornamenti
- ✅ Più semplice da mantenere
- ❌ Richiede installazione separata

**✅ Includere:**
- ✅ Tutto incluso, zero setup
- ❌ +60MB di dimensione
- ❌ Richiede aggiornamenti quando AWS rilascia nuove versioni
- ❌ Più complesso da configurare

**Raccomandazione:** NON includere. Documentare chiaramente nel README come installare AWS CLI.

---

## 📊 Timeline Stimata

| Fase | Tempo | Quando |
|------|-------|--------|
| Setup notarizzazione | 30 min | Adesso |
| Build test | 10 min | Oggi |
| Build firmato | 15 min | Oggi |
| Testing | 20 min | Oggi |
| Release GitHub | 15 min | Oggi |
| **TOTALE** | **~90 min** | **Oggi!** |

---

## 🐛 Troubleshooting

### Notarizzazione fallisce

```bash
# Verifica credenziali
export $(grep -v '^#' .env | xargs)
echo $APPLE_ID
echo $APPLE_TEAM_ID
```

### DMG non firmata correttamente

```bash
# Verifica firma
codesign -dv --verbose=4 /Applications/QuickSSM.app

# Verifica notarizzazione  
spctl -a -vv /Applications/QuickSSM.app
```

### Build troppo lento

```bash
# Build solo per architettura corrente (più veloce)
electron-builder --mac --x64  # Intel
# oppure
electron-builder --mac --arm64  # Apple Silicon
```

---

## 📞 Prossimi Comandi

```bash
# 1. Setup notarizzazione
cp .env.example .env
nano .env  # Inserisci credenziali

# 2. Build di test
npm run dist:mac-unsigned

# 3. Build finale firmato
npm run dist:mac-env

# 4. Tag e release
git tag -a v1.0.0 -m "First release"
git push origin v1.0.0
```

---

## 🎉 Dopo il Rilascio

1. **Annuncia su LinkedIn/Twitter**
2. **Condividi con colleghi @ Hudl**
3. **Considera Homebrew Cask** (dopo qualche download)
4. **Monitor feedback** su GitHub Issues
5. **Pianifica v1.1.0** con nuove feature

---

**Pronto per iniziare?** Inizia con il setup della notarizzazione! 🚀
