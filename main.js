const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

let mainWindow;
const sessions = {}; // sessionId -> ptyProcess

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'src/renderer.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Avvio sessione SSM
ipcMain.on('start-ssm-session', (event, { profile, instanceId, sessionId, region }) => {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env
  });

  sessions[sessionId] = ptyProcess;

  ptyProcess.write(`aws ssm start-session --target ${instanceId} --region ${region} --profile ${profile}\r`);

  ptyProcess.on('data', data => {
    event.sender.send(`terminal-data-${sessionId}`, data);
  });

  ipcMain.on(`terminal-input-${sessionId}`, (_, input) => {
    if (sessions[sessionId]) sessions[sessionId].write(input);
  });
});

// Terminazione
ipcMain.on('terminate-session', (event, sessionId) => {
  if (sessions[sessionId]) {
    sessions[sessionId].kill();
    delete sessions[sessionId];
  }
});
