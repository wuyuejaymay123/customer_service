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
  shouldDropDeadStrategyForResync,
  shouldMarkClosedOnPageClose,
  loginStatusAfterDriverResume,
  loginStatusOnAttach,
  resolveLoginStatusFromProbe,
  shouldRunShopAutoReply,
  haltReasonLabel,
} from './webStrategyPolicy';
import { Op } from 'sequelize';

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

  /** master 开时，允许自动回复轮询的 instanceId */
  private autoReplyActiveIds = new Set<number>();

  /** 连续店级驱动失败计数（达阈值 Halt） */
  private driveFailCounts = new Map<number, number>();

  private static readonly DRIVE_FAIL_THRESHOLD = 5;

  private syncMutex: Promise<void> = Promise.resolve();

  private async haltShopAutoReply(
    inst: Instance,
    reason: string,
  ): Promise<void> {
    const wasEnabled = inst.auto_reply_enabled !== false;
    inst.auto_reply_enabled = false;
    inst.auto_reply_halt_reason = reason;
    await inst.save();
    this.autoReplyActiveIds.delete(inst.id);
    this.driveFailCounts.delete(inst.id);
    if (wasEnabled || reason) {
      const label = haltReasonLabel(reason) || reason;
      this.log.warn(
        `店铺「${inst.shop_name || `#${inst.id}`}」已停用自动回复：${label}`,
      );
      this.log.emit('shop_auto_reply_halt', {
        taskId: String(inst.id),
        shopName: inst.shop_name || `#${inst.id}`,
        reason,
        reasonLabel: label,
      });
    }
  }

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
        for (const strategy of snapshot) {
          if (
            this.removingIds.has(strategy.instance_id) ||
            !this.strategies.includes(strategy)
          ) {
            // eslint-disable-next-line no-continue
            continue;
          }
          try {
            const shopRun = this.autoReplyActiveIds.has(strategy.instance_id);
            if (shopRun) {
              // eslint-disable-next-line no-await-in-loop
              await strategy.action();
              // eslint-disable-next-line no-await-in-loop
              await strategy.saveStorageState();
              this.driveFailCounts.set(strategy.instance_id, 0);
            }
            // 未开自动回复也要探测扫码登录状态，否则卡片会一直停在「待扫码」
            if (this.metaTick % 5 === 0 || !shopRun) {
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
            } else if (
              this.autoReplyActiveIds.has(strategy.instance_id) &&
              !this.isPageClosedError(e)
            ) {
              const n =
                (this.driveFailCounts.get(strategy.instance_id) || 0) + 1;
              this.driveFailCounts.set(strategy.instance_id, n);
              if (n >= WebStrategyService.DRIVE_FAIL_THRESHOLD) {
                // eslint-disable-next-line no-await-in-loop
                const inst = await Instance.findByPk(strategy.instance_id);
                if (inst && inst.auto_reply_enabled !== false) {
                  // eslint-disable-next-line no-await-in-loop
                  await this.haltShopAutoReply(inst, 'drive_failures');
                }
              }
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
      let pageClosed = false;
      try {
        pageClosed = !strategy.page || strategy.page.isClosed();
      } catch {
        pageClosed = true;
      }
      if (pageClosed) {
        await this.handlePageClosed(strategy.instance_id);
        return;
      }
      const meta = await strategy.probeShopMeta();
      const inst = await Instance.findByPk(strategy.instance_id);
      if (!inst) return;
      let dirty = false;
      const prevStatus = inst.login_status;
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
      // 掉登：整店 Halt（不关窗；会话仍在 pending）
      if (
        prevStatus === 'logged_in' &&
        inst.login_status === 'pending' &&
        inst.auto_reply_enabled !== false
      ) {
        await this.haltShopAutoReply(inst, 'logged_out');
      }
      // 同店双开：拒绝第二家自动化
      if (inst.login_status === 'logged_in' && (inst.shop_name || inst.gateway_shop_id)) {
        const dupWhere: Record<string, unknown>[] = [];
        if (inst.shop_name) {
          dupWhere.push({ shop_name: inst.shop_name });
        }
        if (inst.gateway_shop_id) {
          dupWhere.push({ gateway_shop_id: inst.gateway_shop_id });
        }
        const dup = await Instance.findOne({
          where: {
            app_id: 'pinduoduo',
            id: { [Op.ne]: inst.id },
            [Op.or]: dupWhere,
          },
        });
        if (dup) {
          await this.haltShopAutoReply(inst, 'duplicate_shop');
          this.log.error(
            `店铺「${inst.shop_name}」已在实例 #${dup.id} 运行，请勿重复扫码；本实例已停用自动回复`,
          );
          await this.removeTask(inst.id, false);
          return;
        }
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

  /**
   * 页面 close：延迟判定，避免崩溃时 close 早于 disconnected 被误标 closed。
   */
  private schedulePageClosedCheck(instanceId: number) {
    setTimeout(() => {
      // eslint-disable-next-line no-void
      void this.handlePageClosed(instanceId);
    }, 400);
  }

  /** 页面／浏览器关闭：卸下策略；仅在浏览器仍连通时标 closed（用户关窗） */
  private async handlePageClosed(instanceId: number) {
    if (this.removingIds.has(instanceId)) {
      return;
    }
    const browserConnected = Boolean(this.browser?.isConnected());
    if (!shouldMarkClosedOnPageClose({ browserConnected })) {
      this.log.warn(
        `拼多多实例 #${instanceId} 页面关闭且浏览器已断开（疑似崩溃），不标 closed，等待重开`,
      );
      await this.removeTask(instanceId, false);
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
      `拼多多实例 #${instanceId} 浏览器已关闭，标记为 closed 并停用该店自动回复`,
    );
    inst.login_status = 'closed';
    await this.haltShopAutoReply(inst, 'browser_closed');
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
        '找不到可用的 Chromium 内核浏览器（系统默认需为 Edge／Chrome／Brave 等）。请安装 Microsoft Edge 或 Google Chrome，或在设置中填写浏览器路径。',
      );
    }
    this.log.info(`使用浏览器：${found}`);
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

  /**
   * 浏览器进程已死或页面已关：卸下 zombie。
   * - 进程崩溃：不写 closed，sync 可重挂
   * - 浏览器仍在、仅页面关：走 handlePageClosed（用户关窗）
   */
  private async pruneDeadStrategies(): Promise<void> {
    const browserConnected = Boolean(this.browser?.isConnected());
    const snapshot = [...this.strategies];
    for (const strategy of snapshot) {
      let pageClosed = true;
      try {
        pageClosed = !strategy.page || strategy.page.isClosed();
      } catch {
        pageClosed = true;
      }
      if (
        !shouldDropDeadStrategyForResync({ browserConnected, pageClosed })
      ) {
        // eslint-disable-next-line no-continue
        continue;
      }
      // 此处只卸 zombie 以便重挂；是否标 closed 由 schedulePageClosedCheck 判定
      // （避免崩溃瞬间 isConnected 仍为 true 被误标 closed）
      this.log.warn(
        `拼多多实例 #${strategy.instance_id} 浏览器／页面不可用，准备重新打开窗口`,
      );
      // eslint-disable-next-line no-await-in-loop
      await this.removeTask(strategy.instance_id, false);
    }
    if (!browserConnected) {
      await this.evictStaleContexts();
    }
  }

  private bindBrowserDisconnect(browser: Browser) {
    browser.on('disconnected', () => {
      if (this.browser !== browser) return;
      this.log.warn('拼多多 Chrome／Edge 进程已退出，将在下次同步时重开');
      this.browser = null;
      this.contextByInstance.clear();
      // 卸下 zombie；不标 closed，便于新增／sync 重新弹窗
      const ids = this.strategies.map((s) => s.instance_id);
      this.strategies = [];
      for (const id of ids) {
        this.driveFailCounts.delete(id);
      }
    });
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
      this.bindBrowserDisconnect(this.browser);
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
    try {
      await strategy.start();
      strategy.page.on('close', () => {
        this.schedulePageClosedCheck(instanceId);
      });
      try {
        await strategy.page.bringToFront();
      } catch {
        // 置顶失败不阻断扫码
      }
    } catch (e) {
      // 启动失败：撤掉半成品 strategy，避免 sync 误判「已在跑」
      await this.removeTask(instanceId, false).catch(() => undefined);
      throw e;
    }
    this.log.info(
      `已启动拼多多网页客服实例 #${instanceId}，请在对应 Chrome 窗口扫码登录（一实例一店）`,
    );
    await this.refreshInstanceMeta(strategy);
  }

  /** 去接待：尽力聚焦该店 Chrome 窗 */
  async focusInstance(instanceId: number): Promise<{
    ok: boolean;
    shopName?: string;
    error?: string;
  }> {
    const inst = await Instance.findByPk(instanceId);
    const shopName = inst?.shop_name || (inst ? `#${inst.id}` : undefined);
    const strategy = this.strategies.find((s) => s.instance_id === instanceId);
    if (!strategy) {
      return {
        ok: false,
        shopName,
        error: shopName
          ? `请手动切到「${shopName}」窗口`
          : '浏览器未连接，请手动打开对应店铺窗口',
      };
    }
    try {
      const page = strategy.page;
      if (!page || page.isClosed()) {
        return {
          ok: false,
          shopName,
          error: `请手动切到「${shopName || '该店'}」窗口`,
        };
      }
      await page.bringToFront();
      return { ok: true, shopName };
    } catch (e) {
      return {
        ok: false,
        shopName,
        error: `请手动切到「${shopName || '该店'}」窗口`,
      };
    }
  }

  async removeTask(instanceId: number, deleteSession = false) {
    this.removingIds.add(instanceId);
    this.driveFailCounts.delete(instanceId);
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
      // 浏览器被杀／页面已关时，先卸 zombie，否则 sync 会跳过重挂
      await this.pruneDeadStrategies();

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

      const pddInstances = instances.filter((i) => i.app_id === 'pinduoduo');
      this.autoReplyActiveIds = new Set(
        pddInstances
          .filter((i) =>
            shouldRunShopAutoReply({
              masterOn: shouldRun,
              shopEnabled: i.auto_reply_enabled !== false,
              loginStatus: i.login_status,
            }),
          )
          .map((i) => i.id),
      );

      this.status =
        this.autoReplyActiveIds.size > 0
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

      // 新实例优先挂浏览器，避免旧 zombie 失败拖死「新增」
      const toAttach = [...pddInstances]
        .filter((i) =>
          shouldAttachPddOnSync({
            shouldRun,
            loginStatus: i.login_status,
          }),
        )
        .sort((a, b) => b.id - a.id);

      for (const inst of toAttach) {
        if (runningIds().includes(inst.id)) {
          // eslint-disable-next-line no-continue
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.addTask(inst.app_id, inst.id);
        } catch (e) {
          this.log.error(
            `无法打开拼多多 Chrome（实例 #${inst.id}）：${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          // 单个失败不阻断其余实例（尤其是刚新增的）
        }
      }
    });
  }

  /** 确保指定拼多多实例已挂上浏览器（供新增后定向重试） */
  async ensureInstanceBrowser(instanceId: number): Promise<void> {
    return this.runExclusive(async () => {
      await this.ensureLoop();
      await this.pruneDeadStrategies();
      const inst = await Instance.findByPk(instanceId);
      if (!inst || inst.app_id !== 'pinduoduo') {
        throw new Error('实例不存在');
      }
      if (inst.login_status === 'closed') {
        inst.login_status = 'pending';
        await inst.save();
      }
      if (this.strategies.some((s) => s.instance_id === instanceId)) {
        const strategy = this.strategies.find((s) => s.instance_id === instanceId);
        if (strategy?.page && !strategy.page.isClosed()) {
          try {
            await strategy.page.bringToFront();
          } catch {
            // ignore
          }
          return;
        }
        await this.removeTask(instanceId, false);
      }
      await this.addTask('pinduoduo', instanceId);
    });
  }
}
