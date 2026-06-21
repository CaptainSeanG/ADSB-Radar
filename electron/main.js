import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 5173;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

function startServer() {
  if (serverProcess) return;

  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: "inherit"
  });

  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#020503",
    title: "ADSB Radar",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(SERVER_URL);
}

app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
