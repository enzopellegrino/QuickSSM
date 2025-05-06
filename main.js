const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const { SsmSession } = require('./src/aws-ssm-api');

// Define a default AWS path
const DEFAULT_AWS_PATH = '/Users/enzo.pellegrino/homebrew/bin/aws';

// Function to find the AWS CLI path
function findAwsCliPath() {
  try {
    // Check if the default path exists
    if (fs.existsSync(DEFAULT_AWS_PATH)) {
      console.log('AWS CLI found at:', DEFAULT_AWS_PATH);
      return DEFAULT_AWS_PATH;
    }
    
    // Other common paths on macOS
    const macPaths = [
      '/usr/local/bin/aws',
      '/opt/homebrew/bin/aws',
      '/usr/bin/aws',
      `${os.homedir()}/homebrew/bin/aws`,
      `${os.homedir()}/.local/bin/aws`
    ];
    
    for (const p of macPaths) {
      if (fs.existsSync(p)) {
        console.log('AWS CLI found at:', p);
        return p;
      }
    }
    
    // Try to detect the path via which/where
    try {
      let awsPath;
      if (process.platform === 'win32') {
        awsPath = execSync('where aws').toString().trim().split('\n')[0];
      } else {
        awsPath = execSync('which aws').toString().trim();
      }
      
      if (awsPath && fs.existsSync(awsPath)) {
        console.log('AWS CLI found via which/where:', awsPath);
        return awsPath;
      }
    } catch (e) {
      console.log('Unable to find AWS CLI via which/where');
    }
    
    // Fallback: use the aws command without path
    return 'aws';
  } catch (error) {
    console.warn('Error while searching for AWS CLI path:', error);
    return 'aws';  // Fallback to basic aws command
  }
}

// Find the AWS CLI path once at startup
const AWS_CLI_PATH = findAwsCliPath();
console.log('Using AWS CLI path:', AWS_CLI_PATH);

let mainWindow;
const sessions = {}; // sessionId -> process or session object

// Create a new initialization function that only checks AWS credentials
async function checkAwsCredentials() {
  const { fromIni } = require('@aws-sdk/credential-provider-ini');
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  return new Promise((resolve) => {
    // Check if the AWS configuration file exists
    const awsConfigPath = path.join(os.homedir(), '.aws', 'config');
    const awsCredsPath = path.join(os.homedir(), '.aws', 'credentials');
    
    if (!fs.existsSync(awsConfigPath) && !fs.existsSync(awsCredsPath)) {
      console.warn('AWS configuration files not found');
      const result = dialog.showMessageBox({
        type: 'warning',
        title: 'AWS Configuration Missing',
        message: 'AWS configuration files were not found',
        detail: 'To use this application:\n\n' +
                '1. Open Terminal\n' +
                '2. Run: aws configure\n' +
                '   or: aws sso login\n' +
                '3. Restart this application',
        buttons: ['Continue anyway', 'Close'],
        defaultId: 0
      });
      
      result.then(res => {
        if (res.response === 1) {
          app.exit(0);
          resolve(false);
        } else {
          resolve(true);
        }
      });
      return;
    }

    // Determine if there is at least one profile we can use
    // First, we check if a credentials or config file exists
    try {
      // Check if there is at least one configured profile
      let hasProfiles = false;
      
      if (fs.existsSync(awsConfigPath)) {
        const configContent = fs.readFileSync(awsConfigPath, 'utf8');
        hasProfiles = configContent.includes('[profile ') || configContent.includes('[default]');
      }
      
      if (!hasProfiles && fs.existsSync(awsCredsPath)) {
        const credsContent = fs.readFileSync(awsCredsPath, 'utf8');
        hasProfiles = credsContent.includes('[') && credsContent.includes(']');
      }
      
      if (!hasProfiles) {
        console.warn('No AWS profile found in configuration files');
        resolve(true); // Continue anyway
        return;
      }
      
      // At this point we know that at least one profile exists
      console.log('AWS profiles found, the app should work correctly');
      resolve(true);
    } catch (error) {
      console.error('Error while verifying AWS profiles:', error);
      resolve(true); // Continue anyway
    }
  });
}

// Request terminal permissions - remains for compatibility
async function requestTerminalPermissions() {
  if (process.platform !== 'darwin') return true; // Only for macOS
  
  return new Promise((resolve) => {
    // Verify terminal access with a simple command
    const testProcess = spawn('/bin/bash', ['-c', 'echo "Testing terminal access"']);
    
    testProcess.on('error', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Permissions Required',
        message: 'HudlOps may require permissions for some features',
        detail: 'For some optional features, the app may require terminal permissions. You can continue without granting them.',
        buttons: ['OK'],
      });
      resolve(true);
    });
    
    testProcess.on('close', () => {
      resolve(true);
    });
  });
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'src/renderer.js'),
      contextIsolation: false,
      nodeIntegration: true
    },
    icon: path.join(__dirname, 'src/icon.png') // Set the icon for the window too
  });

  mainWindow.maximize();
  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(async () => {
  // Verify AWS credentials at startup (much lighter)
  await checkAwsCredentials();
  await requestTerminalPermissions();
  
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Function to start an SSM session in the system terminal (usable as fallback)
function startNativeTerminalSession(event, { profile, instanceId, region, awsPath }) {
  // Command to start the native terminal
  if (os.platform() === 'darwin') { // macOS
    // Use the AWS path found at startup or the specified parameter
    const awsCliPath = awsPath || AWS_CLI_PATH;
    // Build a secure SSM command with all necessary environment variables
    // Properly handle quotes to avoid issues with AppleScript
    const ssmCommand = `export AWS_PROFILE='${profile}' && export AWS_REGION='${region}' && ${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}`;
    
    // More robust AppleScript with a custom title
    // Use single quotes for the main string and double quotes inside
    const script = `tell application "Terminal"
  activate
  do script "${ssmCommand.replace(/"/g, '\\"')}"
  tell window 1
    set custom title to "SSM: ${instanceId} (${profile})"
    set background color to {1000, 5000, 5000}
    set normal text color to {65535, 65535, 65535}
  end tell
end tell`;
    
    const { exec } = require('child_process');
    exec(`osascript -e '${script}'`, (err, stdout, stderr) => {
      if (err) {
        console.error('Error opening terminal:', err);
        safeSend(event, 'native-terminal-error', { error: err.message });
      } else {
        safeSend(event, 'native-terminal-opened');
        console.log('Terminal opened successfully');
      }
    });
  } else if (os.platform() === 'win32') { // Windows
    const { exec } = require('child_process');
    const awsCliPath = awsPath || AWS_CLI_PATH;
    const command = `start cmd.exe /K "${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}"`;
    exec(command, (err) => {
      if (err) {
        console.error('Error opening Windows command prompt:', err);
        safeSend(event, 'native-terminal-error', { error: err.message });
      } else {
        safeSend(event, 'native-terminal-opened');
      }
    });
  } else { // Linux
    const { exec } = require('child_process');
    const awsCliPath = awsPath || AWS_CLI_PATH;
    // Look for an available terminal on Linux
    const terminals = ['gnome-terminal', 'konsole', 'xterm', 'xfce4-terminal'];
    
    // Command to execute in the terminal
    const command = `${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}`;
    
    // Function to find and open a terminal
    const findAndOpenTerminal = (index) => {
      if (index >= terminals.length) {
        console.error('No terminal found on Linux');
        safeSend(event, 'native-terminal-error', { error: 'No supported terminal found' });
        return;
      }
      
      const terminal = terminals[index];
      exec(`which ${terminal}`, (err, stdout) => {
        if (!err && stdout.trim()) {
          let terminalCommand;
          
          if (terminal === 'gnome-terminal') {
            terminalCommand = `gnome-terminal -- bash -c "echo 'SSM Connection to ${instanceId}...'; ${command}; echo 'Session terminated. Press a key to close.'; read -n 1"`;
          } else if (terminal === 'konsole') {
            terminalCommand = `konsole --noclose -e bash -c "echo 'SSM Connection to ${instanceId}...'; ${command}; echo 'Session terminated. Press a key to close.'; read -n 1"`;
          } else if (terminal === 'xterm') {
            terminalCommand = `xterm -hold -e "echo 'SSM Connection to ${instanceId}...'; ${command}; echo 'Session terminated. Press a key to close.'; read -n 1"`;
          } else if (terminal === 'xfce4-terminal') {
            terminalCommand = `xfce4-terminal --hold -e "bash -c 'echo SSM Connection to ${instanceId}...; ${command}; echo Session terminated. Press a key to close.; read -n 1'"`;
          }
          
          exec(terminalCommand, (err) => {
            if (err) {
              console.error(`Error opening ${terminal}:`, err);
              findAndOpenTerminal(index + 1);
            } else {
              safeSend(event, 'native-terminal-opened');
              console.log(`Terminal ${terminal} opened successfully`);
            }
          });
        } else {
          findAndOpenTerminal(index + 1);
        }
      });
    };
    
    findAndOpenTerminal(0);
  }
}

// Utility function to check if a WebContents is still valid
function isWebContentsValid(contents) {
  try {
    // If it has been destroyed, this property will raise an exception or be true
    return contents && !contents.isDestroyed();
  } catch (e) {
    return false;
  }
}

// Safe function to send IPC messages
function safeSend(event, channel, ...args) {
  try {
    if (event && event.sender && isWebContentsValid(event.sender)) {
      event.sender.send(channel, ...args);
    }
  } catch (error) {
    console.warn(`Unable to send message on ${channel}: ${error.message}`);
  }
}

// New management of SSM sessions using node-pty directly
ipcMain.on('start-ssm-session', async (event, { profile, instanceId, sessionId, region, awsPath }) => {
  console.log(`Starting SSM session for ${instanceId} with profile ${profile} in region ${region} using node-pty`);
  
  try {
    // Initial notification
    safeSend(event, `terminal-data-${sessionId}`, `\r\n\x1b[33mStarting SSM session for ${instanceId}...\x1b[0m\r\n`);
    
    // Use the AWS path found at startup or the specified parameter
    const awsCliPath = awsPath || AWS_CLI_PATH;
    console.log('Using AWS CLI path:', awsCliPath);
    
    // Create a terminal process using node-pty
    const pty = require('node-pty');
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    
    // Build the AWS SSM command
    const ssmCommand = `${awsCliPath} ssm start-session --target ${instanceId} --region ${region} --profile ${profile}`;
    
    // Execution environments
    const env = {
      ...process.env,
      AWS_PROFILE: profile,
      AWS_REGION: region,
      TERM: 'xterm-color',
      // Add all common paths that might contain AWS CLI
      PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/opt/local/bin:' + 
            `${os.homedir()}/homebrew/bin:` +
            (process.env.HOME ? `${process.env.HOME}/.local/bin` : '')
    };
    
    // Create a PTY session that runs the AWS SSM command
    const ptyProcess = pty.spawn(shell, ['-c', ssmCommand], {
      name: 'xterm-256color',
      cols: 170,
      rows: 40,
      env: {
        ...env,
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'HudlOps',
        LANG: 'it_IT.UTF-8',
        LC_ALL: 'it_IT.UTF-8'
      },
      encoding: 'utf8',
      cwd: process.env.HOME,
      useConpty: process.platform === 'win32'
    });
    
    // Save the PTY session
    sessions[sessionId] = ptyProcess;
    
    // Handle the process output
    ptyProcess.onData(data => {
      safeSend(event, `terminal-data-${sessionId}`, data);
    });
    
    // Handle the process termination
    ptyProcess.onExit(({ exitCode }) => {
      safeSend(event, `terminal-data-${sessionId}`, `\r\n\x1b[33mSession terminated with code ${exitCode}\x1b[0m\r\n`);
      safeSend(event, `terminal-exit-${sessionId}`);
      delete sessions[sessionId];
    });
    
    // Set handler for user input
    ipcMain.on(`terminal-input-${sessionId}`, (_, input) => {
      if (sessions[sessionId]) {
        sessions[sessionId].write(input);
      }
    });
    
    // Set handler for terminal resizing
    ipcMain.on(`terminal-resize-${sessionId}`, (_, { cols, rows }) => {
      if (sessions[sessionId]) {
        sessions[sessionId].resize(cols, rows);
      }
    });
    
  } catch (error) {
    console.error(`General error when starting the SSM session: ${error.message}`);
    safeSend(event, `terminal-data-${sessionId}`, `\r\n\x1b[31mError starting the SSM session: ${error.message}\x1b[0m\r\n`);
    
    // In case of a serious error, offer the option to open in the native terminal
    if (isWebContentsValid(event.sender)) {
      dialog.showMessageBox({
        type: 'error',
        title: 'SSM Session Error',
        message: 'Unable to start integrated SSM session',
        detail: `Error: ${error.message}\n\nDo you want to try opening the session in the system terminal?`,
        buttons: ['Yes', 'No'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          startNativeTerminalSession(event, { profile, instanceId, region, awsPath });
        } else {
          safeSend(event, `terminal-exit-${sessionId}`);
        }
      }).catch(err => console.error('Dialog error:', err));
    }
  }
});

// Diagnostic function for SSM connection errors
async function diagnoseSsmError(profile, instanceId, region) {
  console.log(`Diagnosing SSM connection for ${instanceId} with profile ${profile} in region ${region}`);
  
  const diagnosticResults = {
    validCredentials: false,
    instanceConnected: false,
    sufficientPermissions: false,
    details: []
  };
  
  try {
    // Test AWS credentials
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const { fromIni } = require('@aws-sdk/credential-provider-ini');
    
    const stsClient = new STSClient({
      region: region,
      credentials: fromIni({ profile: profile }),
    });
    
    try {
      const identity = await stsClient.send(new GetCallerIdentityCommand({}));
      diagnosticResults.validCredentials = true;
      diagnosticResults.details.push(`✅ Valid credentials: ${identity.Arn}`);
    } catch (credError) {
      diagnosticResults.details.push(`❌ Invalid credentials: ${credError.message}`);
      diagnosticResults.details.push('   Try running: aws sso login --profile ' + profile);
    }
    
    if (diagnosticResults.validCredentials) {
      // Verify that the instance is connected to SSM
      const { SSMClient, DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');
      
      const ssmClient = new SSMClient({
        region: region,
        credentials: fromIni({ profile: profile }),
      });
      
      try {
        const response = await ssmClient.send(new DescribeInstanceInformationCommand({
          Filters: [
            {
              Key: "InstanceIds",
              Values: [instanceId]
            }
          ]
        }));
        
        if (response.InstanceInformationList && response.InstanceInformationList.length > 0) {
          diagnosticResults.instanceConnected = true;
          const status = response.InstanceInformationList[0].PingStatus;
          diagnosticResults.details.push(`✅ Instance connected to SSM (Status: ${status})`);
        } else {
          diagnosticResults.details.push('❌ Instance NOT connected to SSM. Verify:');
          diagnosticResults.details.push('   - The SSM agent is running on the instance');
          diagnosticResults.details.push('   - The instance has access to the SSM endpoint');
          diagnosticResults.details.push('   - The instance has an appropriate IAM role');
        }
      } catch (ssmError) {
        if (ssmError.name === 'AccessDeniedException') {
          diagnosticResults.details.push(`❌ Insufficient permissions to verify SSM status: ${ssmError.message}`);
        } else {
          diagnosticResults.details.push(`❌ Error while verifying SSM status: ${ssmError.message}`);
        }
      }
      
      // Check permissions for StartSession
      try {
        const { IAMClient, SimulatePrincipalPolicyCommand } = require('@aws-sdk/client-iam');
        
        // Extract the identity ARN for permission tests
        const identityResponse = await stsClient.send(new GetCallerIdentityCommand({}));
        const principalArn = identityResponse.Arn;
        
        const iamClient = new IAMClient({
          region: region,
          credentials: fromIni({ profile: profile }),
        });
        
        // Test StartSession permission
        try {
          const simResponse = await iamClient.send(new SimulatePrincipalPolicyCommand({
            PolicySourceArn: principalArn,
            ActionNames: ['ssm:StartSession'],
            ResourceArns: [`arn:aws:ssm:${region}::document/AWS-StartSSHSession`]
          }));
          
          if (simResponse.EvaluationResults && 
              simResponse.EvaluationResults[0] && 
              simResponse.EvaluationResults[0].EvalDecision === 'allowed') {
            diagnosticResults.sufficientPermissions = true;
            diagnosticResults.details.push('✅ You have the necessary permissions for ssm:StartSession');
          } else {
            diagnosticResults.details.push('❌ Insufficient permissions for ssm:StartSession');
            diagnosticResults.details.push('   Your IAM role requires at least the ssm:StartSession permission');
          }
        } catch (iamError) {
          // Some roles might not have permission to simulate policies
          diagnosticResults.details.push(`ℹ️  Unable to verify permissions: ${iamError.message}`);
          diagnosticResults.details.push('   This is normal if you are using temporary credentials');
        }
      } catch (identityError) {
        diagnosticResults.details.push(`ℹ️  Unable to determine identity to verify permissions`);
      }
    }
    
    // Check for the presence and operation of the AWS CLI
    try {
      const { execSync } = require('child_process');
      const awsVersionTest = execSync('aws --version', { encoding: 'utf8' });
      diagnosticResults.details.push(`✅ AWS CLI found: ${awsVersionTest.trim()}`);
    } catch (cliError) {
      diagnosticResults.details.push('❌ AWS CLI not found or not working. Verify that it is installed.');
    }
    
  } catch (error) {
    diagnosticResults.details.push(`❌ Error during diagnosis: ${error.message}`);
  }
  
  return diagnosticResults;
}

// Handle the event to start diagnosis
ipcMain.on('diagnose-ssm-connection', async (event, { profile, instanceId, region }) => {
  try {
    const results = await diagnoseSsmError(profile, instanceId, region);
    safeSend(event, 'diagnostic-results', { results });
  } catch (error) {
    safeSend(event, 'diagnostic-results', { 
      error: error.message,
      details: ['Error during connection diagnosis']
    });
  }
});

// Termination
ipcMain.on('terminate-session', async (event, sessionId) => {
  if (sessions[sessionId]) {
    console.log(`Terminating session ${sessionId}`);
    
    // Check if it's a PTY session
    if (sessions[sessionId].kill) {
      sessions[sessionId].kill();
      delete sessions[sessionId];
    }
  }
  
  // Remove all related listeners
  ipcMain.removeAllListeners(`terminal-input-${sessionId}`);
  ipcMain.removeAllListeners(`terminal-resize-${sessionId}`);
});
