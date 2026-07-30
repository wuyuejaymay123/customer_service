import { BrowserWindow, Notification } from 'electron';
import { Context } from '../types';
import {
  CTX_APP_ID,
  CTX_INSTANCE_ID,
  CTX_SHOP_HINT,
  CTX_USERNAME,
} from '../constants';
import { LoggerService } from './loggerService';

export type HandoffReasonCode =
  | 'reply_failure'
  | 'timeout'
  | 'rule_transfer'
  | 'transfer_failed';

export type HandoffAlertItem = {
  id: string;
  sessionKey: string;
  appId: string;
  instanceId: string;
  shopHint: string;
  buyer: string;
  reason: string;
  reasonCode: HandoffReasonCode;
  createdAt: number;
  cooldownUntil: number;
  transferAttempted: boolean;
  transferOk: boolean | null;
};

const DEFAULT_COMFORT = '稍等，我帮您找同事看一下';

/** 禁止发给买家的露馅／推诿话术 */
function isBannedBuyerPhrase(text: string): boolean {
  return /消息有点多|稍后再回复|稍后再回|系统繁忙|机器人|智能客服|AI客服|转人工/.test(
    text,
  );
}
const DEFAULT_TIMEOUT_SEC = 60;
const DEFAULT_COOLDOWN_SEC = 15 * 60;
const MERGE_MS = 8000;

export function sessionKeyFromCtx(ctx: Context): string {
  const appId = ctx.get(CTX_APP_ID) || '';
  const instanceId = ctx.get(CTX_INSTANCE_ID) || '';
  const buyer = ctx.get(CTX_USERNAME) || 'unknown';
  return `${appId}|${instanceId}|${buyer}`;
}

export class HandoffService {
  private alerts = new Map<string, HandoffAlertItem>();

  private cooldownUntil = new Map<string, number>();

  private replyEpoch = new Map<string, number>();

  private lastMergedAt = new Map<string, number>();

  constructor(
    private mainWindow: BrowserWindow,
    private log: LoggerService,
  ) {}

  getComfortReply(raw?: string | null): string {
    const t = (raw || '').trim();
    if (!t || isBannedBuyerPhrase(t)) return DEFAULT_COMFORT;
    return t;
  }

  getTimeoutMs(waitHumansTime?: number | null): number {
    const sec =
      waitHumansTime && waitHumansTime > 0
        ? waitHumansTime
        : DEFAULT_TIMEOUT_SEC;
    return sec * 1000;
  }

  getCooldownMs(cooldownSec?: number | null): number {
    const sec =
      cooldownSec && cooldownSec > 0 ? cooldownSec : DEFAULT_COOLDOWN_SEC;
    return sec * 1000;
  }

  bumpEpoch(sessionKey: string): number {
    const next = (this.replyEpoch.get(sessionKey) || 0) + 1;
    this.replyEpoch.set(sessionKey, next);
    return next;
  }

  currentEpoch(sessionKey: string): number {
    return this.replyEpoch.get(sessionKey) || 0;
  }

  isEpochCurrent(sessionKey: string, epoch: number): boolean {
    return this.currentEpoch(sessionKey) === epoch;
  }

  isInCooldown(ctx: Context): boolean {
    const key = sessionKeyFromCtx(ctx);
    const until = this.cooldownUntil.get(key) || 0;
    return Date.now() < until;
  }

  list(): HandoffAlertItem[] {
    return Array.from(this.alerts.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  ack(id: string): boolean {
    const item = this.alerts.get(id);
    if (!item) return false;
    this.alerts.delete(id);
    // 关掉提醒时一并解除冷却，避免列表消失后无法「恢复」而一直跳过自动回复
    this.cooldownUntil.delete(item.sessionKey);
    this.pushUpdate();
    return true;
  }

  /**
   * 清除所有会话冷却（调试／误关待接管后卡住时用）
   */
  clearAllCooldowns(): number {
    const n = this.cooldownUntil.size;
    this.cooldownUntil.clear();
    this.alerts.clear();
    this.pushUpdate();
    return n;
  }

  resume(sessionKey: string): boolean {
    this.cooldownUntil.delete(sessionKey);
    for (const [id, item] of this.alerts) {
      if (item.sessionKey === sessionKey) this.alerts.delete(id);
    }
    this.pushUpdate();
    return true;
  }

  /**
   * 登记待接管并进入会话冷却；短时同因合并，避免洗版。
   */
  raise(opts: {
    ctx: Context;
    reason: string;
    reasonCode: HandoffReasonCode;
    cooldownMs: number;
    transferAttempted?: boolean;
    transferOk?: boolean | null;
  }): HandoffAlertItem {
    const sessionKey = sessionKeyFromCtx(opts.ctx);
    const now = Date.now();
    const cooldownUntil = now + opts.cooldownMs;
    this.cooldownUntil.set(sessionKey, cooldownUntil);

    const mergeKey = `${sessionKey}|${opts.reasonCode}`;
    const last = this.lastMergedAt.get(mergeKey) || 0;
    const existing = [...this.alerts.values()].find(
      (a) => a.sessionKey === sessionKey && a.reasonCode === opts.reasonCode,
    );

    let item: HandoffAlertItem;
    if (existing && now - last < MERGE_MS) {
      existing.reason = opts.reason;
      existing.createdAt = now;
      existing.cooldownUntil = cooldownUntil;
      existing.transferAttempted = Boolean(opts.transferAttempted);
      existing.transferOk =
        opts.transferOk === undefined ? existing.transferOk : opts.transferOk;
      item = existing;
      this.lastMergedAt.set(mergeKey, now);
      this.pushUpdate();
      return item;
    }

    item = {
      id: `${sessionKey}-${now}`,
      sessionKey,
      appId: opts.ctx.get(CTX_APP_ID) || '',
      instanceId: opts.ctx.get(CTX_INSTANCE_ID) || '',
      shopHint: opts.ctx.get(CTX_SHOP_HINT) || '',
      buyer: opts.ctx.get(CTX_USERNAME) || '未知买家',
      reason: opts.reason,
      reasonCode: opts.reasonCode,
      createdAt: now,
      cooldownUntil,
      transferAttempted: Boolean(opts.transferAttempted),
      transferOk: opts.transferOk ?? null,
    };
    this.alerts.set(item.id, item);
    this.lastMergedAt.set(mergeKey, now);

    this.log.warn(
      `待接管: ${item.buyer} / ${item.shopHint || item.appId} — ${item.reason}`,
    );
    this.notifyOs(item);
    this.pushUpdate();
    return item;
  }

  /** 更新最近一条该会话告警的转接结果 */
  markTransferResult(sessionKey: string, transferOk: boolean): void {
    const items = [...this.alerts.values()]
      .filter((a) => a.sessionKey === sessionKey)
      .sort((a, b) => b.createdAt - a.createdAt);
    const item = items[0];
    if (!item) return;
    item.transferAttempted = true;
    item.transferOk = transferOk;
    if (!transferOk) {
      item.reasonCode = 'transfer_failed';
      item.reason = `${item.reason}（转接未成功，请立刻接管）`;
    }
    this.pushUpdate();
  }

  private notifyOs(item: HandoffAlertItem) {
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: '需要人工接管',
          body: `${item.buyer}：${item.reason}`,
        }).show();
      }
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.flashFrame(true);
      }
    } catch {
      // ignore
    }
  }

  private pushUpdate() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('handoff-updated', this.list());
      }
    } catch {
      // ignore
    }
  }
}
