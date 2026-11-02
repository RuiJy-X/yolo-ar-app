const { app, BrowserWindow, dialog, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");
const HOST = "127.0.0.1";
const PORT = 8000;
const BASE = `http://${HOST}:${PORT}`;
const DEV = "http://localhost:5173";
let backend, mainWindow, log, quitting = false, backendFailure;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function health() {
  return new Promise(resolve => {
    const req = http.get(`${BASE}/health`, res => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => { try { const data = JSON.parse(body); resolve(res.statusCode === 200 && data.pipeline_loaded ? data : null); } catch { resolve(null); } });
    });
    req.setTimeout(2000, () => req.destroy());
    req.on("error", () => resolve(null));
  });
}
function portAvailable() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(PORT, HOST, () => server.close(() => resolve(true)));
  });
}
function stopBackend() {
  if (!backend || backend.exitCode !== null) return;
  spawn("taskkill", ["/pid", String(backend.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
}
async function startBackend() {
  if (!app.isPackaged && await health()) return;
  if (!(await portAvailable())) throw new Error(`Port ${PORT} is in use. Close the other Skysight/backend instance and retry.`);
  const dir = app.isPackaged ? path.join(process.resourcesPath, "backend") : path.join(__dirname, "backend", "act_reg_final_version");
  const exe = app.isPackaged ? path.join(dir, "SkysightBackend.exe") : path.join(dir, ".venv", "Scripts", "python.exe");
  if (!fs.existsSync(exe)) throw new Error(`Backend runtime is missing: ${exe}`);
  const args = app.isPackaged ? [] : ["-m", "uvicorn", "websocket_api:app", "--host", HOST, "--port", String(PORT)];
  backend = spawn(exe, args, { cwd: dir, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: "1", SKYSIGHT_DATA_DIR: path.join(app.getPath("appData"), "Skysight", "outputs") } });
  for (const stream of [backend.stdout, backend.stderr]) stream.on("data", data => log.write(data));
  backend.on("error", error => { backendFailure = error; });
  backend.on("exit", code => {
    backendFailure = new Error(`Backend exited (code ${code}).`);
    if (!quitting && mainWindow && mainWindow.webContents.getURL().startsWith(BASE)) {
      dialog.showErrorBox("Skysight backend stopped", `${backendFailure.message}\nLog: ${log.path}`);
      app.quit();
    }
  });
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline && !quitting) {
    if (backendFailure) throw backendFailure;
    const data = await health();
    if (data && (!app.isPackaged || data.process_id === backend.pid)) return;
    await delay(500);
  }
  throw new Error("Model initialization timed out after five minutes.");
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId("com.skysight.desktop");
    const logs = path.join(app.getPath("appData"), "Skysight", "logs");
    fs.mkdirSync(logs, { recursive: true });
    fs.mkdirSync(path.join(app.getPath("appData"), "Skysight", "ultralytics", "Ultralytics"), { recursive: true });
    log = fs.createWriteStream(path.join(logs, "backend.log"), { flags: "a" });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(permission === "media" && [BASE, DEV].some(origin => contents.getURL().startsWith(origin + "/"))));
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => permission === "media" && [BASE, DEV].includes(origin.replace(/\/$/, "")));
    if (app.isPackaged) session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:8000; worker-src 'self' blob:"] } }));
    mainWindow = new BrowserWindow({ width: 1280, height: 800, minWidth: 960, minHeight: 600, title: "Skysight", icon: app.isPackaged ? path.join(process.resourcesPath, "backend", "data", "frontend", "android-chrome-512x512.png") : path.join(__dirname, "public", "android-chrome-512x512.png"), webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true } });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.on("closed", () => { mainWindow = null; app.quit(); });
    await mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent("<html><body style='font:18px system-ui;padding:64px;background:#f5f7fb;color:#17345c'><h1>Skysight</h1><p>Loading analysis models...</p><p>First startup on CPU can take several minutes.</p></body></html>"));
    try {
      await startBackend();
      if (!quitting) await mainWindow.loadURL(app.isPackaged ? BASE : DEV);
    } catch (error) {
      if (!quitting) dialog.showErrorBox("Skysight failed to start", `${error.message}\n\nLog: ${log.path}`);
      app.quit();
    }
  }).catch(error => { dialog.showErrorBox("Skysight failed to start", error.message); app.quit(); });
}
app.on("before-quit", () => { quitting = true; stopBackend(); });
app.on("window-all-closed", () => app.quit());
