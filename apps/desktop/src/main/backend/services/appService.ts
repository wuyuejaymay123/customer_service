import { Sequelize, Transaction } from 'sequelize';
import { DispatchService } from './dispatchService';
import { Instance } from '../entities/instance';
import { Config } from '../entities/config';
import { Plugin } from '../entities/plugin';

export class AppService {
  private dispatchService: DispatchService;

  private sequelize: Sequelize;

  constructor(dispatchService: DispatchService, sequelize: Sequelize) {
    this.dispatchService = dispatchService;
    this.sequelize = sequelize;
  }

  public async getTasks(): Promise<
    {
      task_id: string;
      env_id: string;
      app_id: string;
      shop_name?: string | null;
      login_status?: string | null;
      gateway_shop_id?: string | null;
      auto_reply_enabled: boolean;
      auto_reply_halt_reason: string | null;
    }[]
  > {
    const instances = await Instance.findAll();
    return instances.map((instance) => ({
      task_id: String(instance.id),
      env_id: instance.env_id,
      app_id: instance.app_id,
      shop_name: instance.shop_name,
      login_status: instance.login_status,
      gateway_shop_id: instance.gateway_shop_id,
      auto_reply_enabled: instance.auto_reply_enabled !== false,
      auto_reply_halt_reason: instance.auto_reply_halt_reason || null,
    }));
  }

  /**
   * ShopAutoReply：单独开／停某店自动回复（须已登录；开总闸后该店仍保持各自状态）
   */
  public async setShopAutoReply(
    taskId: string,
    enabled: boolean,
  ): Promise<{ ok: boolean; error?: string }> {
    const instance = await Instance.findByPk(taskId);
    if (!instance) {
      return { ok: false, error: '实例不存在' };
    }
    if (enabled) {
      const { canEnableShopAutoReply } = await import('./webStrategyPolicy');
      if (!canEnableShopAutoReply(instance.login_status)) {
        return {
          ok: false,
          error: '请先扫码登录并保持浏览器连接，再开启该店自动回复',
        };
      }
      // 手动重新打开：清除 Halt 原因（确认可再跑）
      instance.auto_reply_enabled = true;
      instance.auto_reply_halt_reason = null;
    } else {
      // 手动暂停：只关开关，保留系统 Halt 原因便于卡片展示
      instance.auto_reply_enabled = false;
    }
    await instance.save();
    try {
      await this.dispatchService.syncConfig();
    } catch (e) {
      console.warn('sync after setShopAutoReply failed:', e);
    }
    return { ok: true };
  }

  public async bindGatewayShop(
    taskId: string,
    gatewayShopId: string | null,
  ): Promise<boolean> {
    const instance = await Instance.findByPk(taskId);
    if (!instance) return false;
    instance.gateway_shop_id = gatewayShopId;
    await instance.save();
    return true;
  }

  /**
   * 初始化全部任务
   */
  public async initTasks(): Promise<void> {
    const instances = await Instance.findAll();
    await this.dispatchService.updateTasks(instances);
  }

  /**
   * 添加一个任务
   */
  public async addTask(appId: string): Promise<Instance | null> {
    // 千牛：产品建议只建 1 个实例（多店在客户端多店铺模式）
    if (appId === 'win_qianniu') {
      const existing = await Instance.findOne({
        where: { app_id: 'win_qianniu' },
      });
      if (existing) {
        throw new Error(
          '千牛多店请在客户端“多店铺模式”内切店，无需重复创建实例',
        );
      }
    }

    // 使用事务
    return this.sequelize
      .transaction(async (t: Transaction) => {
        const instance = await Instance.create(
          {
            app_id: appId,
            created_at: new Date(),
          },
          { transaction: t },
        );

        // 同一事务内读取，并确保含刚建立的 instance
        const tasks = await Instance.findAll({ transaction: t });
        if (!tasks.some((task) => String(task.id) === String(instance.id))) {
          tasks.push(instance);
        }
        const result = await this.dispatchService.updateTasks(tasks);
        if (!Array.isArray(result) || result.length === 0) {
          // 本机分配 env_id 兜底，避免 Strategy 空响应导致无法建拼多多实例
          const fallback = tasks.map((task) => ({
            task_id: String(task.id),
            env_id: task.env_id || `local-${task.id}`,
          }));
          if (fallback.length === 0) {
            throw new Error('添加任务失败，请重新尝试');
          }
          const created = fallback.find(
            (task) => String(task.task_id) === String(instance.id),
          );
          if (!created) {
            throw new Error('添加任务失败，请重新尝试');
          }
          instance.env_id = created.env_id;
          await instance.save({ transaction: t });
          return instance;
        }

        // 遍历 result 检查，判断是否存在 error 属性
        const err_target = result.find((task) => task.error);
        if (err_target) {
          throw new Error(err_target.error);
        }

        const target = result.find(
          (task) => String(task.task_id) === String(instance.id),
        );
        if (!target) {
          throw new Error('Failed to find target task');
        }

        instance.env_id = target.env_id;
        await instance.save({ transaction: t });
        return instance;
      })
      .then(async (instance) => {
        // 事务提交后立刻同步，让拼多多 Chrome 随实例启动（不必等 cron）
        try {
          await this.dispatchService.syncConfig();
        } catch (e) {
          console.warn('sync after addTask failed:', e);
        }
        return instance;
      })
      .catch((error) => {
        // 处理错误
        console.error('Transaction failed:', error);
        throw error; // 可根据需求自定义错误处理逻辑
      });
  }

  /**
   * 移除一个任务：先停策略／关浏览器，再删 DB，避免短暂竞态重开
   */
  public async removeTask(taskId: string): Promise<boolean> {
    const instance = await Instance.findByPk(taskId);

    if (!instance) {
      return false;
    }

    const appId = instance.app_id;
    const numericId = Number(taskId);

    // 先停浏览器／策略（此时 DB 仍有纪录，重启守卫可辨识）
    try {
      if (appId === 'pinduoduo') {
        await this.dispatchService.stopWebInstance(numericId, true);
      }
    } catch (e) {
      console.warn('stopWebInstance before destroy failed:', e);
    }

    await instance.destroy();

    // 找到对应的 Config 删除
    const config = await Config.findOne({
      where: { instance_id: taskId },
    });
    if (config) {
      // 检查是否使用插件
      if (config.plugin_id) {
        const plugin = await Plugin.findOne({
          where: { id: config.plugin_id },
        });
        if (plugin) {
          await plugin.destroy();
        }
      }

      await config.destroy();
    }

    // 获取全部 Tasks 然后全部更新
    const tasks = await Instance.findAll();
    await this.dispatchService.updateTasks(tasks);

    try {
      await this.dispatchService.syncConfig();
    } catch (e) {
      console.warn('sync after removeTask failed:', e);
    }

    return true;
  }
}
