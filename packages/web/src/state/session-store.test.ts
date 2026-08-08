import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Session } from "@gh-cp-chat-analyser/domain";
import { useSessionStore } from "./session-store.js";

const session = { id: "s1" } as unknown as Session;

describe("useSessionStore", () => {
  it("starts with no session loaded and turn index 0", () => {
    const { result } = renderHook(() => useSessionStore());

    expect(result.current.session).toBeNull();
    expect(result.current.selectedTurnIndex).toBe(0);
  });

  it("loads a session and resets the selected turn to 0", () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => result.current.selectTurn(3));
    act(() => result.current.loadSession(session));

    expect(result.current.session).toEqual(session);
    expect(result.current.selectedTurnIndex).toBe(0);
  });

  it("updates the selected turn index", () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => result.current.loadSession(session));
    act(() => result.current.selectTurn(2));

    expect(result.current.selectedTurnIndex).toBe(2);
  });
});
