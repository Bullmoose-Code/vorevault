/**
 * Build a `vorevault://` deep-link URL for a file. The desktop app
 * (vorevault-desktop) registers this scheme on Win + Mac and translates it
 * back to `https://<vault>/f/<id>` when the user clicks the link from
 * Discord, email, or anywhere else.
 *
 * Path-passthrough: the desktop is a dumb forwarder, so this URL maps
 * one-to-one to the existing vault `/f/<id>` route. Future folder/tag
 * deep-links would build `vorevault://open/d/<id>` etc. — no desktop
 * change required.
 */
export function buildDesktopLink(fileId: string): string {
  return `vorevault://open/f/${fileId}`;
}
