/* eslint global-require: off, no-console: off, promise/always-return: off, import/prefer-default-export: off */

import path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import { resolveHtmlPath } from '../../util';

let settingsWindow: BrowserWindow | null = null;

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

function settingsUrl(opts: { appId?: string; instanceId?: string }) {
  const base = resolveHtmlPath('settings.html');
  const url = new URL(base);
  if (opts.appId) url.searchParams.set('appId', String(opts.appId));
  if (opts.instanceId) {
    url.searchParams.set('instanceId', String(opts.instanceId));
  }
  return url.href;
}

function showSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  if (settingsWindow.isMinimized()) settingsWindow.restore();
  settingsWindow.show();
  settingsWindow.focus();
  settingsWindow.moveTop();
}

export const createWindow = async (opts: {
  appId?: string;
  instanceId?: string;
} = {}) => {
  if (isDebug) {
    // await installExtensions();
  }

  const url = settingsUrl(opts);
  console.log('[settings] open', url);

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // 用 URL 重载，保证本店／全局模式一定切到对的参数
    await settingsWindow.loadURL(url);
    showSettingsWindow();
    return;
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  settingsWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../../../.erb/dll/preload.js'),
    },
  });

  settingsWindow.loadURL(url);

  settingsWindow.on('ready-to-show', () => {
    showSettingsWindow();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  settingsWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[settings] did-fail-load', code, desc);
  });
};
