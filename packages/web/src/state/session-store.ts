import { useState } from "react";
import type { Session } from "@gh-cp-chat-analyser/domain";

export type Mode = "learn" | "analyze";
export type RightTab = "explanation" | "system-prompt" | "tools";

export function useSessionStore() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState(0);
  const [mode, setModeState] = useState<Mode>("learn");
  const [rightTab, setRightTab] = useState<RightTab>("explanation");

  function loadSession(next: Session): void {
    setSession(next);
    setSelectedTurnIndex(0);
    setRightTab("explanation");
  }

  function setMode(next: Mode): void {
    if (next === mode) {
      return;
    }
    setModeState(next);
    setSession(null);
    setSelectedTurnIndex(0);
    setRightTab("explanation");
  }

  return {
    session,
    selectedTurnIndex,
    mode,
    rightTab,
    loadSession,
    selectTurn: setSelectedTurnIndex,
    setMode,
    setRightTab,
  };
}
