-- Shop 模型（F30–F32）；可重複執行
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('pinduoduo', 'qianniu')),
  external_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- ShopProfile（整店共通，不含單品賣點）
  positioning TEXT NOT NULL DEFAULT '',
  logistics TEXT NOT NULL DEFAULT '',
  after_sales TEXT NOT NULL DEFAULT '',
  forbidden TEXT NOT NULL DEFAULT '',
  transfer_rules TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shops_tenant ON shops(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shops_tenant_channel ON shops(tenant_id, channel);

CREATE TABLE IF NOT EXISTS tenant_policies (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  logistics TEXT NOT NULL DEFAULT '',
  after_sales TEXT NOT NULL DEFAULT '',
  forbidden TEXT NOT NULL DEFAULT '',
  transfer_rules TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_goods_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goods_id TEXT,
  title_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  selling_points TEXT NOT NULL DEFAULT '',
  specs_notes TEXT NOT NULL DEFAULT '',
  objections TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_goods_notes_shop ON shop_goods_notes(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_goods_notes_tenant ON shop_goods_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_goods_notes_goods_id ON shop_goods_notes(tenant_id, goods_id)
  WHERE goods_id IS NOT NULL AND goods_id <> '';
