const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

let mainWindow;
const sessions = {}; // sessionId -> ptyProcess

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'src/renderer.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  // Massimizza la finestra all'avvio
  mainWindow.maximize();
  // Alternativa: mainWindow.setFullScreen(true); // per modalità schermo intero completo

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

// Start SSM session
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

  ptyProcess.on('exit', () => {
    event.sender.send(`terminal-exit-${sessionId}`);
    cleanupSession(sessionId);
  });

  // Input handler
  const inputHandler = (_, input) => {
    if (sessions[sessionId]) sessions[sessionId].write(input);
  };
  
  ipcMain.on(`terminal-input-${sessionId}`, inputHandler);
  
  // Terminal resize handler
  ipcMain.on(`terminal-resize-${sessionId}`, (_, { cols, rows }) => {
    if (sessions[sessionId]) {
      sessions[sessionId].resize(cols, rows);
    }
  });
});

// Termination
ipcMain.on('terminate-session', (event, sessionId) => {
  if (sessions[sessionId]) {
    sessions[sessionId].kill();
    cleanupSession(sessionId);
  }
});

// Helper function to clean up session resources
function cleanupSession(sessionId) {
  if (sessions[sessionId]) {
    delete sessions[sessionId];
  }
  
  // Remove all related listeners
  ipcMain.removeAllListeners(`terminal-input-${sessionId}`);
  ipcMain.removeAllListeners(`terminal-resize-${sessionId}`);
}
