const fs = require('fs');
const path = require('path');
const os = require('os');
const ini = require('ini');
const { ipcRenderer } = require('electron');
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');

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

  const term = new Terminal({
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 2000,
    theme: {
      background: '#000000',
      foreground: '#00FF00',
      cursor: 'white'
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

  // Regione selezionata dall'utente
  const region = document.getElementById('regionSelect').value || 'us-east-1';
  ipcRenderer.send('start-ssm-session', { profile, instanceId, sessionId, region });

  ipcRenderer.on(`terminal-data-${sessionId}`, (_, data) => {
    if (data.includes('TargetNotConnected')) {
      document.getElementById('errorModalText').textContent =
        "❌ Unable to connect: This EC2 instance is not connected to AWS Systems Manager.\n\nPlease check:\n• SSM Agent is running\n• Correct IAM Role\n• Network access to SSM endpoint";
      document.getElementById('errorModal').style.display = 'flex';
      return;
    }
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

window.addEventListener('resize', () => {
  Object.values(terminals).forEach(term => {
    if (term._fitAddon) {
      term._fitAddon.fit();
    }
  });
});
