const PREFIX = "desktop:";

const PORT_RE = /^[0-9]+$/;
const CSRF_RE = /^[A-Za-z0-9_-]{20,64}$/;

export type DesktopState = { port: number; csrf: string };

export function formatDesktopState(s: DesktopState): string {
  return `${PREFIX}${s.port}:${s.csrf}`;
}

export function parseDesktopState(state: string | null | undefined): DesktopState | null {
  if (!state) return null;
  if (!state.startsWith(PREFIX)) return null;
  const rest = state.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const [portStr, csrf] = parts;
  if (!PORT_RE.test(portStr)) return null;
  const port = parseInt(portStr, 10);
  if (port < 1024 || port > 65535) return null;
  if (!CSRF_RE.test(csrf)) return null;
  return { port, csrf };
}
