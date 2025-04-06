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
        const profileName = key.replace(/^profile /, '');
        profiles.add(profileName);
      });
    }
  });

  const select = document.getElementById('profileSelect');
  select.innerHTML = '';

  if (profiles.size === 0) {
    const option = document.createElement('option');
    option.textContent = 'Nessun profilo trovato';
    option.disabled = true;
    select.appendChild(option);
    return;
  }

  profiles.forEach(profileName => {
    const option = document.createElement('option');
    option.value = profileName;
    option.textContent = profileName;
    select.appendChild(option);
  });
}

// Carica istanze EC2
document.getElementById('loadEc2').addEventListener('click', () => {
  const profile = document.getElementById('profileSelect').value;
  const ec2Select = document.getElementById('ec2Select');
  ec2Select.innerHTML = '<option>Caricamento...</option>';

  const { exec } = require('child_process');
  exec(`aws ec2 describe-instances --profile ${profile} --query "Reservations[].Instances[].[InstanceId, Tags[?Key=='Name']|[0].Value]" --output json`, (error, stdout) => {
    if (error) {
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

  ipcRenderer.send('start-ssm-session', { profile, instanceId, sessionId });

  ipcRenderer.on(`terminal-data-${sessionId}`, (_, data) => {
    if (terminals[sessionId]) terminals[sessionId].write(data);
  });

  term.onData(data => {
    ipcRenderer.send(`terminal-input-${sessionId}`, data);
  });

  // Cambio tab
  tab.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return; // evita conflitto click su X
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

// Login SSO
document.getElementById('login').addEventListener('click', () => {
  const profile = document.getElementById('profileSelect').value;
  const { exec } = require('child_process');
  exec(`aws sso login --profile ${profile}`, (error) => {
    if (error) {
      alert(`Errore login: ${error.message}`);
      return;
    }
    alert(`Login SSO effettuato con successo per ${profile}`);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  loadProfiles();
});
