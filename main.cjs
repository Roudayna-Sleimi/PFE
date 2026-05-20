const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const BACKEND_HOST = "127.0.0.1";
const DESKTOP_BACKEND_PORT = Number(process.env.CNC_PULSE_DESKTOP_PORT || 5050);
const PACKAGED_APP_URL = `http://${BACKEND_HOST}:${DESKTOP_BACKEND_PORT}`;

const getRuntimeDataDir = () => process.env.CNC_PULSE_DATA_DIR
  ? path.resolve(process.env.CNC_PULSE_DATA_DIR)
  : path.join(app.getPath("userData"), "backend-data");

const getWatchSettingsPath = () => path.join(getRuntimeDataDir(), "watch-settings.json");

const readStoredWatchDir = () => {
  try {
    const settingsPath = getWatchSettingsPath();
    if (!fs.existsSync(settingsPath)) return "";
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return typeof parsed?.watchDir === "string" ? parsed.watchDir.trim() : "";
  } catch {
    return "";
  }
};

const writeStoredWatchDir = (watchDir) => {
  fs.writeFileSync(getWatchSettingsPath(), JSON.stringify({ watchDir }, null, 2));
};

const resolvePickerDefaultPath = (preferredDir) => {
  const trimmed = String(preferredDir || "").trim();

  if (trimmed && fs.existsSync(trimmed)) {
    return trimmed;
  }

  if (trimmed) {
    const parentDir = path.dirname(trimmed);
    if (fs.existsSync(parentDir)) {
      return parentDir;
    }
  }

  return app.getPath("documents");
};

const promptForWatchDir = async (preferredDir, options = {}) => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, {
    title: options.title || "Choisir le dossier a surveiller",
    buttonLabel: options.buttonLabel || "Choisir ce dossier",
    defaultPath: resolvePickerDefaultPath(preferredDir),
    properties: ["openDirectory"],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
};

const registerDesktopBridge = () => {
  global.__cncPulseDesktop = {
    selectWatchDir: (preferredDir) => promptForWatchDir(preferredDir),
  };
};

const prepareDesktopWatchDir = async () => {
  process.env.CNC_PULSE_DATA_DIR = getRuntimeDataDir();
  if (!fs.existsSync(process.env.CNC_PULSE_DATA_DIR)) {
    fs.mkdirSync(process.env.CNC_PULSE_DATA_DIR, { recursive: true });
  }

  registerDesktopBridge();

  const storedWatchDir = readStoredWatchDir();
  if (storedWatchDir && fs.existsSync(storedWatchDir)) {
    process.env.DOSSIER_WATCH_DIR = storedWatchDir;
    return;
  }

  const selectedWatchDir = await promptForWatchDir(process.env.DOSSIER_WATCH_DIR, {
    title: "Choisir le repertoire dossiers du client",
    buttonLabel: "Utiliser ce dossier",
  });

  if (!selectedWatchDir) {
    const error = new Error("Choisissez un dossier client avant d'ouvrir l'application.");
    error.code = "WATCH_DIR_REQUIRED";
    throw error;
  }

  process.env.DOSSIER_WATCH_DIR = selectedWatchDir;
  writeStoredWatchDir(selectedWatchDir);
};

const checkEmbeddedBackend = () => new Promise((resolve) => {
  const req = http.get(
    {
      hostname: BACKEND_HOST,
      port: DESKTOP_BACKEND_PORT,
      path: "/api/health",
      timeout: 1500,
    },
    (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    },
  );

  req.on("timeout", () => {
    req.destroy();
    resolve(false);
  });

  req.on("error", () => resolve(false));
});

async function ensureDesktopBackend() {
  if (process.env.ELECTRON_RENDERER_URL) return;

  const backendReady = await checkEmbeddedBackend();
  if (backendReady) return;

  await prepareDesktopWatchDir();
  process.env.PORT = String(DESKTOP_BACKEND_PORT);
  const { startServer } = require("./backend/server.js");
  await startServer();
}

const writeStartupErrorLog = (error) => {
  try {
    const logPath = path.join(app.getPath("userData"), "startup-error.log");
    const details = [
      `[${new Date().toISOString()}]`,
      error?.stack || error?.message || String(error),
      "",
    ].join("\n");
    fs.appendFileSync(logPath, details);
    return logPath;
  } catch {
    return null;
  }
};

const startupErrorMessage = (error, logPath) => {
  const details = error?.message || String(error);

  if (error?.code === "WATCH_DIR_REQUIRED") {
    return [
      "Le dossier client est obligatoire au premier demarrage.",
      "Relancez l'application puis choisissez le repertoire dossiers.",
      "",
      `Details: ${details}`,
      logPath ? `Log: ${logPath}` : "",
    ].filter(Boolean).join("\n");
  }

  return [
    "Le backend n'a pas pu demarrer.",
    "Verifiez MongoDB et backend/.env sur cette machine.",
    "",
    `Details: ${details}`,
    logPath ? `Log: ${logPath}` : "",
  ].filter(Boolean).join("\n");
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    win.loadURL(rendererUrl);
  } else {
    win.loadURL(PACKAGED_APP_URL);
  }

  if (rendererUrl || !app.isPackaged) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  try {
    await ensureDesktopBackend();
    createWindow();
  } catch (error) {
    const logPath = writeStartupErrorLog(error);
    dialog.showErrorBox(
      "CNC Pulse Dashboard - Erreur de demarrage",
      startupErrorMessage(error, logPath),
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
