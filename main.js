const { app, BrowserWindow, dialog, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

let backendProcess = null;
let mainWindow = null;
let ownsBackend = false;

const BACKEND_HOST = "localhost";
const BACKEND_PORT = 8000;
const BACKEND_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const BACKEND_HEALTH_URL = `${BACKEND_BASE_URL}/health`;

function getPaths() {
  if (app.isPackaged) {
    return {
      pythonExe: path.join(process.resourcesPath, "python-embed", "python.exe"),
      backendDir: path.join(process.resourcesPath, "backend-bundle"),
    };
  }
  return {
    pythonExe: path.join(__dirname, "python-embed", "python.exe"),
    backendDir: path.join(__dirname, "backend", "act_reg_final_version"),
  };
}

function checkBackendHealth() {
  return new Promise((resolve) => {
    http
      .get(BACKEND_HEALTH_URL, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      })
      .on("error", () => resolve(false));
  });
}

function waitForBackend(retries = 40, delay = 500) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http
        .get(BACKEND_HEALTH_URL, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else if (n > 0) {
            setTimeout(() => attempt(n - 1), delay);
          } else {
            reject(new Error("Backend health check failed"));
          }
        })
        .on("error", () => {
          if (n > 0) setTimeout(() => attempt(n - 1), delay);
          else reject(new Error("Backend not reachable after timeout"));
        });
    };
    attempt(retries);
  });
}

async function startBackend() {
  const { pythonExe, backendDir } = getPaths();

  console.log("[main] isPackaged:", app.isPackaged);
  console.log("[main] python:", pythonExe);
  console.log("[main] backendDir:", backendDir);

  const isHealthy = await checkBackendHealth();
  if (isHealthy) {
    console.log("[main] backend already running; using existing instance");
    ownsBackend = false;
    return;
  }

  backendProcess = spawn(
    pythonExe,
    [
      "-m",
      "uvicorn",
      "websocket_api:app",
      "--host",
      "0.0.0.0",
      "--port",
      String(BACKEND_PORT),
    ],
    {
      cwd: backendDir,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONPATH: backendDir,
      },
    },
  );

  ownsBackend = true;

  backendProcess.stdout?.on("data", (d) =>
    console.log("[backend]", d.toString().trim()),
  );
  backendProcess.stderr?.on("data", (d) =>
    console.error("[backend]", d.toString().trim()),
  );

  backendProcess.on("exit", (code) => {
    console.log("[backend] exited with code", code);
    if (code !== 0 && mainWindow) {
      dialog.showErrorBox(
        "Skysight backend stopped",
        `The backend process exited unexpectedly (code ${code}).\nPlease restart the app.`,
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
    title: "Skysight",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow loading local resources (e.g. model files) in development; safe since we disable nodeIntegration and contextIsolation is true
    },
    show: false,
  });

  mainWindow.loadURL(BACKEND_BASE_URL);
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
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' " +
            BACKEND_BASE_URL +
            ";" +
            "connect-src 'self' " +
            BACKEND_BASE_URL +
            " ws://" +
            BACKEND_HOST +
            ":" +
            BACKEND_PORT +
            ";" +
            "img-src 'self' blob: data: " +
            BACKEND_BASE_URL +
            ";" +
            "font-src 'self' data: " +
            BACKEND_BASE_URL +
            ";" +
            "media-src 'self' blob: data: " +
            BACKEND_BASE_URL +
            ";",
        ],
      },
    });
  });
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === "media");
    },
  );

  await startBackend();

  try {
    await waitForBackend();
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      "Aerview failed to start",
      `The backend could not be reached.\n\nMake sure no other app is using port ${BACKEND_PORT}.\n\n` +
        err.message,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (backendProcess && ownsBackend) {
    backendProcess.kill();
    backendProcess = null;
  }
  app.quit();
});

app.on("before-quit", () => {
  if (backendProcess && ownsBackend) {
    backendProcess.kill();
    backendProcess = null;
  }
});
