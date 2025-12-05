# 📦 Installazione HudlOps

## Come installare HudlOps sul tuo Mac

### Passo 1: Scarica il file
Hai ricevuto il file **`HudlOps-1.0.0-arm64.dmg`**

### Passo 2: Apri il DMG
Fai doppio clic sul file DMG scaricato.

### Passo 3: Installa l'applicazione
Trascina l'icona di **HudlOps** nella cartella **Applicazioni**.

### Passo 4: Prima apertura

Quando apri HudlOps per la **prima volta**, potresti vedere questo messaggio:

```
❌ "HudlOps è danneggiato e non può essere aperto. 
    Dovresti spostarlo nel Cestino."
```

**Non preoccuparti!** Questo è normale per le app distribuite internamente. 
L'app è **firmata e sicura**, ma non è stata notarizzata da Apple.

---

## ✅ Soluzione (scegli una delle due opzioni)

### **Opzione A: Usa il Terminale** (più veloce)

1. Apri **Terminale** (da Applicazioni → Utility → Terminale)
2. Copia e incolla questo comando:
   ```bash
   xattr -cr /Applications/HudlOps.app
   ```
3. Premi **Invio**
4. Apri HudlOps normalmente

---

### **Opzione B: Apri con clic destro** (più semplice)

1. Vai in **Applicazioni**
2. Trova **HudlOps**
3. **Tieni premuto Control** e clicca sull'app (oppure **clic destro**)
4. Seleziona **"Apri"** dal menu
5. Clicca **"Apri"** nella finestra di conferma

---

## 🎉 Fatto!

Dopo il primo avvio, HudlOps si aprirà normalmente ogni volta.

---

## ℹ️ Informazioni tecniche

- **Versione**: 1.0.0
- **Architettura**: Apple Silicon (ARM64)
- **Firma digitale**: ✅ Firmata con certificato Developer ID di Enzo Pellegrino
- **Compatibilità**: macOS 11.0 (Big Sur) o successivo su Mac con chip Apple Silicon (M1/M2/M3)

---

## 🆘 Problemi?

Se hai problemi con l'installazione, contatta il team IT.

**Verifica la firma digitale** (opzionale, per utenti esperti):
```bash
codesign -dv /Applications/HudlOps.app
```

Dovresti vedere:
```
Authority=Developer ID Application: Enzo Pellegrino (T4T6H838Y2)
```
