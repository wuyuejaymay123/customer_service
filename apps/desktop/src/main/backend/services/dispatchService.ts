import socketIo from 'socket.io';
import { BrowserWindow } from 'electron';
import { Platform, ReplyDTO, StrategyServiceStatusEnum } from '../types';
import { emitAndWait } from '../../utils';
import { MessageService } from './messageService';
import PluginService from './pluginService';
import { ConfigController } from '../controllers/configController';
import { MessageController } from '../controllers/messageController';
import { Instance } from '../entities/instance';
import { PluginDefaultRunCode } from '../constants';
import { LoggerService } from './loggerService';
import { WebStrategyService } from './webStrategyService';
import { qianniuRpaAction } from './webStrategyPolicy';

export class DispatchService {
  private webStrategy: WebStrategyService;

  private syncChain: Promise<boolean> = Promise.resolve(true);

  private qianniuRpaRunning = false;

  constructor(
    private mainWindow: BrowserWindow,
    private log: LoggerService,
    private io: socketIo.Server,
    private configController: ConfigController,
    private messageService: MessageService,
    private messageController: MessageController,
    private pluginService: PluginService,
  ) {
    this.io = io;
    this.log = log;
    this.mainWindow = mainWindow;
    this.messageService = messageService;
    this.messageController = messageController;
    this.configController = configController;
    this.pluginService = pluginService;
    this.webStrategy = new WebStrategyService(
      this.log,
      this.configController,
      this.messageService,
      this.messageController,
      this.pluginService,
    );
  }

  public registerHandlers(socket: socketIo.Socket): void {
    socket.on('messageService-broadcast', async (msg: any, callback) => {
      const { event, data } = msg;
      if (event === 'key_esc') {
        const change = await this.configController.escKeyDowHandler();
        if (change) {
          this.syncConfig();
          this.receiveBroadcast({
            event: 'has_paused',
            data: {},
          });
        }
      } else {
        this.receiveBroadcast(msg);
      }

      callback({
        event,
        data,
      });
    });

    socket.on('messageService-getMessages', async (data, callback) => {
      const { ctx, msgs } = data;
      const ctxMap = new Map<string, string>();
      Object.keys(ctx).forEach((key) => {
        ctxMap.set(key, ctx[key]);
      });

      let reply: ReplyDTO;

        // 智能客服系统：第一版关闭自定义 Plugin，只走默认回复管线
        const cfg = await this.configController.get(ctxMap);
        await this.messageService.extractMsgInfo(cfg, ctxMap, msgs);

        try {
          const reply_data = await this.pluginService.executePluginCode(
            PluginDefaultRunCode,
            ctxMap,
            msgs,
          );

          reply = reply_data.data;
        } catch (error) {
          console.error('Failed to execute plugin', error);
          const errMsg =
            error instanceof Error ? error.message : String(error);
          this.log.error(`回复失败: ${errMsg}`);
          reply = this.messageService.notifySendFailure(cfg, ctxMap, errMsg);
        }

      callback(reply);

      if (reply.type !== 'NO_REPLY') {
        // 回复后保存消息
        await this.messageController.saveMessages(ctxMap, reply, msgs);
      }
    });
  }

  public receiveBroadcast(msg: any): void {
    this.mainWindow.webContents.send('broadcast', msg);
  }

  public async checkHealth(): Promise<boolean> {
    try {
      return await this.io.timeout(5000).emitWithAck('systemService-health');
    } catch (error) {
      console.error('Failed to check health', error);
      return false;
    }
  }

  public async syncConfig(): Promise<boolean> {
    // 串行化：避免 cron／删除／设定变更并发交错
    const run = this.syncChain.then(
      () => this.syncConfigLocked(),
      () => this.syncConfigLocked(),
    );
    this.syncChain = run.then(
      () => true,
      () => false,
    );
    return run;
  }

  private async syncQianniuRpa(
    instances: Instance[],
    shouldRun: boolean,
    cfg: { jdr: string; twkey: string; twcount: number },
  ) {
    const hasQianniu = instances.some((i) => i.app_id === 'win_qianniu');
    const action = qianniuRpaAction({
      hasQianniuInstance: hasQianniu,
      shouldRun,
      alreadyRunning: this.qianniuRpaRunning,
    });
    if (action === 'noop') return;
    try {
      if (action === 'run') {
        await this.runStrategy('win_qianniu', {
          jdr: cfg.jdr,
          twkey: cfg.twkey,
          twcount: cfg.twcount,
        });
        this.qianniuRpaRunning = true;
        this.log.info(
          '千牛自动操作已启动：请使用千牛“多店铺模式”+ 气泡模式；多店无需重复建实例',
        );
      } else {
        await this.stopStrategy('win_qianniu');
        this.qianniuRpaRunning = false;
      }
    } catch (qnErr) {
      this.log.warn(
        `千牛自动操作联动失败: ${
          qnErr instanceof Error ? qnErr.message : String(qnErr)
        }`,
      );
    }
  }

  private async syncConfigLocked(): Promise<boolean> {
    let shouldRun = false;
    let jdr = '';
    let twkey = '';
    let twcount = 210;

    try {
      let cfg = await this.configController.getConfigByType({
        appId: undefined,
        instanceId: undefined,
        type: 'driver',
      });

      if (!cfg) {
        return false;
      }

      let hasPaused = false;
      if ('hasPaused' in cfg) {
        hasPaused = cfg.hasPaused || false;
      }

      // 网关：未登录或 Tenant 停用时强制停止自动任务
      let gatewayBlocked = false;
      try {
        const { loadGatewayAuth, assertTenantActive } = await import(
          './gatewayClient'
        );
        const { hasUsableGatewaySession } = await import(
          './gatewayAuthPersist'
        );
        const auth = await loadGatewayAuth();
        if (!hasUsableGatewaySession(auth)) {
          gatewayBlocked = true;
          this.log.warn('未登录网关，自动任务保持停止');
        } else {
          await assertTenantActive(auth!);
        }
      } catch (e) {
        gatewayBlocked = true;
        this.log.warn(
          `网关校验失败，自动任务停止: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }

      cfg = await this.configController.getConfigByType({
        appId: undefined,
        instanceId: undefined,
        type: 'generic',
      });

      if (!cfg) {
        return false;
      }

      if ('truncateWordKey' in cfg) {
        twkey = cfg.truncateWordKey || '';
      }
      if ('truncateWordCount' in cfg) {
        twcount = cfg.truncateWordCount || 210;
      }

      shouldRun = !hasPaused && !gatewayBlocked;

      const instances = await Instance.findAll();
      // 拼多多走 Playwright 网页策略；千牛等桌面端仍尝试 __main__.exe
      try {
        await this.webStrategy.syncFromInstances(instances, shouldRun);
      } catch (webErr) {
        this.log.error(
          `拼多多网页策略同步失败: ${
            webErr instanceof Error ? webErr.message : String(webErr)
          }`,
        );
      }

      await this.syncQianniuRpa(instances, shouldRun, { jdr, twkey, twcount });

      try {
        await emitAndWait(this.io, 'strategyService-updateStatus', {
          status: shouldRun
            ? StrategyServiceStatusEnum.RUNNING
            : StrategyServiceStatusEnum.STOPPED,
          jdr,
          twkey,
          twcount,
        });
      } catch (statusErr) {
        console.warn('strategyService-updateStatus unavailable:', statusErr);
      }

      await this.updateTasks(instances);
      return true;
    } catch (error) {
      // 1.4.5 可能无 updateStatus；降级为对各实例 run/stop
      console.warn('syncConfig primary path failed, trying run/stop:', error);
      try {
        const instances = await Instance.findAll();
        try {
          await this.webStrategy.syncFromInstances(instances, shouldRun);
        } catch (webErr) {
          this.log.error(
            `拼多多网页策略同步失败: ${
              webErr instanceof Error ? webErr.message : String(webErr)
            }`,
          );
        }
        for (const inst of instances) {
          if (inst.app_id === 'pinduoduo') {
            // 已由 webStrategy 处理
            // eslint-disable-next-line no-continue
            continue;
          }
        }
        // 千牛：多实例去重，只对 RPA run/stop 一次（多店靠千牛多店铺模式）
        await this.syncQianniuRpa(instances, shouldRun, { jdr, twkey, twcount });
        for (const inst of instances) {
          if (inst.app_id === 'pinduoduo' || inst.app_id === 'win_qianniu') {
            // eslint-disable-next-line no-continue
            continue;
          }
          if (shouldRun) {
            // eslint-disable-next-line no-await-in-loop
            await this.runStrategy(inst.app_id, { jdr, twkey, twcount });
          } else {
            // eslint-disable-next-line no-await-in-loop
            await this.stopStrategy(inst.app_id);
          }
        }
        return true;
      } catch (e2) {
        console.error('Failed to sync config', e2);
        return false;
      }
    }
  }

  public async stopWebInstance(
    instanceId: number,
    deleteSession = false,
  ): Promise<void> {
    await this.webStrategy.removeTask(instanceId, deleteSession);
  }

  public async updateTasks(tasks: Instance[]): Promise<
    | {
        task_id: string;
        env_id: string;
        error?: string;
      }[]
    | null
  > {
    const localResult = () =>
      tasks.map((task) => ({
        task_id: String(task.id),
        env_id: task.env_id || `local-${task.id}`,
      }));

    // 本版仅拼多多（WEB），不再依赖外部 Strategy 进程的 updateTasks。
    // 若仍广播 socket，无客户端／空阵列会让「添加实例」误失败。
    const onlyWeb = tasks.every((t) => t.app_id === 'pinduoduo');
    if (onlyWeb || tasks.length === 0) {
      return localResult();
    }

    try {
      const result = await emitAndWait(
        this.io,
        'strategyService-updateTasks',
        {
          tasks: tasks.map((task) => ({
            task_id: task.id,
            app_id: task.app_id,
            env_id: task.env_id,
          })),
        },
        20000,
      );
      // 1.4.5 常回传 {} / 非阵列（无 updateTasks），不可对其 .find
      if (!Array.isArray(result) || result.length === 0) {
        console.warn(
          'strategyService-updateTasks returned empty/non-array, using local env ids:',
          result,
        );
        return localResult();
      }
      return result.map((task: { task_id: string | number; env_id?: string; error?: string }) => ({
        task_id: String(task.task_id),
        env_id: task.env_id || `local-${task.task_id}`,
        error: task.error,
      }));
    } catch (error) {
      // 1.4.5 后端已无 updateTasks；改为本机分配 env_id，实际驱动走 strategyService-run
      console.warn(
        'strategyService-updateTasks unavailable, using local env ids:',
        error,
      );
      return localResult();
    }
  }

  public async getAllPlatforms(): Promise<Platform[]> {
    // 不再呼叫已移除的 getAppsInfo；直接回本地 SupportedChannel 目录
    const { LOCAL_PLATFORMS } = await import('./supportedPlatforms');
    return LOCAL_PLATFORMS;
  }

  /** 对 1.4.5 后端启动／停止某个 app 实例 */
  public async runStrategy(
    appId: string,
    cfg: Record<string, unknown> = {},
  ): Promise<void> {
    await emitAndWait(this.io, 'strategyService-run', { app_id: appId, cfg });
  }

  public async stopStrategy(appId: string): Promise<void> {
    await emitAndWait(this.io, 'strategyService-stop', { app_id: appId });
  }
}
