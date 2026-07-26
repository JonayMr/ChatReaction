const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let reactionsCache = [];
let twitchSettings = { channel: '', bot: '', token: '' };
let globalVolume = 1.0;
let animationDirection = 'right';

function normalizeDirection(dir) {
  const d = String(dir || '').toLowerCase();
  return (d === 'left' || d === 'top' || d === 'bottom') ? d : 'right';
}

function resolvePortableRoot(baseDir) {
  if (!baseDir) return null;

  const directReaction = path.join(baseDir, 'reaction.html');
  if (fs.existsSync(directReaction)) return baseDir;

  const parentDir = path.dirname(baseDir);
  const parentReaction = path.join(parentDir, 'reaction.html');
  if (fs.existsSync(parentReaction)) return parentDir;

  return baseDir;
}

function getDataDir() {
  const portableBase = getPortableBaseDir();
  if (portableBase) {
    return path.join(portableBase, 'data');
  }
  return path.join(app.getPath('userData'), 'reactions');
}

function getPortableBaseDir() {
  const override = String(process.env.CHAT_REACTION_PORTABLE_DIR || '').trim();
  if (override) return resolvePortableRoot(override);

  if (process.env.APPIMAGE) {
    return resolvePortableRoot(path.dirname(process.env.APPIMAGE));
  }

  if (app.isPackaged) {
    return resolvePortableRoot(path.dirname(process.execPath));
  }

  return null;
}

function getStorageFile() {
  return path.join(getDataDir(), 'reactions.json');
}

function getSettingsFile() {
  return path.join(getDataDir(), 'settings.json');
}

function getOverlayDir() {
  const portableBase = getPortableBaseDir();
  if (portableBase) {
    return portableBase;
  }
  return path.join(app.getPath('userData'), 'overlay');
}

function getOverlayHtmlPath() {
  return path.join(getOverlayDir(), 'reaction.html');
}

function getOverlayConfigJsPath() {
  return path.join(getOverlayDir(), 'overlay-config.js');
}

function ensureOverlayFiles() {
  const overlayDir = getOverlayDir();
  if (!fs.existsSync(overlayDir)) fs.mkdirSync(overlayDir, { recursive: true });

  const srcReaction = path.join(__dirname, 'reaction.html');
  const dstReaction = getOverlayHtmlPath();
  if (fs.existsSync(srcReaction)) {
    fs.copyFileSync(srcReaction, dstReaction);
  }

  const cfgPath = getOverlayConfigJsPath();
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, 'window.CHAT_REACTION_CONFIG = {"reactions":[],"twitch":{"channel":"","bot":"","token":""},"globalVolume":1};\n');
  }
}

function ensureUserData() {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const storageFile = getStorageFile();
  if (!fs.existsSync(storageFile)) {
    fs.writeFileSync(storageFile, JSON.stringify([], null, 2));
  }

  const settingsFile = getSettingsFile();
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify(twitchSettings, null, 2));
  }

  ensureOverlayFiles();
}

function loadReactions() {
  try {
    const out = JSON.parse(fs.readFileSync(getStorageFile(), 'utf-8')) || [];
    reactionsCache = Array.isArray(out) ? out : [];
  } catch (e) {
    reactionsCache = [];
  }
  return reactionsCache;
}

function loadTwitchSettings() {
  try {
    const out = JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')) || {};
    twitchSettings = {
      channel: out.channel || '',
      bot: out.bot || '',
      token: out.token || ''
    };
    animationDirection = normalizeDirection(out.animationDirection);
    const parsedVol = Number(out.globalVolume);
    if (Number.isFinite(parsedVol)) {
      globalVolume = Math.max(0, Math.min(1, parsedVol));
    }
  } catch (e) {
    twitchSettings = { channel: '', bot: '', token: '' };
    animationDirection = 'right';
  }
  return { ...twitchSettings, globalVolume, animationDirection };
}

function fileToDataURL(p) {
  try {
    if (!p || !fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    const ext = (path.extname(p) || '').toLowerCase();
    const mime = {
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.mp3': 'audio/mpeg'
    }[ext] || 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

function exportOverlayConfig() {
  const reactions = (reactionsCache || []).map((r) => ({
    id: r.id,
    trigger: r.trigger || '',
    threshold: r.threshold !== undefined ? Number(r.threshold) : 1,
    volume: r.volume !== undefined ? Number(r.volume) : globalVolume,
    direction: typeof r.direction === 'string' ? r.direction : 'right',
    imageWidth: r.imageWidth !== undefined ? Number(r.imageWidth) : (r.imageHeight !== undefined ? Number(r.imageHeight) : 256),
    imageData: r.image ? fileToDataURL(r.image) : null,
    audioData: r.audio ? fileToDataURL(r.audio) : null
  }));

  const cfg = {
    version: 1,
    generatedAt: new Date().toISOString(),
    globalVolume,
    animationDirection,
    twitch: {
      channel: twitchSettings.channel || '',
      bot: twitchSettings.bot || '',
      token: twitchSettings.token || ''
    },
    reactions
  };

  const js = `window.CHAT_REACTION_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`;
  fs.writeFileSync(getOverlayConfigJsPath(), js);
  return cfg;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1190,
    height: 870,
    resizable: false,
    maximizable: false,
    minimizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  Menu.setApplicationMenu(null);
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  win.setMinimumSize(1190, 870);
  win.setMaximumSize(1190, 870);
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  ensureUserData();
  loadReactions();
  loadTwitchSettings();
  try {
    exportOverlayConfig();
    console.log('[OverlayConfig] Exported:', getOverlayConfigJsPath());
  } catch (e) {
    console.error('[OverlayConfig] Export error:', e.message);
  }

  ipcMain.handle('open-file', async (event, type) => {
    let filters = [];
    if (type === 'image') filters = [{ name: 'Images', extensions: ['png', 'gif', 'webp'] }];
    if (type === 'audio') filters = [{ name: 'Audio', extensions: ['mp3'] }];
    const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('save-reaction', async (event, reaction) => {
    try {
      const baseDir = getDataDir();
      const storageFile = getStorageFile();
      let all = [];
      if (fs.existsSync(storageFile)) {
        try { all = JSON.parse(fs.readFileSync(storageFile, 'utf-8')); } catch (e) { all = []; }
      }

      const id = reaction.id || Date.now();
      const existing = all.find((r) => r.id === id) || null;
      const saved = {
        id,
        trigger: reaction.trigger,
        threshold: reaction.threshold || 1,
        volume: reaction.volume !== undefined ? reaction.volume : globalVolume,
        direction: typeof reaction.direction === 'string' ? reaction.direction : (existing && existing.direction) || 'right'
      };

      if (reaction.imagePath) {
        const ext = path.extname(reaction.imagePath);
        const dest = path.join(baseDir, `${id}-image${ext}`);
        fs.copyFileSync(reaction.imagePath, dest);
        saved.image = dest;
        saved.imageWidth = 256;
        if (existing && existing.image && existing.image !== dest && fs.existsSync(existing.image)) {
          try { fs.unlinkSync(existing.image); } catch (e) {}
        }
      } else if (existing && existing.image) {
        saved.image = existing.image;
        saved.imageWidth = existing.imageWidth !== undefined
          ? Number(existing.imageWidth)
          : (existing.imageHeight !== undefined ? Number(existing.imageHeight) : 256);
      }

      if (reaction.audioPath) {
        const ext = path.extname(reaction.audioPath);
        const dest = path.join(baseDir, `${id}-audio${ext}`);
        fs.copyFileSync(reaction.audioPath, dest);
        saved.audio = dest;
        if (existing && existing.audio && existing.audio !== dest && fs.existsSync(existing.audio)) {
          try { fs.unlinkSync(existing.audio); } catch (e) {}
        }
      } else if (existing && existing.audio) {
        saved.audio = existing.audio;
      }

      all = all.filter((r) => r.id !== id);
      all.push(saved);
      fs.writeFileSync(storageFile, JSON.stringify(all, null, 2));
      reactionsCache = all;
      const cfg = exportOverlayConfig();
      return { ok: true, saved, configPath: getOverlayConfigJsPath(), count: cfg.reactions.length };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('list-reactions', async () => {
    return loadReactions();
  });

  ipcMain.handle('save-twitch-settings', async (event, settings) => {
    twitchSettings = {
      channel: settings.channel || '',
      bot: settings.bot || '',
      token: settings.token || ''
    };
    animationDirection = normalizeDirection(settings.animationDirection);
    fs.writeFileSync(getSettingsFile(), JSON.stringify({ ...twitchSettings, globalVolume, animationDirection }, null, 2));
    exportOverlayConfig();
    return { ok: true, settings: { ...twitchSettings, animationDirection }, configPath: getOverlayConfigJsPath() };
  });

  ipcMain.handle('get-twitch-settings', async () => {
    return loadTwitchSettings();
  });

  ipcMain.handle('set-volume', async (event, v) => {
    globalVolume = Number(v) || 1.0;
    fs.writeFileSync(getSettingsFile(), JSON.stringify({ ...twitchSettings, globalVolume, animationDirection }, null, 2));
    exportOverlayConfig();
    return { ok: true };
  });

  ipcMain.handle('clear-reactions', async () => {
    try {
      const baseDir = getDataDir();
      const storageFile = getStorageFile();
      const settingsFile = getSettingsFile();
      let old = [];
      if (fs.existsSync(storageFile)) {
        try { old = JSON.parse(fs.readFileSync(storageFile, 'utf-8')) || []; } catch (e) { old = []; }
      }
      for (const it of old) {
        if (it.image && fs.existsSync(it.image)) {
          try { fs.unlinkSync(it.image); } catch (e) {}
        }
        if (it.audio && fs.existsSync(it.audio)) {
          try { fs.unlinkSync(it.audio); } catch (e) {}
        }
      }
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(storageFile, JSON.stringify([], null, 2));
      if (!fs.existsSync(settingsFile)) {
        fs.writeFileSync(settingsFile, JSON.stringify({ ...twitchSettings, globalVolume, animationDirection }, null, 2));
      }
      reactionsCache = [];
      exportOverlayConfig();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('get-overlay-path', async () => {
    return pathToFileURL(getOverlayHtmlPath()).href;
  });

  ipcMain.handle('get-overlay-config-path', async () => {
    return pathToFileURL(getOverlayConfigJsPath()).href;
  });

  ipcMain.handle('open-external', async (event, targetUrl) => {
    try {
      const url = String(targetUrl || '');
      if (!/^https?:\/\//i.test(url)) {
        return { ok: false, error: 'URL inválida' };
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('delete-reaction', async (event, id) => {
    try {
      const storageFile = getStorageFile();
      let all = [];
      if (fs.existsSync(storageFile)) {
        try { all = JSON.parse(fs.readFileSync(storageFile, 'utf-8')); } catch (e) { all = []; }
      }
      const existing = all.find((r) => r.id === id);
      if (existing) {
        if (existing.image && fs.existsSync(existing.image)) {
          try { fs.unlinkSync(existing.image); } catch (e) {}
        }
        if (existing.audio && fs.existsSync(existing.audio)) {
          try { fs.unlinkSync(existing.audio); } catch (e) {}
        }
      }
      all = all.filter((r) => r.id !== id);
      fs.writeFileSync(storageFile, JSON.stringify(all, null, 2));
      reactionsCache = all;
      exportOverlayConfig();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
