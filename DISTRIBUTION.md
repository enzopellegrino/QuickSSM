# QuickSSM - Distribution Guide

## 📦 Preparazione per la Distribuzione Pubblica

### 1. ✅ Code Signing (Già Configurato)
- **Certificato trovato**: `Developer ID Application: Enzo Pellegrino (T4T6H838Y2)`
- Il certificato è valido per firmare app distribuite fuori dal Mac App Store

### 2. 🔧 Configurazioni Necessarie

#### A. Aggiornare AppID
Cambiare `com.hudl.ops` in un dominio personale:
```json
"appId": "com.enzopellegrino.quickssm"
```

#### B. Bundling AWS CLI
**OPZIONE 1: Non includere AWS CLI (Consigliata)**
- Più semplice e leggera
- Documentare che l'utente deve installare AWS CLI separatamente
- Fornire istruzioni chiare nel README

**OPZIONE 2: Includere AWS CLI Universal Binary**
- Scaricare AWS CLI v2 universal binary per macOS
- Includerlo nelle `extraResources`
- Dimensione: ~60MB aggiuntivi
- Richiede aggiornamenti periodici

#### C. Notarizzazione Apple (Obbligatoria per macOS 10.15+)
Necessaria per evitare il warning "app non verificata" su macOS Catalina+

### 3. 📋 Checklist Pre-Distribuzione

- [ ] Aggiornare `appId` in package.json
- [ ] Creare file `.env` con credenziali Apple
- [ ] Aggiornare versione in package.json
- [ ] Creare entitlements per sandbox
- [ ] Testare build firmata localmente
- [ ] Creare README con istruzioni installazione
- [ ] Aggiungere LICENSE file
- [ ] Creare release notes
- [ ] Testare su macOS pulito (senza AWS CLI)

### 4. 🔐 Setup Notarizzazione

Serve:
1. **Apple ID** (già hai: quello del Developer Program)
2. **App-specific password** (da generare su appleid.apple.com)
3. **Team ID**: T4T6H838Y2

Creare file `.env`:
```bash
APPLE_ID=your-apple-id@email.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=T4T6H838Y2
```

### 5. 🚀 Comandi di Build

```bash
# Build senza firma (test)
npm run dist:mac-unsigned

# Build con firma
npm run dist:mac

# Build con firma + notarizzazione
npm run dist:mac-env
```

### 6. 📝 Documentazione Utente

Creare nel README:
- Requisiti di sistema (macOS 10.15+)
- Come installare AWS CLI v2
- Come configurare AWS SSO
- Screenshot dell'app
- Troubleshooting comune

### 7. 🔍 Testing

Prima del rilascio testare su:
- [ ] macOS Sonoma (latest)
- [ ] macOS Ventura
- [ ] macOS Monterey
- [ ] Sistema pulito senza AWS CLI
- [ ] Sistema con AWS CLI già installato
- [ ] Diversi profili AWS (SSO, IAM, multi-account)

### 8. 📤 Distribuzione

**Opzioni**:
1. **GitHub Releases** (Consigliata)
   - Upload DMG firmata e notarizzata
   - Include release notes
   - Automatizzabile con GitHub Actions

2. **Homebrew Cask**
   - Dopo il primo rilascio su GitHub
   - Richiede PR su homebrew-cask

3. **Website proprietario**
   - Hosting DMG su CDN
   - Sparkle per auto-update

### 9. 💰 Costi

- **Developer ID**: $99/anno (già pagato)
- **Notarizzazione**: Gratuita
- **Hosting DMG**: Gratuito su GitHub Releases

### 10. 🔄 Workflow Consigliato

1. Bump version in package.json
2. Update CHANGELOG.md
3. Commit changes
4. Create git tag (v1.0.0)
5. Run `npm run dist:mac-env`
6. Upload DMG to GitHub Releases
7. Announce on Twitter/LinkedIn

### 11. 🆘 Risorse

- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [AWS CLI Installation](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
