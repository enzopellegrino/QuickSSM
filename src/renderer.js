const fs = require('fs');
const path = require('path');
const os = require('os');
const ini = require('ini');
const { ipcRenderer } = require('electron');
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { execSync } = require('child_process');

// Funzione per determinare il percorso completo dell'AWS CLI
function getAwsPath() {
  // Percorsi comuni dove può trovarsi l'eseguibile AWS
  const commonPaths = [
    '/usr/local/bin/aws',
    '/opt/homebrew/bin/aws',
    '/usr/bin/aws',
    '/bin/aws',
    // Aggiungi il percorso in cui l'utente potrebbe avere installato aws tramite pip
    `${os.homedir()}/.local/bin/aws`
  ];
  
  // Verifica se l'AWS CLI esiste in uno dei percorsi comuni
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      console.log('AWS CLI trovato in:', p);
      return p;
    }
  }
  
  // Se non trovato nei percorsi comuni, prova a usare 'which'
  try {
    const awsPath = execSync('which aws', { encoding: 'utf8' }).trim();
    console.log('AWS CLI trovato tramite which:', awsPath);
    return awsPath;
  } catch (e) {
    console.log('Error finding AWS CLI path with which:', e);
    
    // Ultimo tentativo: cerca aws nel PATH
    try {
      const PATH = process.env.PATH || '';
      const pathDirs = PATH.split(':');
      
      for (const dir of pathDirs) {
        const possiblePath = path.join(dir, 'aws');
        if (fs.existsSync(possiblePath)) {
          console.log('AWS CLI trovato in PATH:', possiblePath);
          return possiblePath;
        }
      }
    } catch (pathError) {
      console.log('Error searching AWS CLI in PATH:', pathError);
    }
    
    // Se non è possibile trovarlo, usa una versione di ripiego
    return 'aws'; // Fallback al comando generico
  }
}

// Memorizza il percorso dell'AWS CLI
const awsPath = getAwsPath();
console.log('Using AWS CLI path:', awsPath);

let sessionCounter = 0;
const terminalTabs = document.getElementById('terminalTabs');
const tabsBar = document.getElementById('tabsBar');
const terminals = {};
const sessions = {};

// Carica profili AWS
function loadProfiles() {
  const configPath = path.join(os.homedir(), '.aws', 'config');
  const credsPath = path.join(os.homedir(), '.aws', 'credentials');
  const profiles = new Set();

  [configPath, credsPath].forEach(file => {
    if (fs.existsSync(file)) {
      const data = ini.parse(fs.readFileSync(file, 'utf-8'));
      Object.keys(data).forEach(key => {
        const profileName = key.replace(/^profile /, '').replace(/^sso-session /, '');
        if (!key.startsWith('sso-session')) {
          profiles.add(profileName);
        }
      });
    }
  });

  const select = document.getElementById('profileSelect');
  select.innerHTML = '';

  if (profiles.size === 0) {
    const option = document.createElement('option');
    option.textContent = 'No profiles found';
    option.disabled = true;
    select.appendChild(option);
    return;
  }

  profiles.forEach(profileName => {
    const option = document.createElement('option');
    option.value = profileName;

    const match = profileName.match(/_(\d{12})$/);
    if (match) {
      const accountId = match[1];
      const accountMap = JSON.parse(localStorage.getItem('accountMap') || '{}');
      const accountName = accountMap[accountId];
      option.textContent = accountName ? `${accountName} (${accountId})` : profileName;
    } else {
      option.textContent = profileName;
    }

    select.appendChild(option);
  });

  // Carica istanze EC2
  loadEc2Instances(select.value, document.getElementById('regionSelect').value || 'us-east-1');
  select.addEventListener('change', () => {
    loadEc2Instances(select.value, document.getElementById('regionSelect').value || 'us-east-1');
  });
  document.getElementById('regionSelect').addEventListener('change', () => {
    const profile = document.getElementById('profileSelect').value;
    const region = document.getElementById('regionSelect').value || 'us-east-1';
    if (profile) {
      document.getElementById('ec2LoadingSpinner').style.display = 'block';
      loadEc2Instances(profile, region);
    }
  });

  const loadEc2Button = document.getElementById('loadEc2');
  if (loadEc2Button) {
    loadEc2Button.onclick = () => {
      const profile = document.getElementById('profileSelect').value;
      const region = document.getElementById('regionSelect').value || 'us-east-1';
      if (!profile) {
        alert("Please select an AWS profile first.");
        return;
      }
      // Mostra lo spinner prima di iniziare il caricamento
      document.getElementById('ec2LoadingSpinner').style.display = 'block';
      loadEc2Instances(profile, region);
    };
  }
  
  // Forza un caricamento iniziale
  const initialProfile = document.getElementById('profileSelect')?.value;
  const initialRegion = document.getElementById('regionSelect')?.value || 'us-east-1';
  if (initialProfile) {
    loadEc2Instances(initialProfile, initialRegion);
  }
}

// Sostituisce la funzione loadEc2Instances con una versione che utilizza AWS SDK
async function loadEc2Instances(profile, region) {
  const ec2Container = document.getElementById('ec2MultiselectContainer');
  ec2Container.innerHTML = '🔄 Loading instances...';
  
  // Mostra lo spinner durante il caricamento
  document.getElementById('ec2LoadingSpinner').style.display = 'block';

  try {
    const {
      EC2Client,
      DescribeInstancesCommand,
    } = require('@aws-sdk/client-ec2');
    const { fromIni } = require('@aws-sdk/credential-provider-ini');

    const client = new EC2Client({
      region,
      credentials: fromIni({ profile }),
    });

    const result = await client.send(new DescribeInstancesCommand({}));

    // Nascondi lo spinner quando il caricamento è completato
    document.getElementById('ec2LoadingSpinner').style.display = 'none';

    const instances = [];
    result.Reservations?.forEach(res => {
      res.Instances?.forEach(inst => {
        const id = inst.InstanceId;
        const nameTag = inst.Tags?.find(tag => tag.Key === 'Name');
        const name = nameTag?.Value || id;
        instances.push([id, name]);
      });
    });

    ec2Container.innerHTML = '';
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.justifyContent = 'space-between';
    controls.style.marginBottom = '10px';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = '✔ Select All';
    selectAllBtn.onclick = () => {
      document.querySelectorAll('#ec2MultiselectContainer input[type="checkbox"]').forEach(cb => cb.checked = true);
    };

    const deselectAllBtn = document.createElement('button');
    deselectAllBtn.textContent = '❌ Deselect All';
    deselectAllBtn.onclick = () => {
      document.querySelectorAll('#ec2MultiselectContainer input[type="checkbox"]:checked').forEach(cb => cb.checked = false);
    };

    controls.appendChild(selectAllBtn);
    controls.appendChild(deselectAllBtn);
    ec2Container.appendChild(controls);

    const ec2Select = document.getElementById('ec2Select');
    ec2Select.innerHTML = '';

    if (instances.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.color = 'gray';
      emptyMsg.textContent = 'No instances found';
      ec2Container.appendChild(emptyMsg);

      const noOption = document.createElement('option');
      noOption.value = '';
      noOption.textContent = 'No instances found';
      noOption.disabled = true;
      noOption.selected = true;
      ec2Select.appendChild(noOption);
    } else {
      instances.forEach(([id, name]) => {
        const row = document.createElement('div');
        row.innerHTML = `
          <input type="checkbox" value="${id}" data-name="${name}"> ${name} (${id})
        `;
        ec2Container.appendChild(row);

        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${name} (${id})`;
        ec2Select.appendChild(option);
      });
    }

  } catch (err) {
    document.getElementById('ec2LoadingSpinner').style.display = 'none';
    const errMsg = err.message || '';
    if (errMsg.includes('Token has expired') || errMsg.includes('refresh') || errMsg.includes('could not be found')) {
      const modalText = "❌ Your AWS SSO session has expired or is invalid.\n\nPlease click on '🧩 Setup SSO Session' and complete the login again.";
      document.getElementById('errorModalText').textContent = modalText;
      document.getElementById('errorModal').style.display = 'flex';
    } else {
      alert(`Errore caricamento EC2: ${errMsg}`);
    }
  }
}

document.getElementById('openEc2Modal').addEventListener('click', () => {
  document.getElementById('ec2MultiselectContainer').style.display = 'block';
  document.getElementById('ec2Modal').style.display = 'flex';
});

document.getElementById('cancelEc2Selection').addEventListener('click', () => {
  document.getElementById('ec2Modal').style.display = 'none';
});

document.getElementById('applyEc2Selection').addEventListener('click', () => {
  const selectedInstances = Array.from(document.querySelectorAll('#ec2MultiselectContainer input[type="checkbox"]:checked')).map(cb => ({
    id: cb.value,
    label: cb.dataset.name
  }));

  const buttonLabel = selectedInstances.length ? `Selected ${selectedInstances.length} instances` : 'Select EC2 Instances';
  document.getElementById('openEc2Modal').textContent = buttonLabel;
  document.getElementById('ec2Modal').style.display = 'none';

  const profile = document.getElementById('profileSelect').value;
  const region = document.getElementById('regionSelect').value || 'us-east-1';

  const openSessions = Object.keys(terminals).map(sessionId => {
    const tab = document.getElementById(`tab-${sessionId}`);
    const instanceId = tab.getAttribute('data-instance-id');
    return instanceId ? { sessionId, instanceId } : null;
  }).filter(Boolean);

  const selectedIds = selectedInstances.map(i => i.id);

  // Chiude sessioni non selezionate
  openSessions.forEach(({ sessionId, instanceId }) => {
    if (!selectedIds.includes(instanceId)) {
      ipcRenderer.send('terminate-session', sessionId);
      document.getElementById(`tab-${sessionId}`)?.remove();
      document.getElementById(`terminal-${sessionId}`)?.remove();
      delete terminals[sessionId];
    }
  });

  // Apre nuove sessioni solo se non già aperte
  selectedInstances.forEach(({ id, label }) => {
    if (openSessions.find(s => s.instanceId === id)) return;

    const sessionId = `ssm-${sessionCounter++}`;
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.id = `tab-${sessionId}`;
    tab.setAttribute('data-instance-id', id);
    
    // Mostra solo il nome dell'istanza nella tab
    const displayName = label || 'Unnamed Instance';
    tab.innerHTML = `${displayName}<button>❌</button>`;
    
    tabsBar.appendChild(tab);

    const termDiv = document.createElement('div');
    termDiv.id = `terminal-${sessionId}`;
    terminalTabs.appendChild(termDiv);

    const term = new Terminal({
      fontFamily: 'monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 2000,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selection: '#264f78'
      },
      convertEol: true
    });

    const fitAddon = new FitAddon();
    term.open(termDiv);
    term.loadAddon(fitAddon);
    fitAddon.fit();
    setTimeout(() => term.scrollToBottom(), 100);
    term.focus();
    terminals[sessionId] = term;
    term._fitAddon = fitAddon;

    ipcRenderer.send('start-ssm-session', {
      profile,
      instanceId: id,
      sessionId,
      region
    });

    ipcRenderer.on(`terminal-data-${sessionId}`, (_, data) => {
      // Ignora i messaggi relativi a zsh
      if (data.includes('The default interactive shell is now zsh')) {
        return;
      }
      
      // Ignora gli errori di permessi per TerminateSession che non bloccano il funzionamento
      if (data.includes('AccessDeniedException') && data.includes('ssm:TerminateSession')) {
        console.warn('Avviso: Permesso mancante ssm:TerminateSession - La sessione potrebbe non chiudersi correttamente');
        return;
      }
      
      // Verifica per istanze non connesse a SSM
      if (data.includes('TargetNotConnected')) {
        document.getElementById('errorModalText').textContent =
          "❌ Unable to connect: This EC2 instance is not connected to AWS Systems Manager.\n\nPlease check:\n• SSM Agent is running\n• Correct IAM Role\n• Network access to SSM endpoint";
        document.getElementById('errorModal').style.display = 'flex';
        return;
      }
      
      // Filtra le linee di output per migliorare la leggibilità
      const lines = data.split('\n').filter(line =>
        !line.includes('aws ssm') &&
        !line.includes('Starting session with SessionId') &&
        !line.trim().startsWith('bash-')
      );
      terminals[sessionId].write(lines.join('\n'));
      terminals[sessionId].scrollToBottom();
    });

    term.onData(data => {
      ipcRenderer.send(`terminal-input-${sessionId}`, data);
    });

    tab.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      switchTab(sessionId);
    });

    tab.querySelector('button').addEventListener('click', () => {
      ipcRenderer.send('terminate-session', sessionId);
      tab.remove();
      termDiv.remove();
      delete terminals[sessionId];
      if (Object.keys(terminals).length) {
        const first = Object.keys(terminals)[0];
        switchTab(first);
      }
    });

    switchTab(sessionId);
  });
});

// Cambio tab visivamente
function switchTab(sessionId) {
  // Reset visivo
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.terminal-container > div').forEach(div => div.classList.remove('active'));

  // Attiva selezionata
  const activeTab = document.getElementById(`tab-${sessionId}`);
  const activeTerminal = document.getElementById(`terminal-${sessionId}`);
  if (activeTab && activeTerminal) {
    const term = terminals[sessionId];
    if (term && term._fitAddon) {
      setTimeout(() => term._fitAddon.fit(), 50);
    }
    activeTab.classList.add('active');
    activeTerminal.classList.add('active');
  }
}

document.getElementById('setupSession').addEventListener('click', () => {
  const configPath = path.join(os.homedir(), '.aws', 'config');
  const sessionName = 'hudl-iic-session';
  const startUrl = 'https://hudl.awsapps.com/start';
  const region = 'us-east-1';

  const config = fs.existsSync(configPath)
    ? ini.parse(fs.readFileSync(configPath, 'utf-8'))
    : {};

  config[`sso-session ${sessionName}`] = {
    sso_start_url: startUrl,
    sso_region: region
  };

  fs.writeFileSync(configPath, ini.stringify(config));

  const { exec } = require('child_process');
  exec(`${awsPath} sso login --sso-session ${sessionName}`, (error) => {
    if (error) {
      alert(`Errore durante il login SSO: ${error.message}`);
      return;
    }
    alert(`Sessione SSO '${sessionName}' configurata e autenticata con successo.`);
    loadProfiles();
  });
});

document.addEventListener('DOMContentLoaded', () => {
  loadProfiles();
});

document.getElementById('discoverProfiles').addEventListener('click', () => {
  document.getElementById('loadingOverlay').style.display = 'block';
  const cacheDir = path.join(os.homedir(), '.aws', 'sso', 'cache');
  let accessToken = null;

  try {
    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      const content = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf-8'));
      const expiresAt = new Date(content.expiresAt);
      if (content.accessToken && expiresAt > new Date()) {
        accessToken = content.accessToken;
        break;
      }
    }
  } catch (err) {
    document.getElementById('loadingOverlay').style.display = 'none';
    alert("Errore nel recupero del token SSO: " + err.message);
    return;
  }

  if (!accessToken) {
    document.getElementById('loadingOverlay').style.display = 'none';
    alert("❌ No valid SSO session found.\n\nPlease click on '🧩 Setup SSO Session' and complete login via browser.");
    return;
  }

  const { exec } = require('child_process');
  exec(`${awsPath} sso list-accounts --access-token ${accessToken} --region us-east-1`, (err, stdout) => {
    document.getElementById('loadingOverlay').style.display = 'none';
    if (err) {
      alert("Error while retrieving accounts: " + err.message);
      return;
    }

    const accounts = JSON.parse(stdout).accountList || [];
    if (!accounts.length) return alert("No accounts found.");

    const accountSelect = document.getElementById('accountSelect');
    accountSelect.innerHTML = '';
    accounts.forEach((acc, i) => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ id: acc.accountId, name: acc.accountName });
      opt.textContent = `${acc.accountName} (${acc.accountId})`;
      accountSelect.appendChild(opt);
    });

    const map = {};
    accounts.forEach(acc => { map[acc.accountId] = acc.accountName; });
    localStorage.setItem('accountMap', JSON.stringify(map));

    // Load roles when account changes
    accountSelect.addEventListener('change', () => {
      const selected = JSON.parse(accountSelect.value);
      exec(`${awsPath} sso list-account-roles --account-id ${selected.id} --access-token ${accessToken} --region us-east-1`, (err2, stdout2) => {
        const roleSelect = document.getElementById('roleSelect');
        roleSelect.innerHTML = '';
        if (err2) {
          const opt = document.createElement('option');
          opt.textContent = 'Error loading roles';
          roleSelect.appendChild(opt);
          return;
        }

        const roles = JSON.parse(stdout2).roleList || [];
        roles.forEach(role => {
          const opt = document.createElement('option');
          opt.value = role.roleName;
          opt.textContent = role.roleName;
          roleSelect.appendChild(opt);
        });
      });
    });

    accountSelect.dispatchEvent(new Event('change'));
    document.getElementById('profileModal').style.display = 'flex';
  });

  document.getElementById('confirmProfile').onclick = () => {
    const selected = JSON.parse(document.getElementById('accountSelect').value);
    const selectedRole = document.getElementById('roleSelect').value;

    const configPath = path.join(os.homedir(), '.aws', 'config');
    const config = fs.existsSync(configPath) ? ini.parse(fs.readFileSync(configPath, 'utf-8')) : {};
    const profileName = `${selectedRole}_${selected.id}`;
    config[`profile ${profileName}`] = {
      sso_session: 'hudl-iic-session',
      sso_account_id: selected.id,
      sso_role_name: selectedRole,
      region: 'us-east-1',
      output: 'json'
    };
    fs.writeFileSync(configPath, ini.stringify(config));
    alert(`Profilo '${profileName}' creato con successo.`);
    loadProfiles();
    document.getElementById('profileModal').style.display = 'none';
  };

  document.getElementById('cancelProfile').onclick = () => {
    document.getElementById('profileModal').style.display = 'none';
  };

  // Modal for error handling
  const errorModal = document.createElement('div');
  errorModal.id = "errorModal";
  errorModal.style.display = 'none';
  errorModal.style.position = 'fixed';
  errorModal.style.top = '0';
  errorModal.style.left = '0';
  errorModal.style.width = '100%';
  errorModal.style.height = '100%';
  errorModal.style.background = 'rgba(0,0,0,0.7)';
  errorModal.style.justifyContent = 'center';
  errorModal.style.alignItems = 'center';
  errorModal.style.zIndex = '99999';
  errorModal.innerHTML = `
    <div style="background:#1e1e1e; padding:20px; border-radius:8px; width:400px; color:white;">
      <h3 style="margin-top:0;">Connection Error</h3>
      <pre id="errorModalText" style="white-space:pre-wrap;"></pre>
      <button onclick="document.getElementById('errorModal').style.display='none';" style="margin-top:10px;">Close</button>
    </div>
  `;
  document.body.appendChild(errorModal);
});

document.getElementById('connect').addEventListener('click', () => {
  const profile = document.getElementById('profileSelect').value;
  const region = document.getElementById('regionSelect').value || 'us-east-1';
  const instanceId = document.getElementById('ec2Select').value;

  if (!profile || !instanceId) {
    return alert('Please select both a profile and an EC2 instance.');
  }

  // Mostra un indicatore di caricamento
  document.getElementById('ec2LoadingSpinner').textContent = '🔄 Avvio sessione SSM...';
  document.getElementById('ec2LoadingSpinner').style.display = 'block';

  // Estrai solo il nome dell'istanza senza l'ID
  const fullLabel = document.querySelector(`#ec2Select option[value="${instanceId}"]`)?.textContent || instanceId;
  let displayName = fullLabel;
  
  // Se l'etichetta contiene l'ID tra parentesi, estrai solo il nome
  if (fullLabel.includes('(')) {
    displayName = fullLabel.substring(0, fullLabel.lastIndexOf('(')).trim();
  }

  const sessionId = `ssm-${sessionCounter++}`;
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.id = `tab-${sessionId}`;
  tab.setAttribute('data-instance-id', instanceId);
  tab.innerHTML = `${displayName}<button>❌</button>`;
  tabsBar.appendChild(tab);

  const termDiv = document.createElement('div');
  termDiv.id = `terminal-${sessionId}`;
  terminalTabs.appendChild(termDiv);

  const term = new Terminal({
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 2000,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#ffffff',
      selection: '#264f78'
    },
    convertEol: true
  });

  const fitAddon = new FitAddon();
  term.open(termDiv);
  term.loadAddon(fitAddon);
  fitAddon.fit();
  setTimeout(() => term.scrollToBottom(), 100);
  term.focus();
  terminals[sessionId] = term;
  term._fitAddon = fitAddon;

  // Scrivi un messaggio di avvio
  term.write('Avvio sessione SSM...\r\n');

  // Passa il percorso AWS all'IPC
  ipcRenderer.send('start-ssm-session', {
    profile,
    instanceId,
    sessionId,
    region,
    awsPath  // Passa il percorso dell'AWS CLI rilevato
  });

  // Gestisco l'output del terminale
  let connectionTimeout = setTimeout(() => {
    document.getElementById('ec2LoadingSpinner').style.display = 'none';
    term.write('\r\n\x1b[31mSessione SSM non risponde. Possibili cause:\r\n');
    term.write('- Credenziali AWS scadute\r\n');
    term.write('- Istanza EC2 non raggiungibile\r\n');
    term.write('- Problemi di rete\r\n');
    term.write('Prova a ricaricare i profili AWS o verificare lo stato dell\'istanza.\x1b[0m\r\n');
  }, 20000); // 20 secondi di timeout

  let hasReceivedData = false;

  ipcRenderer.on(`terminal-data-${sessionId}`, (_, data) => {
    // Nascondi spinner dopo aver ricevuto dati
    document.getElementById('ec2LoadingSpinner').style.display = 'none';
    
    if (!hasReceivedData) {
      hasReceivedData = true;
      clearTimeout(connectionTimeout);
    }
    
    // Ignora i messaggi relativi a zsh
    if (data.includes('The default interactive shell is now zsh')) {
      return;
    }
    
    // Ignora gli errori di permessi per TerminateSession che non bloccano il funzionamento
    if (data.includes('AccessDeniedException') && data.includes('ssm:TerminateSession')) {
      console.warn('Avviso: Permesso mancante ssm:TerminateSession - La sessione potrebbe non chiudersi correttamente');
      return;
    }
    
    // Verifica per istanze non connesse a SSM
    if (data.includes('TargetNotConnected')) {
      document.getElementById('errorModalText').textContent =
        "❌ Unable to connect: This EC2 instance is not connected to AWS Systems Manager.\n\nPlease check:\n• SSM Agent is running\n• Correct IAM Role\n• Network access to SSM endpoint";
      document.getElementById('errorModal').style.display = 'flex';
      return;
    }
    
    // Filtra le linee di output per migliorare la leggibilità
    const lines = data.split('\n').filter(line =>
      !line.includes('aws ssm') &&
      !line.includes('Starting session with SessionId') &&
      !line.trim().startsWith('bash-')
    );
    
    if (lines.length > 0) {
      terminals[sessionId].write(lines.join('\n'));
      terminals[sessionId].scrollToBottom();
    }
  });

  // Gestione degli input utente
  term.onData(data => {
    ipcRenderer.send(`terminal-input-${sessionId}`, data);
  });

  // Gestione dell'evento di uscita dal terminale
  ipcRenderer.on(`terminal-exit-${sessionId}`, () => {
    console.log(`Terminal session ${sessionId} exited`);
    // Non rimuoviamo immediatamente la tab per permettere all'utente di vedere eventuali errori
  });

  tab.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    switchTab(sessionId);
  });

  tab.querySelector('button').addEventListener('click', () => {
    ipcRenderer.send('terminate-session', sessionId);
    tab.remove();
    termDiv.remove();
    delete terminals[sessionId];
    if (Object.keys(terminals).length) {
      const first = Object.keys(terminals)[0];
      switchTab(first);
    }
  });

  switchTab(sessionId);
});

window.addEventListener('resize', () => {
  Object.values(terminals).forEach(term => {
    if (term._fitAddon) {
      term._fitAddon.fit();
    }
  });
});
