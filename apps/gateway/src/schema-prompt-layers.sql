-- F38：PlatformHardRules（全局一份）＋ TenantVoice
CREATE TABLE IF NOT EXISTS platform_hard_rules (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_hard_rules (id, content)
VALUES (1, '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_voice TEXT NOT NULL DEFAULT '';
