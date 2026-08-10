import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_ACTIVE_PROVIDER_ID = "vscode";

interface AppSettingsFileShape {
  activeProviderId: string;
}

// The one file this app ever writes to local disk (architecture.md §11.2,
// phase-9-log-providers-implementation.md §6). A missing file (first run)
// or a corrupt one both degrade to the default provider id rather than
// crashing startup — this is app-owned config, not a load-bearing store.
export function readActiveProviderId(settingsDir: string): string {
  const filePath = path.join(settingsDir, "settings.json");
  if (!existsSync(filePath)) {
    return DEFAULT_ACTIVE_PROVIDER_ID;
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<AppSettingsFileShape>;
    return typeof raw.activeProviderId === "string"
      ? raw.activeProviderId
      : DEFAULT_ACTIVE_PROVIDER_ID;
  } catch {
    return DEFAULT_ACTIVE_PROVIDER_ID;
  }
}

export function writeActiveProviderId(settingsDir: string, activeProviderId: string): void {
  mkdirSync(settingsDir, { recursive: true });
  const filePath = path.join(settingsDir, "settings.json");
  const payload: AppSettingsFileShape = { activeProviderId };
  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}
