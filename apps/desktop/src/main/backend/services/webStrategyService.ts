import os from 'os';
import path from 'path';
import { chromium, Browser, BrowserContext } from 'playwright';
import { getChromePath } from '../../utils/playwright';
import { Pinduoduo } from '../../platforms/pinduoduo';
import G_V from '../../platforms/globalState';
import { Instance } from '../entities/instance';
import { Config } from '../entities/config';
import {
  StrategyServiceStatusEnum,
  MessageDTO,
  Context,
  ReplyDTO,
  GenericConfig,
  ILogger,
} from '../types';
import { MessageService } from './messageService';
import { LoggerService } from './loggerService';
import { ConfigController } from '../controllers/configController';
import { PluginDefaultRunCode } from '../constants';
import PluginService from './pluginService';
import { MessageController } from '../controllers/messageController';
import {
  shouldAutoReopenBrowserOnPageClose,
  shouldAttachPddOnSync,
  loginStatusAfterDriverResume,
  loginStatusOnAttach,
  resolveLoginStatusFromProbe,
} from './webStrategyPolicy';

const downloadPath = path.join(os.homedir(), 'Downloads');

/**
 * 仅负责 WEB 渠道（拼多多）：一实例一 BrowserContext／独立 session。
 * 桌面渠道（千牛）仍走 __main__.exe。
 */
export class WebStrategyService {
  private strategies: Pinduoduo[] = [];

  /** instanceId -> context（禁止跨实例共用） */
  private contextByInstance = new Map<number, BrowserContext>();

  private browser: Browser | null = null;

  private status: StrategyServiceStatusEnum = StrategyServiceStatusEnum.STOPPED;

  private loopStarted = false;

  private metaTick = 0;

  /** 正在主动移除／停止的实例，禁止 page-closed 自动重启 */
  private removingIds = new Set<number>();

  private lastShouldRun = false;

  private syncMutex: Promise<void> = Promise.resolve();

  constructor(
    private log: LoggerService,
    private configController: ConfigController,
    private messageService: MessageService,
    private messageController: MessageController,
    private pluginService: PluginService,
  ) {}

  private asLogger(): ILogger {
    return this.log;
  }

  /** 串行化 sync，避免与删除／cron 交错 */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.syncMutex;
    this.syncMutex = prev.then(() => gate);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async ensureLoop() {
    if (this.loopStarted) return;
    this.loopStarted = true;
    // eslint-disable-next-line no-void
    void this.setup();
  }

  private isPageClosedError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes(
        'Target page, context or browser has been closed',
      ) ||
        error.message.includes('has been closed') ||
        error.message.includes('net::ERR_ABORTED'))
    );
  }

  private async setup() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        this.metaTick += 1;
        const snapshot = [...this.strategies];
        const running = this.status === StrategyServiceStatusEnum.RUNNING;
        for (const strategy of snapshot) {
          if (
            this.removingIds.has(strategy.instance_id) ||
            !this.strategies.includes(strategy)
          ) {
            // eslint-disable-next-line no-continue
            continue;
          }
          try {
            if (running) {
              // eslint-disable-next-line no-await-in-loop
              await strategy.action();
              // eslint-disable-next-line no-await-in-loop
              await strategy.saveStorageState();
            }
            // 未开自动回复也要探测扫码登录状态，否则卡片会一直停在「待扫码」
            if (this.metaTick % 5 === 0 || !running) {
              // eslint-disable-next-line no-await-in-loop
              await this.refreshInstanceMeta(strategy);
            }
          } catch (e) {
            console.error('Web strategy error:', e);
            this.log.error(
              `拼多多实例 #${strategy.instance_id} 异常：${
                e instanceof Error ? e.message : String(e)
              }`,
            );
            if (
              this.isPageClosedError(e) &&
              !this.removingIds.has(strategy.instance_id) &&
              this.strategies.includes(strategy)
            ) {
              // eslint-disable-next-line no-await-in-loop
              await this.handlePageClosed(strategy.instance_id);
            }
          }
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error('WebStrategyService setup error:', e);
      }
    }
  }

  private async refreshInstanceMeta(strategy: Pinduoduo) {
    try {
      const meta = await strategy.probeShopMeta();
      const inst = await Instance.findByPk(strategy.instance_id);
      if (!inst) return;
      let dirty = false;
      const nextStatus = resolveLoginStatusFromProbe(
        inst.login_status,
        meta.loginStatus,
      );
      if (nextStatus) {
        inst.login_status = nextStatus;
        dirty = true;
      }
      if (meta.shopName && inst.shop_name !== meta.shopName) {
        inst.shop_name = meta.shopName;
        dirty = true;
      }
      if (dirty) {
        await inst.save();
        this.log.info(
          `拼多多实例 #${strategy.instance_id}：${
            meta.shopName || '未命名店铺'
          }（${inst.login_status === 'logged_in' ? '已登录' : '待扫码'}）`,
        );
      }
      // 扫码拿到店名后，自动建／绑网关店铺（需已登录网关）
      if (inst.shop_name && !inst.gateway_shop_id) {
        try {
          const { ensureInstanceGatewayShop } = await import(
            './ensureInstanceGatewayShop'
          );
          const r = await ensureInstanceGatewayShop(strategy.instance_id);
          if (r.gatewayShopId) {
            this.log.info(
              `拼多多实例 #${strategy.instance_id} 已自动${
                r.created ? '创建并' : ''
              }绑定网关店铺「${r.shopName}」`,
            );
          } else if (r.reason && r.reason !== 'gateway_not_logged_in') {
            console.warn(
              'ensureInstanceGatewayShop',
              strategy.instance_id,
              r.reason,
            );
          }
        } catch (e) {
          console.warn('ensureInstanceGatewayShop failed', e);
        }
      }
    } catch (e) {
      console.warn('refreshInstanceMeta failed', e);
    }
  }

  /** 页面／浏览器关闭：卸下策略并标记 closed，不自动重开 */
  private async handlePageClosed(instanceId: number) {
    if (this.removingIds.has(instanceId)) {
      return;
    }
    const inst = await Instance.findByPk(instanceId);
    if (!inst || inst.app_id !== 'pinduoduo') {
      await this.removeTask(instanceId, false);
      return;
    }

    if (shouldAutoReopenBrowserOnPageClose()) {
      this.log.warn(`拼多多实例 #${instanceId} 页面已关闭，正在重启…`);
      await this.removeTask(instanceId, false);
      if (this.removingIds.has(instanceId)) return;
      const still = await Instance.findByPk(instanceId);
      if (!still || still.login_status === 'closed') return;
      await this.addTask('pinduoduo', instanceId);
      return;
    }

    this.log.warn(
      `拼多多实例 #${instanceId} 浏览器已关闭，标记为 closed（暂停自动回复再开可恢复）`,
    );
    inst.login_status = 'closed';
    await inst.save();
    await this.removeTask(instanceId, false);
  }

  private async getChromeExecutable(): Promise<string> {
    const generic = await this.configController.getConfigByType({
      type: 'generic',
      appId: undefined,
      instanceId: undefined,
    });
    const fromCfg =
      generic && 'chromePath' in generic
        ? String((generic as { chromePath?: string }).chromePath || '').trim()
        : '';
    if (fromCfg) return fromCfg;
    const found = await getChromePath();
    if (!found) {
      throw new Error(
        '找不到 Chrome。请安装 Google Chrome，或在设置中填写 chrome 路径。',
      );
    }
    return found;
  }

  private async evictStaleContexts() {
    if (this.browser && this.browser.isConnected()) {
      return;
    }
    for (const [id, ctx] of this.contextByInstance) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.close().catch(() => undefined);
      this.contextByInstance.delete(id);
    }
    this.browser = null;
  }

  private async getOrCreateContext(
    instanceId: number,
  ): Promise<BrowserContext> {
    await this.evictStaleContexts();

    const existing = this.contextByInstance.get(instanceId);
    if (existing) {
      return existing;
    }

    const chromePath = await this.getChromeExecutable();
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        executablePath: chromePath,
        headless: false,
        args: [
          '--no-sandbox',
          '--ignore-certificate-errors',
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
        ],
      });
    }

    // 每个实例独立 context，绝不与其他实例共用 cookie
    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: null,
      strictSelectors: false,
      acceptDownloads: true,
    });

    context.on('page', (page) => {
      page.on('download', async (download) => {
        const suggestedPath = path.join(
          downloadPath,
          download.suggestedFilename(),
        );
        await download.saveAs(suggestedPath);
        this.log.log(`Downloaded to: ${suggestedPath}`);
      });
    });

    this.contextByInstance.set(instanceId, context);
    return context;
  }

  private async getReply(ctx: Context, msgs: MessageDTO[]): Promise<ReplyDTO> {
    const cfg = (await this.configController.get(ctx)) as Config;
    await this.messageService.extractMsgInfo(cfg, ctx, msgs);

    let reply: ReplyDTO;
    try {
      if (cfg.use_plugin && cfg.plugin_id) {
        reply = await this.pluginService.executePlugin(
          cfg.plugin_id,
          ctx,
          msgs,
        );
      } else {
        const replyData = await this.pluginService.executePluginCode(
          PluginDefaultRunCode,
          ctx,
          msgs,
        );
        reply = replyData.data;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.log.error(`回复失败: ${errMsg}`);
      reply = this.messageService.notifySendFailure(cfg, ctx, errMsg);
    }

    if (reply.type !== 'NO_REPLY') {
      await this.messageController.saveMessages(ctx, reply, msgs);
    }
    return reply;
  }

  private async getDefaultReply(ctx: Context): Promise<ReplyDTO> {
    const cfg = (await this.configController.get(ctx)) as Config;
    // 渠道发送失败时的兜底：走 FailureHandoff，不再静默默认回复
    return this.messageService.notifySendFailure(
      cfg,
      ctx,
      '渠道发送失败',
    );
  }

  private async getGenericConfig(
    appId: string,
    instanceId: number,
  ): Promise<GenericConfig> {
    const cfg = await this.configController.getConfigByType({
      appId,
      instanceId: String(instanceId),
      type: 'generic',
    });
    return {
      ...(cfg as GenericConfig),
      hasTransferReply: Boolean(
        (cfg as { hasTransferReply?: boolean })?.hasTransferReply,
      ),
      defaultTransferReply:
        (cfg as { defaultTransferReply?: string })?.defaultTransferReply || '',
      transferReplyMatch:
        (cfg as { transferReplyMatch?: string })?.transferReplyMatch || '',
    };
  }

  async addTask(appId: string, instanceId: number) {
    if (appId !== Pinduoduo.info().id) {
      return;
    }
    if (this.removingIds.has(instanceId)) {
      return;
    }
    if (this.strategies.some((s) => s.instance_id === instanceId)) {
      return;
    }
    const exists = await Instance.findByPk(instanceId);
    if (!exists || exists.app_id !== 'pinduoduo') {
      this.log.warn(
        `跳过启动拼多多实例 #${instanceId}：数据库中不存在该实例`,
      );
      return;
    }

    const context = await this.getOrCreateContext(instanceId);
    const strategy = new Pinduoduo(
      context,
      instanceId,
      this.asLogger(),
      this.getGenericConfig.bind(this),
      this.getReply.bind(this),
      this.getDefaultReply.bind(this),
      (ctx, ok) => this.messageService.markTransferResult(ctx, ok),
    );
    this.strategies.push(strategy);

    const inst = await Instance.findByPk(instanceId);
    if (inst) {
      inst.login_status = loginStatusOnAttach(inst.login_status);
      await inst.save();
    }

    // session 只在 start() 建 page 后载入一次，避免重复 addCookies／initScript
    await strategy.start();
    this.log.info(
      `已启动拼多多网页客服实例 #${instanceId}，请在对应 Chrome 窗口扫码登录（一实例一店）`,
    );
    await this.refreshInstanceMeta(strategy);
  }

  async removeTask(instanceId: number, deleteSession = false) {
    this.removingIds.add(instanceId);
    try {
      const idx = this.strategies.findIndex((s) => s.instance_id === instanceId);
      if (idx === -1) {
        const ctxOnly = this.contextByInstance.get(instanceId);
        if (ctxOnly) {
          await ctxOnly.close().catch(() => undefined);
          this.contextByInstance.delete(instanceId);
        }
        if (this.contextByInstance.size === 0 && this.browser) {
          await this.browser.close().catch(() => undefined);
          this.browser = null;
        }
        return;
      }

      // 先从循环列表移除，避免关闭 context 时被误判为“掉线”而重启
      const [strategy] = this.strategies.splice(idx, 1);
      try {
        await strategy.saveStorageState();
      } catch {
        // ignore
      }
      try {
        await strategy.stop();
      } catch {
        // ignore
      }
      if (deleteSession) {
        await strategy.deleteStorageState().catch(() => undefined);
      }

      const ctx = this.contextByInstance.get(instanceId);
      if (ctx) {
        await ctx.close().catch(() => undefined);
        this.contextByInstance.delete(instanceId);
      }

      if (this.contextByInstance.size === 0 && this.browser) {
        await this.browser.close().catch(() => undefined);
        this.browser = null;
      }
    } finally {
      this.removingIds.delete(instanceId);
    }
  }

  async syncFromInstances(instances: Instance[], shouldRun: boolean) {
    return this.runExclusive(async () => {
      await this.ensureLoop();

      // 暂停→恢复：清 closed，允许再次挂浏览器
      if (!this.lastShouldRun && shouldRun) {
        for (const inst of instances) {
          if (inst.app_id !== 'pinduoduo') {
            // eslint-disable-next-line no-continue
            continue;
          }
          const next = loginStatusAfterDriverResume(
            this.lastShouldRun,
            shouldRun,
            inst.login_status,
          );
          if (next && next !== inst.login_status) {
            inst.login_status = next;
            // eslint-disable-next-line no-await-in-loop
            await inst.save();
          }
        }
      }
      this.lastShouldRun = shouldRun;

      this.status = shouldRun
        ? StrategyServiceStatusEnum.RUNNING
        : StrategyServiceStatusEnum.STOPPED;
      G_V.status = this.status;

      const generic = await this.configController.getConfigByType({
        type: 'generic',
        appId: undefined,
        instanceId: undefined,
      });
      if (generic) {
        if ('truncateWordKey' in generic) {
          G_V.truncateWordKey = generic.truncateWordKey || '';
        }
        if ('truncateWordCount' in generic) {
          G_V.truncateWordCount = generic.truncateWordCount || 210;
        }
        if ('contextCount' in generic) {
          G_V.contextCount = generic.contextCount || 20;
        }
      }

      const pddInstances = instances.filter((i) => i.app_id === 'pinduoduo');
      // 扫码／保会话与自动回复开关解耦：未开自动回复也要挂 Chrome
      const activeIds = pddInstances
        .filter((i) =>
          shouldAttachPddOnSync({
            shouldRun,
            loginStatus: i.login_status,
          }),
        )
        .map((i) => i.id);
      // 每次以当前列表为准，避免与并发 remove 交错用到过期快照
      const runningIds = () => this.strategies.map((s) => s.instance_id);

      for (const id of runningIds()) {
        if (!activeIds.includes(id)) {
          // eslint-disable-next-line no-await-in-loop
          await this.removeTask(id, false);
        }
      }

      for (const inst of pddInstances) {
        if (
          !shouldAttachPddOnSync({
            shouldRun,
            loginStatus: inst.login_status,
          })
        ) {
          // eslint-disable-next-line no-continue
          continue;
        }
        if (!runningIds().includes(inst.id)) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await this.addTask(inst.app_id, inst.id);
          } catch (e) {
            this.log.error(
              `无法打开拼多多 Chrome（实例 #${inst.id}）：${
                e instanceof Error ? e.message : String(e)
              }`,
            );
            throw e;
          }
        }
      }
    });
  }
}
