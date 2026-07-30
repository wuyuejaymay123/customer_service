import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldAutoReopenBrowserOnPageClose,
  shouldAttachPddOnSync,
  loginStatusAfterDriverResume,
  loginStatusOnAttach,
  resolveLoginStatusFromProbe,
  qianniuRpaAction,
  pddLoginBadge,
} from '../main/backend/services/webStrategyPolicy';

describe('webStrategyPolicy', () => {
  it('closing pdd browser does not auto-reopen', () => {
    assert.equal(shouldAutoReopenBrowserOnPageClose(), false);
  });

  it('sync skips closed pdd instances while auto-reply is on', () => {
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
      false,
    );
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
});
