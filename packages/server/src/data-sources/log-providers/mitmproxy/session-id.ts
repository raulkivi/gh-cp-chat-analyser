import { statSync } from "node:fs";
import crypto from "node:crypto";

// One capture file = one session (phase-9-log-providers-implementation.md
// §3) — the id is a stable hash of the file's path + mtime, so the same
// unmodified file always resolves to the same session id across restarts,
// and a re-exported/overwritten file at the same path gets a new id rather
// than silently reusing stale session content.
export function computeHarSessionId(filePath: string): string {
  const stats = statSync(filePath);
  return crypto.createHash("sha256").update(`${filePath}:${stats.mtimeMs}`).digest("hex").slice(0, 16);
}
