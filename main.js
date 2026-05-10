const { app, BrowserWindow, dialog, session } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let backendProcess = null;
let mainWindow = null;

function getPaths() {
  if (app.isPackaged) {
    return {
      pythonExe: path.join(process.resourcesPath, 'python-embed', 'python.exe'),
      backendDir: path.join(process.resourcesPath, 'backend-bundle'),
    };
  }
  return {
    pythonExe: path.join(__dirname, 'python-embed', 'python.exe'),
    backendDir: path.join(__dirname, 'backend', 'act_reg_final_version'),
  };
}

function waitForBackend(retries = 40, delay = 500) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get('http://localhost:8000/health', (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (n > 0) {
          setTimeout(() => attempt(n - 1), delay);
        } else {
          reject(new Error('Backend health check failed'));
        }
      }).on('error', () => {
        if (n > 0) setTimeout(() => attempt(n - 1), delay);
        else reject(new Error('Backend not reachable after timeout'));
      });
    };
    attempt(retries);
  });
}

function startBackend() {
  const { pythonExe, backendDir } = getPaths();

  console.log('[main] isPackaged:', app.isPackaged);
  console.log('[main] python:', pythonExe);
  console.log('[main] backendDir:', backendDir);

  backendProcess = spawn(pythonExe, [
    '-m', 'uvicorn',
    'websocket_api:app',
    '--host', '0.0.0.0',
    '--port', '8000',
  ], {
    cwd: backendDir,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONPATH: backendDir,
    },
  });

  backendProcess.stdout?.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr?.on('data', d => console.error('[backend]', d.toString().trim()));

  backendProcess.on('exit', (code) => {
    console.log('[backend] exited with code', code);
    if (code !== 0 && mainWindow) {
      dialog.showErrorBox(
        'Aerview backend stopped',
        `The backend process exited unexpectedly (code ${code}).\nPlease restart the app.`
      );
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "Aerview",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow loading local resources (e.g. model files) in development; safe since we disable nodeIntegration and contextIsolation is true
    },
    show: false,
  });

  mainWindow.loadURL("http://localhost:8000");
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  // Grant camera permission for RealTime page
  // Allow all local connections including WebSocket
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:8000 ws://localhost:8000",
        ],
      },
    });
  });
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === "media");
    },
  );

  startBackend();

  try {
    await waitForBackend();
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      "Aerview failed to start",
      "The backend could not be reached.\n\nMake sure no other app is using port 8000.\n\n" +
        err.message,
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
});