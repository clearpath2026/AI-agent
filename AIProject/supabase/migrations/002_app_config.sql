-- Migration 002: add app_config key-value store
-- Purpose: runtime-editable config for prompt overrides and active Vapi assistant
-- Apply: paste into Supabase Dashboard → SQL Editor and click Run

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_app_config_updated_at ON app_config;
CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
