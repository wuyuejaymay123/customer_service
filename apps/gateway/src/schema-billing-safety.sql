-- 計費安全：UsageEstimated 標記（ADR-0012）；可重複執行
ALTER TABLE usage_records
  ADD COLUMN IF NOT EXISTS usage_estimated BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_usage_records_estimated
  ON usage_records (created_at DESC)
  WHERE usage_estimated = true;
