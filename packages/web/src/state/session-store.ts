import { useState } from "react";
import type { Session } from "@gh-cp-chat-analyser/domain";

export function useSessionStore() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState(0);

  function loadSession(next: Session): void {
    setSession(next);
    setSelectedTurnIndex(0);
  }

  return { session, selectedTurnIndex, loadSession, selectTurn: setSelectedTurnIndex };
}
