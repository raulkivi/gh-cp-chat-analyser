import { createApp } from "./app.js";
import { checkConfig } from "./services/config-check/config-check.js";

const port = 3000;
// Loopback-only per architecture.md §11.2 — never expose to other hosts.
const host = "127.0.0.1";

const configStatus = checkConfig();
if (configStatus.warnings.length > 0) {
  console.warn("Configuration warnings (see GET /api/config/status for fix steps):");
  for (const warning of configStatus.warnings) {
    console.warn(`  [${warning.code}] ${warning.message}`);
  }
}

createApp().listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
