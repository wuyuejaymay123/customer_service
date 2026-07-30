import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { BrowserContext, Page } from 'playwright';
import {
  LifecycleStateEnum,
  PlatformTypeEnum,
  EnvironmentTypeEnum,
  StrategyInfo,
  ILogger,
  LogInstance,
  Context,
} from '../../backend/types';
import {
  CTX_PLATFORM,
  CTX_APP_NAME,
  CTX_APP_ID,
  CTX_INSTANCE_ID,
} from '../../backend/constants';

const DOCUMENTS_DIR = path.join(os.homedir(), 'Documents');
const APP_DIR = path.join(DOCUMENTS_DIR, 'chatgpt-on-cs');
fs.mkdirSync(APP_DIR, { recursive: true });

const SESSIONS_DIR = path.join(APP_DIR, 'sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

export interface Lifecycle {
  instance_id: number;
  start(): Promise<void>;
  action(): Promise<void>;
  stop(): Promise<void>;
  loadStorageState(): Promise<void>;
  saveStorageState(): Promise<void>;
  deleteStorageState(): Promise<void>;
  getLogInstance(): LogInstance;
}

export abstract class StrategyLifecycle implements Lifecycle {
  abstract status: LifecycleStateEnum;

  abstract context: BrowserContext;

  abstract page: Page;

  abstract instance_id: number;

  abstract log: ILogger;

  abstract url: string;

  static info(): StrategyInfo {
    return {
      id: 'base',
      type: PlatformTypeEnum.OTHER,
      name: '基础策略',
      avatar: '',
      desc: '',
      env: EnvironmentTypeEnum.WEB,
      impl: false,
    };
  }

  async start() {
    if (!this.page || this.page.isClosed()) {
      this.page = await this.context.newPage();
      await this.loadStorageState();
    }

    await this.page.goto(this.url);
    await this.page.waitForTimeout(1500);
    this.status = LifecycleStateEnum.INIT;
  }

  abstract initParams(): void;

  abstract init(): Promise<void>;

  abstract stepRun(): Promise<void>;

  async stop() {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
    } catch (e) {
      this.log.warn(`关闭策略时发生异常：${e}`);
    }
    this.initParams();
  }

  async action() {
    try {
      if (this.status === LifecycleStateEnum.INIT) {
        return await this.init();
      }
      if (this.status === LifecycleStateEnum.RUN) {
        return await this.stepRun();
      }
      if (this.status === LifecycleStateEnum.DESTROY) {
        return await this.stop();
      }
      return await this.start();
    } catch (e) {
      console.error(`执行 action 时发生异常：${e}`);
      if (e instanceof Error) {
        console.error(e.stack);
      }
      // 暂态错误不每 tick 强制 start()，避免登录页反复刷新
      return undefined;
    }
  }

  async loadStorageState() {
    try {
      const sessionDir = path.join(SESSIONS_DIR, `session_${this.instance_id}`);
      fs.mkdirSync(sessionDir, { recursive: true });

      const cookiesPath = path.join(sessionDir, 'cookies.json');
      const localStoragePath = path.join(sessionDir, 'localStorage.json');

      if (!fs.existsSync(cookiesPath)) {
        fs.writeFileSync(cookiesPath, JSON.stringify([]));
      }
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
      await this.context.addCookies(cookies);

      if (!fs.existsSync(localStoragePath)) {
        fs.writeFileSync(localStoragePath, JSON.stringify({}));
      }
      const localStorageData: Record<string, string> = JSON.parse(
        fs.readFileSync(localStoragePath, 'utf-8'),
      );

      await this.context.addInitScript((storage) => {
        for (const [key, value] of Object.entries(storage)) {
          localStorage.setItem(key, value);
        }
      }, localStorageData);
    } catch (e) {
      console.warn('加载存储状态时发生异常：', e);
    }
  }

  async saveStorageState() {
    try {
      const sessionDir = path.join(SESSIONS_DIR, `session_${this.instance_id}`);
      fs.mkdirSync(sessionDir, { recursive: true });

      const cookiesPath = path.join(sessionDir, 'cookies.json');
      const localStoragePath = path.join(sessionDir, 'localStorage.json');

      const cookies = await this.context.cookies();
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies));

      const localStorageData = await this.page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) {
            data[key] = localStorage.getItem(key) || '';
          }
        }
        return data;
      });

      fs.writeFileSync(localStoragePath, JSON.stringify(localStorageData));
    } catch (e) {
      console.warn('保存存储状态时发生异常：', e);
    }
  }

  async deleteStorageState() {
    try {
      const sessionDir = path.join(SESSIONS_DIR, `session_${this.instance_id}`);
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('删除存储状态时发生异常：', e);
    }
  }

  getLogInstance(): LogInstance {
    const { id, avatar } = (
      Object.getPrototypeOf(this).constructor as typeof StrategyLifecycle
    ).info();
    return {
      id: `${this.instance_id}`,
      app_id: id,
      avatar,
    };
  }

  createCtx(): Context {
    const { id, name } = (
      Object.getPrototypeOf(this).constructor as typeof StrategyLifecycle
    ).info();
    const ctx = new Map<string, string>();
    ctx.set(CTX_PLATFORM, id);
    ctx.set(CTX_APP_NAME, name);
    ctx.set(CTX_APP_ID, id);
    ctx.set(CTX_INSTANCE_ID, `${this.instance_id}`);
    return ctx;
  }
}
