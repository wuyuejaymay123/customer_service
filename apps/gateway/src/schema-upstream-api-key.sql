-- ADR-0014：清空庫內上游 API Key 明文（列保留以兼容舊 schema）
UPDATE model_skus SET api_key = '' WHERE api_key IS DISTINCT FROM '';
