import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  browserTabTitleForShop,
  candidatesFromDocumentTitle,
  extractMallNamesFromUnknown,
  isPddShopNameNoise,
  pickPinduoduoShopName,
} from '../main/platforms/pinduoduo/shopName';

describe('pinduoduoShopName', () => {
  it('rejects account role labels as shop names', () => {
    assert.equal(isPddShopNameNoise('主账号'), true);
    assert.equal(isPddShopNameNoise('子账号'), true);
    assert.equal(isPddShopNameNoise('主帳號'), true);
    assert.equal(isPddShopNameNoise('管理员'), true);
    assert.equal(isPddShopNameNoise('未命名店铺'), true);
  });

  it('accepts real mall names', () => {
    assert.equal(isPddShopNameNoise('优品数码旗舰店'), false);
    assert.equal(isPddShopNameNoise('ABC官方旗舰店'), false);
  });

  it('prefers mall name over 主账号 when both appear', () => {
    assert.equal(
      pickPinduoduoShopName(['主账号', '优品数码旗舰店']),
      '优品数码旗舰店',
    );
    assert.equal(
      pickPinduoduoShopName(['优品数码旗舰店', '主账号']),
      '优品数码旗舰店',
    );
  });

  it('returns null when only role labels are available', () => {
    assert.equal(pickPinduoduoShopName(['主账号', '子账号', '']), null);
  });

  it('extracts shop name from document title', () => {
    assert.deepEqual(
      candidatesFromDocumentTitle('优品数码旗舰店 - 拼多多商家后台'),
      ['优品数码旗舰店'],
    );
    assert.equal(
      pickPinduoduoShopName(
        candidatesFromDocumentTitle('优品数码旗舰店 - 拼多多商家后台'),
      ),
      '优品数码旗舰店',
    );
    assert.deepEqual(candidatesFromDocumentTitle('拼多多客服平台'), []);
  });

  it('extracts mallName from nested API/localStorage JSON', () => {
    const names = extractMallNamesFromUnknown({
      success: true,
      result: { mall: { mallName: '优品数码旗舰店', mallId: 1 } },
    });
    assert.deepEqual(names, ['优品数码旗舰店']);
    assert.equal(
      pickPinduoduoShopName(['主账号', ...names]),
      '优品数码旗舰店',
    );
  });

  it('builds browser tab title from shop name or instance id', () => {
    assert.equal(
      browserTabTitleForShop({ shopName: '仓满多', instanceId: 39 }),
      '拼多多 · 仓满多',
    );
    assert.equal(
      browserTabTitleForShop({ shopName: '主账号', instanceId: 39 }),
      '拼多多 · #39',
    );
    assert.equal(
      browserTabTitleForShop({
        shopName: null,
        instanceId: 39,
        pending: true,
      }),
      '拼多多 · 待扫码 #39',
    );
  });

  it('does not stack 拼多多 · when title is re-applied', () => {
    assert.equal(
      browserTabTitleForShop({
        shopName: '拼多多 · #39',
        instanceId: 39,
      }),
      '拼多多 · #39',
    );
    assert.equal(
      browserTabTitleForShop({
        shopName: '拼多多 · 拼多多 · 海圆企业店',
        instanceId: 40,
      }),
      '拼多多 · 海圆企业店',
    );
    assert.equal(
      pickPinduoduoShopName([
        '拼多多 · 拼多多 · #39',
        '主账号',
        '海圆企业店店主',
      ]),
      '海圆企业店',
    );
  });

  it('rejects 拼多多客服平台 page title as shop name', () => {
    assert.equal(isPddShopNameNoise('拼多多客服平台'), true);
    assert.equal(
      pickPinduoduoShopName([
        '拼多多客服平台',
        '拼多多 · 拼多多客服平台',
        '主账号',
        '海圆企业店',
      ]),
      '海圆企业店',
    );
    assert.equal(
      browserTabTitleForShop({
        shopName: '拼多多客服平台',
        instanceId: 41,
      }),
      '拼多多 · #41',
    );
  });
});
