-- DesktopConfig 雲同步（ADR-0011）；可重複執行
-- 三包皆 Tenant 一級一行；JSONB 整包替換 + config_version 樂觀鎖

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

-- 樂觀鎖常用：WHERE tenant_id = $1 AND config_version = $expected
CREATE INDEX IF NOT EXISTS idx_tenant_desktop_settings_updated
  ON tenant_desktop_settings (updated_at);
CREATE INDEX IF NOT EXISTS idx_tenant_keywords_bundle_updated
  ON tenant_keywords_bundle (updated_at);
CREATE INDEX IF NOT EXISTS idx_tenant_shop_roster_updated
  ON tenant_shop_roster (updated_at);
