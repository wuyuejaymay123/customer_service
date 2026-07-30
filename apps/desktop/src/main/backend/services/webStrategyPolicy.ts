/**
 * 拼多多／千牛策略生命周期的纯行为规则（可单测、与 Playwright 解耦）。
 */

export type PddLoginStatus = 'pending' | 'logged_in' | 'unknown' | 'closed';

/** 使用者关 Chrome／页面关闭：不自动重开（避免弹窗循环） */
export function shouldAutoReopenBrowserOnPageClose(): boolean {
  return false;
}

/** sync 是否应挂上该拼多多实例的浏览器 */
export function shouldAttachPddOnSync(opts: {
  shouldRun: boolean;
  loginStatus: string | null | undefined;
}): boolean {
  if (!opts.shouldRun) return false;
  if (opts.loginStatus === 'closed') return false;
  return true;
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
