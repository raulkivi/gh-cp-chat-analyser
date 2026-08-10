import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMitmproxyCapturesDir } from "./resolve-mitmproxy-captures-dir.js";

describe("resolveMitmproxyCapturesDir", () => {
  it("joins the mitmproxy-captures subdirectory onto the app settings dir", () => {
    expect(resolveMitmproxyCapturesDir("/home/user/.config/gh-cp-chat-analyser")).toBe(
      path.join("/home/user/.config/gh-cp-chat-analyser", "mitmproxy-captures"),
    );
  });

  it("normalizes a trailing slash on the app settings dir", () => {
    expect(resolveMitmproxyCapturesDir("/home/user/.config/gh-cp-chat-analyser/")).toBe(
      path.join("/home/user/.config/gh-cp-chat-analyser", "mitmproxy-captures"),
    );
  });
});
