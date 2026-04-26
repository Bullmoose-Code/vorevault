-- Short-lived single-use auth codes for desktop-app PKCE-style OAuth.
-- Created by /api/auth/discord/callback when state encodes a desktop
-- port; redeemed by /api/auth/desktop-exchange when the desktop POSTs
-- back the code + the matching verifier.
--
-- TTL is enforced at write time (expires_at = now() + 60 seconds) and
-- checked at exchange time. Single-use: used_at is null on creation,
-- set to now() on the first successful exchange. Subsequent attempts
-- with the same code fail.

CREATE TABLE IF NOT EXISTS auth_codes (
  code           text PRIMARY KEY,
  code_challenge text NOT NULL,
  session_id     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz
);

CREATE INDEX IF NOT EXISTS auth_codes_expires_at_idx ON auth_codes (expires_at);
