-- 智能客服計費庫
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  discount_rate NUMERIC(6,4) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('platform_admin', 'tenant_admin', 'operator')),
  quota_limit NUMERIC(18,4),
  quota_used NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  reserved NUMERIC(18,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  amount_credit NUMERIC(18,4) NOT NULL,
  amount_cny NUMERIC(18,4),
  note TEXT,
  created_by UUID REFERENCES operators(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  operator_id UUID REFERENCES operators(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'recharge', 'reserve', 'settle', 'release', 'adjustment'
  )),
  amount NUMERIC(18,4) NOT NULL,
  balance_after NUMERIC(18,4),
  ref_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  operator_id UUID NOT NULL REFERENCES operators(id),
  amount NUMERIC(18,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'settled', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ
);

CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  operator_id UUID REFERENCES operators(id),
  reserve_id UUID REFERENCES reserves(id),
  model TEXT,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  cost_upstream NUMERIC(18,6),
  credit_charged NUMERIC(18,4) DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  usage_estimated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE price_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value NUMERIC(18,6) NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  platform_prompt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE low_balance_thresholds (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  threshold_credit NUMERIC(18,4) NOT NULL DEFAULT 100
);

CREATE TABLE tenant_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_knowledge_tenant ON tenant_knowledge(tenant_id);

-- Shop 模型（亦見 schema-shops.sql；新庫隨本檔一次建好）
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('pinduoduo', 'qianniu')),
  external_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
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

-- DesktopConfig 雲同步（亦見 schema-desktop-config.sql；新庫隨本檔一次建好）
CREATE TABLE IF NOT EXISTS tenant_desktop_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_desktop_settings_version_nonneg CHECK (config_version >= 0)
);

CREATE TABLE IF NOT EXISTS tenant_keywords_bundle (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb,
  config_version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_keywords_bundle_version_nonneg CHECK (config_version >= 0)
);

CREATE TABLE IF NOT EXISTS tenant_shop_roster (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb,
  config_version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_shop_roster_version_nonneg CHECK (config_version >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_desktop_settings_updated
  ON tenant_desktop_settings (updated_at);
CREATE INDEX IF NOT EXISTS idx_tenant_keywords_bundle_updated
  ON tenant_keywords_bundle (updated_at);
CREATE INDEX IF NOT EXISTS idx_tenant_shop_roster_updated
  ON tenant_shop_roster (updated_at);

INSERT INTO price_book (key, value, note) VALUES
  ('cny_to_credit', 100, '1 CNY = 100 Credit'),
  ('credit_per_1k_prompt_tokens', 1, '每 1K prompt tokens 扣 Credit（零售≈10×Flash未命中）'),
  ('credit_per_1k_completion_tokens', 2, '每 1K completion tokens 扣 Credit（零售≈10×Flash输出）');
