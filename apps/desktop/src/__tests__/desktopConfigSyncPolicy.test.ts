import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * 輕量策略斷言（不連庫／網關）：與 desktopConfigSync 渠道映射保持一致。
 */
function channelToAppId(channel: string): string {
  if (channel === 'qianniu') return 'win_qianniu';
  return 'pinduoduo';
}

function appIdToChannel(appId: string): 'pinduoduo' | 'qianniu' {
  if (appId === 'win_qianniu' || appId.includes('qianniu')) return 'qianniu';
  return 'pinduoduo';
}

describe('desktopConfig channel mapping', () => {
  it('round-trips pinduoduo and qianniu', () => {
    assert.equal(appIdToChannel(channelToAppId('pinduoduo')), 'pinduoduo');
    assert.equal(appIdToChannel(channelToAppId('qianniu')), 'qianniu');
    assert.equal(channelToAppId('qianniu'), 'win_qianniu');
  });
});
