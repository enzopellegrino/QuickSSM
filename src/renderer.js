const fs = require('fs');
const path = require('path');
const os = require('os');
const ini = require('ini');
const { ipcRenderer } = require('electron');
const { Terminal } = require('xterm');

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
}

// Carica istanze EC2
document.getElementById('loadEc2').addEventListener('click', () => {
  const profile = document.getElementById('profileSelect').value;
  const ec2Select = document.getElementById('ec2Select');
  ec2Select.innerHTML = '<option>Caricamento...</option>';

  const { exec } = require('child_process');
  const configPath = path.join(os.homedir(), '.aws', 'config');
  const config = ini.parse(fs.readFileSync(configPath, 'utf-8'));
  const region = document.getElementById('regionSelect').value || 'us-east-1';
  
  exec(`aws ec2 describe-instances --profile ${profile} --region ${region} --query "Reservations[].Instances[].[InstanceId, Tags[?Key=='Name']|[0].Value]" --output json`, (error, stdout) => {
    if (error) {
      document.getElementById('loadingOverlay').style.display = 'none';
      alert(`Errore caricamento EC2: ${error.message}`);
      return;
    }
    const data = JSON.parse(stdout);
    ec2Select.innerHTML = '';
    data.forEach(([id, name]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name ? `${name} (${id})` : id;
      ec2Select.appendChild(option);
    });
  });
});

// Avvia terminale
// Avvia terminale con regione selezionata
document.getElementById('connect').addEventListener('click', () => {
  const profile = document.getElementById('profileSelect').value;
  const ec2Select = document.getElementById('ec2Select');
  const instanceId = ec2Select.value;
  if (!instanceId) return alert('Seleziona un\'istanza EC2');

  const label = ec2Select.selectedOptions[0].textContent;
  const sessionId = `ssm-${sessionCounter++}`;

  // Crea tab
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.id = `tab-${sessionId}`;
  tab.innerHTML = `${label}<button>❌</button>`;
  tabsBar.appendChild(tab);

  // Crea contenitore terminale
  const termDiv = document.createElement('div');
  termDiv.id = `terminal-${sessionId}`;
  terminalTabs.appendChild(termDiv);

  const term = new Terminal({ fontSize: 14, cursorBlink: true });
  term.open(termDiv);
  terminals[sessionId] = term;

  // Regione selezionata dall'utente
  const region = document.getElementById('regionSelect').value || 'us-east-1';
  ipcRenderer.send('start-ssm-session', { profile, instanceId, sessionId, region });

  ipcRenderer.on(`terminal-data-${sessionId}`, (_, data) => {
    if (terminals[sessionId]) terminals[sessionId].write(data);
  });

  term.onData(data => {
    ipcRenderer.send(`terminal-input-${sessionId}`, data);
  });

  // Cambio tab
  tab.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    switchTab(sessionId);
  });

  // Chiudi tab
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

// Cambio tab visivamente
function switchTab(sessionId) {
  // Reset visivo
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.terminal-container > div').forEach(div => div.classList.remove('active'));

  // Attiva selezionata
  const activeTab = document.getElementById(`tab-${sessionId}`);
  const activeTerminal = document.getElementById(`terminal-${sessionId}`);
  if (activeTab && activeTerminal) {
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
  exec(`aws sso login --sso-session ${sessionName}`, (error) => {
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
    alert("Nessun token valido trovato. Fai login con SSO prima.");
    return;
  }

  const { exec } = require('child_process');
  exec(`aws sso list-accounts --access-token ${accessToken} --region us-east-1`, (err, stdout) => {
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
      exec(`aws sso list-account-roles --account-id ${selected.id} --access-token ${accessToken} --region us-east-1`, (err2, stdout2) => {
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
});
