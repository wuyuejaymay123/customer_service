import { BrowserWindow } from 'electron';

export class LoggerService {
  constructor(private mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  public log(msg: string, _instance?: unknown) {
    console.log(msg);
    this.mainWindow.webContents.send('broadcast', {
      event: 'log_show',
      data: {
        time: new Date().toLocaleTimeString(),
        content: msg,
      },
    });
  }

  public error(msg: string, _instance?: unknown) {
    console.error('[ERROR]', msg);
    this.mainWindow.webContents.send('broadcast', {
      event: 'log_show',
      data: {
        time: new Date().toLocaleTimeString(),
        content: `[ERROR] ${msg}`,
      },
    });
  }

  public info(msg: string, _instance?: unknown) {
    console.info('[INFO]', msg);
    this.mainWindow.webContents.send('broadcast', {
      event: 'log_show',
      data: {
        time: new Date().toLocaleTimeString(),
        content: `[INFO] ${msg}`,
      },
    });
  }

  public warn(msg: string, _instance?: unknown) {
    console.warn('[WARN]', msg);
    this.mainWindow.webContents.send('broadcast', {
      event: 'log_show',
      data: {
        time: new Date().toLocaleTimeString(),
        content: `[WARN] ${msg}`,
      },
    });
  }

  public debug(msg: string, _instance?: unknown) {
    console.debug('[DEBUG]', msg);
  }

  public success(msg: string, _instance?: unknown) {
    console.log('[SUCCESS]', msg);
    this.mainWindow.webContents.send('broadcast', {
      event: 'log_show',
      data: {
        time: new Date().toLocaleTimeString(),
        content: `[SUCCESS] ${msg}`,
      },
    });
  }

  /** 向主窗口推送业务事件（Halt／点数耗尽等） */
  public emit(event: string, data: Record<string, unknown> = {}) {
    this.mainWindow.webContents.send('broadcast', { event, data });
  }
}
