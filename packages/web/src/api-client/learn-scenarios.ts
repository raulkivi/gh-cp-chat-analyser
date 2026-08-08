import type { Session } from "@gh-cp-chat-analyser/domain";
import { getJson } from "./http.js";

export function fetchLearnScenarios(): Promise<Session[]> {
  return getJson<Session[]>("/api/learn/scenarios");
}

export function fetchLearnScenario(id: string): Promise<Session> {
  return getJson<Session>(`/api/learn/scenarios/${id}`);
}
