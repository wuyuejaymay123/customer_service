import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldAutoReopenBrowserOnPageClose,
  shouldAttachPddOnSync,
  shouldDropDeadStrategyForResync,
  shouldMarkClosedOnPageClose,
  loginStatusAfterDriverResume,
  loginStatusOnAttach,
  resolveLoginStatusFromProbe,
  qianniuRpaAction,
  pddLoginBadge,
  shouldRunShopAutoReply,
  canEnableShopAutoReply,
  shopCardStatus,
} from '../main/backend/services/webStrategyPolicy';

describe('webStrategyPolicy', () => {
  it('closing pdd browser does not auto-reopen', () => {
    assert.equal(shouldAutoReopenBrowserOnPageClose(), false);
  });

  it('sync keeps browser for scan login even when auto-reply is off', () => {
    assert.equal(
      shouldAttachPddOnSync({ shouldRun: true, loginStatus: 'closed' }),
      false,
    );
    assert.equal(
      shouldAttachPddOnSync({ shouldRun: true, loginStatus: 'logged_in' }),
      true,
    );
    assert.equal(
      shouldAttachPddOnSync({ shouldRun: false, loginStatus: 'pending' }),
      true,
    );
    assert.equal(
      shouldAttachPddOnSync({ shouldRun: false, loginStatus: 'closed' }),
      false,
    );
  });

  it('dead browser or closed page drops strategy so sync can reattach', () => {
    assert.equal(
      shouldDropDeadStrategyForResync({
        browserConnected: false,
        pageClosed: false,
      }),
      true,
    );
    assert.equal(
      shouldDropDeadStrategyForResync({
        browserConnected: true,
        pageClosed: true,
      }),
      true,
    );
    assert.equal(
      shouldDropDeadStrategyForResync({
        browserConnected: true,
        pageClosed: false,
      }),
      false,
    );
  });

  it('page close during browser crash must not mark closed', () => {
    assert.equal(shouldMarkClosedOnPageClose({ browserConnected: false }), false);
    assert.equal(shouldMarkClosedOnPageClose({ browserConnected: true }), true);
  });

  it('resuming auto-reply clears closed so browser can attach again', () => {
    assert.equal(loginStatusAfterDriverResume(false, true, 'closed'), 'pending');
    assert.equal(loginStatusAfterDriverResume(true, true, 'closed'), 'closed');
    assert.equal(
      loginStatusAfterDriverResume(false, true, 'logged_in'),
      'logged_in',
    );
  });

  it('attach preserves logged_in until probe confirms', () => {
    assert.equal(loginStatusOnAttach('logged_in'), 'logged_in');
    assert.equal(loginStatusOnAttach('closed'), 'pending');
    assert.equal(loginStatusOnAttach(null), 'pending');
  });

  it('logout probe updates logged_in to pending; unknown does not overwrite', () => {
    assert.equal(resolveLoginStatusFromProbe('logged_in', 'pending'), 'pending');
    assert.equal(resolveLoginStatusFromProbe('logged_in', 'unknown'), null);
    assert.equal(resolveLoginStatusFromProbe('pending', 'logged_in'), 'logged_in');
    assert.equal(resolveLoginStatusFromProbe('logged_in', 'logged_in'), null);
  });

  it('qianniu rpa runs once and resync does not rerun', () => {
    assert.equal(
      qianniuRpaAction({
        hasQianniuInstance: true,
        shouldRun: true,
        alreadyRunning: false,
      }),
      'run',
    );
    assert.equal(
      qianniuRpaAction({
        hasQianniuInstance: true,
        shouldRun: true,
        alreadyRunning: true,
      }),
      'noop',
    );
    assert.equal(
      qianniuRpaAction({
        hasQianniuInstance: true,
        shouldRun: false,
        alreadyRunning: true,
      }),
      'stop',
    );
    assert.equal(
      qianniuRpaAction({
        hasQianniuInstance: false,
        shouldRun: true,
        alreadyRunning: false,
      }),
      'noop',
    );
  });

  it('unknown login_status shows unknown badge not unnamed', () => {
    assert.equal(pddLoginBadge('unknown').label, '未知');
    assert.equal(pddLoginBadge('closed').label, '已关闭');
    assert.equal(pddLoginBadge('logged_in').label, '已登录');
  });

  it('shop auto-reply runs only when master on, shop enabled, logged in', () => {
    assert.equal(
      shouldRunShopAutoReply({
        masterOn: true,
        shopEnabled: true,
        loginStatus: 'logged_in',
      }),
      true,
    );
    assert.equal(
      shouldRunShopAutoReply({
        masterOn: false,
        shopEnabled: true,
        loginStatus: 'logged_in',
      }),
      false,
    );
    assert.equal(
      shouldRunShopAutoReply({
        masterOn: true,
        shopEnabled: false,
        loginStatus: 'logged_in',
      }),
      false,
    );
    assert.equal(
      shouldRunShopAutoReply({
        masterOn: true,
        shopEnabled: true,
        loginStatus: 'pending',
      }),
      false,
    );
  });

  it('enabling shop auto-reply requires logged-in session', () => {
    assert.equal(canEnableShopAutoReply('logged_in'), true);
    assert.equal(canEnableShopAutoReply('pending'), false);
    assert.equal(canEnableShopAutoReply('closed'), false);
  });

  it('shop card shows connection and auto-reply lines separately', () => {
    const human = shopCardStatus({
      loginStatus: 'logged_in',
      masterOn: true,
      shopEnabled: false,
      haltReason: null,
    });
    assert.equal(human.connection.label, '已连接');
    assert.equal(human.autoReply.label, '人工接待');

    const masterOff = shopCardStatus({
      loginStatus: 'logged_in',
      masterOn: false,
      shopEnabled: true,
      haltReason: null,
    });
    assert.equal(masterOff.autoReply.label, '总开关已关');

    const halted = shopCardStatus({
      loginStatus: 'closed',
      masterOn: true,
      shopEnabled: false,
      haltReason: 'browser_closed',
    });
    assert.equal(halted.connection.label, '已关闭');
    assert.equal(halted.autoReply.label, '已停用');
  });
});
