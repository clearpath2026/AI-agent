-- Key-value store for runtime-editable config: prompt overrides, active Vapi assistant.

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reuse the same updated_at trigger pattern as other tables
CREATE OR REPLACE TRIGGER set_app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
