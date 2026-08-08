import type { Session } from "@gh-cp-chat-analyser/domain";
import { getJson } from "./http.js";

export function fetchSessions(): Promise<Session[]> {
  return getJson<Session[]>("/api/sessions");
}

export function fetchSession(id: string): Promise<Session> {
  return getJson<Session>(`/api/sessions/${id}`);
}
