/**
 * 拼多多／千牛策略生命周期的纯行为规则（可单测、与 Playwright 解耦）。
 */

export type PddLoginStatus = 'pending' | 'logged_in' | 'unknown' | 'closed';

/** 使用者关 Chrome／页面关闭：不自动重开（避免弹窗循环） */
export function shouldAutoReopenBrowserOnPageClose(): boolean {
  return false;
}

/**
 * sync 是否应挂上该拼多多实例的浏览器。
 * 浏览器用于扫码登录／保会话，与「自动回复是否开启」解耦：
 * - closed：用户已关窗，不自动重开（恢复自动回复时会先清成 pending）
 * - pending / logged_in / unknown：即使自动回复暂停、网关未登录，也要挂浏览器以便扫码
 */
export function shouldAttachPddOnSync(opts: {
  shouldRun: boolean;
  loginStatus: string | null | undefined;
}): boolean {
  if (opts.loginStatus === 'closed') return false;
  return true;
}

/**
 * 内存里仍挂着 strategy，但浏览器／页面已死：应从列表卸下以便 sync 重挂。
 * 与「用户关窗→closed」不同：进程崩溃／被杀不写 closed，允许自动重开。
 */
export function shouldDropDeadStrategyForResync(opts: {
  browserConnected: boolean;
  pageClosed: boolean;
}): boolean {
  return !opts.browserConnected || opts.pageClosed;
}

/**
 * 页面 close 事件后是否应标 closed（用户关窗）。
 * Edge／Chrome 崩溃时 close 往往早于 disconnected；若此时浏览器已断，
 * 不得标 closed，否则新增实例会被误判「打不开窗口」。
 */
export function shouldMarkClosedOnPageClose(opts: {
  browserConnected: boolean;
}): boolean {
  return opts.browserConnected;
}

/**
 * 自动回复从暂停恢复时，清掉 closed，允许再次挂浏览器。
 * 其余情况保留原状态。
 */
export function loginStatusAfterDriverResume(
  wasRunning: boolean,
  shouldRun: boolean,
  current: string | null | undefined,
): string | null | undefined {
  if (!wasRunning && shouldRun && current === 'closed') {
    return 'pending';
  }
  return current;
}

/** 关窗后卡片是否应提供「重新打开浏览器」 */
export function shouldOfferReopenBrowser(opts: {
  loginStatus: string | null | undefined;
  haltReason?: string | null;
}): boolean {
  return (
    opts.loginStatus === 'closed' || opts.haltReason === 'browser_closed'
  );
}

/** 挂上浏览器时写入的 login_status：已登录先保留，等 probe 确认 */
export function loginStatusOnAttach(
  current: string | null | undefined,
): PddLoginStatus {
  if (current === 'logged_in') return 'logged_in';
  return 'pending';
}

/**
 * probe 结果如何写回 DB。
 * - pending / logged_in：一律可写
 * - unknown：不覆盖（避免误把已登录刷成未知）
 */
export function resolveLoginStatusFromProbe(
  current: string | null | undefined,
  probed: 'pending' | 'logged_in' | 'unknown',
): string | null {
  if (probed === 'unknown') return null;
  if (current === probed) return null;
  return probed;
}

/** 千牛 RPA：多实例／多次 sync 只维护一份 run 状态 */
export function qianniuRpaAction(opts: {
  hasQianniuInstance: boolean;
  shouldRun: boolean;
  alreadyRunning: boolean;
}): 'run' | 'stop' | 'noop' {
  const wantRun = opts.hasQianniuInstance && opts.shouldRun;
  if (wantRun) {
    return opts.alreadyRunning ? 'noop' : 'run';
  }
  return opts.alreadyRunning ? 'stop' : 'noop';
}

export function pddLoginBadge(loginStatus: string | null | undefined): {
  label: string;
  color: string;
} {
  if (loginStatus === 'logged_in') {
    return { label: '已登录', color: 'green' };
  }
  if (loginStatus === 'pending') {
    return { label: '待扫码', color: 'orange' };
  }
  if (loginStatus === 'closed') {
    return { label: '已关闭', color: 'red' };
  }
  return { label: '未知', color: 'gray' };
}

/** 该店此刻是否应执行自动回复轮询（读消息／AI／发送） */
export function shouldRunShopAutoReply(opts: {
  masterOn: boolean;
  shopEnabled: boolean;
  loginStatus: string | null | undefined;
}): boolean {
  return (
    opts.masterOn &&
    opts.shopEnabled &&
    opts.loginStatus === 'logged_in'
  );
}

/** 打开 ShopAutoReply 前须已登录且会话可用 */
export function canEnableShopAutoReply(
  loginStatus: string | null | undefined,
): boolean {
  return loginStatus === 'logged_in';
}

export type ShopCardStatusLine = { label: string; color: string };

/** DutyDesk 卡片：连线一行 + 自动回一行 */
export function shopCardStatus(opts: {
  loginStatus: string | null | undefined;
  masterOn: boolean;
  shopEnabled: boolean;
  haltReason?: string | null;
}): {
  connection: ShopCardStatusLine;
  autoReply: ShopCardStatusLine;
} {
  let connection: ShopCardStatusLine;
  if (opts.loginStatus === 'logged_in') {
    connection = { label: '已连接', color: 'green' };
  } else if (opts.loginStatus === 'pending') {
    connection = { label: '待扫码', color: 'orange' };
  } else if (opts.loginStatus === 'closed') {
    connection = { label: '已关闭', color: 'red' };
  } else {
    connection = { label: '未知', color: 'gray' };
  }

  let autoReply: ShopCardStatusLine;
  if (opts.loginStatus === 'pending' || opts.loginStatus === 'unknown' || !opts.loginStatus) {
    autoReply = { label: '未就绪', color: 'gray' };
  } else if (!opts.masterOn) {
    autoReply = { label: '总开关已关', color: 'orange' };
  } else if (!opts.shopEnabled) {
    if (opts.haltReason) {
      autoReply = { label: '已停用', color: 'red' };
    } else {
      autoReply = { label: '人工接待', color: 'orange' };
    }
  } else if (opts.loginStatus === 'logged_in') {
    autoReply = { label: '自动回复中', color: 'green' };
  } else {
    autoReply = { label: '未就绪', color: 'gray' };
  }

  return { connection, autoReply };
}

export function haltReasonLabel(reason: string | null | undefined): string {
  if (reason === 'browser_closed') return '浏览器已关闭';
  if (reason === 'logged_out') return '已掉登';
  if (reason === 'drive_failures') return '连续驱动失败';
  if (reason === 'duplicate_shop') return '店铺重复';
  return reason || '';
}
