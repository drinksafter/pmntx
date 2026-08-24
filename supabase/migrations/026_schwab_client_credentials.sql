-- 026_schwab_client_credentials
-- Schwab's app-level Client ID/Secret (obtained once at developer-portal
-- app registration, distinct from the per-authorization OAuth token pair
-- already on schwab_connection) don't fit the existing single-value
-- integration_credentials shape — Schwab needs two fields, and the OAuth
-- flow can't start until both are set. Encrypted with the same AES-256-GCM
-- module as everything else in src/lib/credentials/encryption.ts.

alter table schwab_connection
  add column encrypted_client_id text,
  add column encrypted_client_secret text,
  add column client_credentials_set_at timestamptz,
  add column client_credentials_set_by uuid references profiles (id);
