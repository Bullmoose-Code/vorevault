const PREFIX = "desktop:";

// Port range 1024-65535: 1024+ excludes the privileged range native apps
// shouldn't bind anyway, and 65535 is the IANA maximum. The desktop client
// uses port 0 (OS-assigned ephemeral) which lands in 49152-65535.
const PORT_RE = /^[0-9]+$/;

// PKCE code_challenge per RFC 7636 §4.2 — base64url(SHA256(verifier)) with
// no padding = exactly 43 chars from the base64url alphabet.
// Note: the regex MUST exclude ":" (the field separator in our state encoding).
// Base64url already excludes ":" so this is satisfied; if the alphabet ever
// changes, the format here breaks.
const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export type DesktopState = { port: number; code_challenge: string };

export function formatDesktopState(s: DesktopState): string {
  return `${PREFIX}${s.port}:${s.code_challenge}`;
}

/**
 * Parse a state string from a vault OAuth callback. Returns null for any
 * malformed or non-desktop state — callers use null as the "this is the
 * regular browser flow" signal.
 */
export function parseDesktopState(state: string | null | undefined): DesktopState | null {
  if (!state) return null;
  if (!state.startsWith(PREFIX)) return null;
  const rest = state.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const [portStr, code_challenge] = parts;
  if (!PORT_RE.test(portStr)) return null;
  const port = parseInt(portStr, 10);
  if (port < 1024 || port > 65535) return null;
  if (!CODE_CHALLENGE_RE.test(code_challenge)) return null;
  return { port, code_challenge };
}

/**
 * Validate raw query inputs (e.g., from a route handler) and return a
 * canonical DesktopState or null. This is the single validation entry
 * point — both desktop-init (raw inputs) and parseDesktopState (structured
 * string) funnel through the same range/regex checks.
 */
export function validateDesktopState(
  port: unknown,
  code_challenge: unknown,
): DesktopState | null {
  if (typeof port !== "number" && typeof port !== "string") return null;
  if (typeof code_challenge !== "string") return null;
  const portNum = typeof port === "string" ? parseInt(port, 10) : port;
  if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) return null;
  if (!CODE_CHALLENGE_RE.test(code_challenge)) return null;
  return { port: portNum, code_challenge };
}
