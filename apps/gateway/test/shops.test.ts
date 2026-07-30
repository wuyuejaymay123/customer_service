import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatGoodsCatalogBlock,
  formatGoodsNoteBlock,
  formatPolicyBlock,
} from '../src/shops.js';

describe('shops policy formatting', () => {
  it('formats merged shop policy block with store name and logistics', () => {
    const block = formatPolicyBlock({
      display_name: '海圆店',
      positioning: '母婴棉柔',
      logistics: '48小时发货',
      after_sales: '7天无理由',
      forbidden: '不承诺最低价',
      transfer_rules: '投诉转人工',
    });
    assert.match(block, /海圆店/);
    assert.match(block, /48小时发货/);
    assert.match(block, /不承诺最低价/);
  });

  it('formats goods note with selling points', () => {
    const block = formatGoodsNoteBlock({
      id: '1',
      shop_id: 's1',
      goods_id: 'g1',
      title_aliases: ['纸巾'],
      selling_points: '加厚三层',
      specs_notes: '120抽',
      objections: '',
    });
    assert.match(block, /加厚三层/);
    assert.match(block, /120抽/);
  });

  it('formats shop goods catalog for listing questions', () => {
    const block = formatGoodsCatalogBlock([
      {
        id: '1',
        shop_id: 's1',
        goods_id: '123',
        title_aliases: ['伊利金典'],
        selling_points: '有机',
        specs_notes: '',
        objections: '',
      },
    ]);
    assert.match(block, /唯一可售|在售商品/);
    assert.match(block, /伊利金典/);
    assert.match(block, /123/);
    assert.match(block, /禁止編造|禁止编造|一律視為沒有|一律视为没有/);
  });

  it('returns empty goods block when no content', () => {
    assert.equal(
      formatGoodsNoteBlock({
        id: '1',
        shop_id: 's1',
        goods_id: null,
        title_aliases: [],
        selling_points: '',
        specs_notes: '',
        objections: '',
      }),
      '',
    );
  });
});
