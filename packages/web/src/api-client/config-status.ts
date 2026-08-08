import type { ConfigStatus } from "@gh-cp-chat-analyser/domain";
import { getJson } from "./http.js";

export function fetchConfigStatus(): Promise<ConfigStatus> {
  return getJson<ConfigStatus>("/api/config/status");
}
