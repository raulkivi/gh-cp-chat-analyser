import { describe, expect, it } from "vitest";
import { redactHeaders } from "./redact-headers.js";

describe("redactHeaders", () => {
  it("strips credential-bearing headers entirely rather than masking them", () => {
    const redacted = redactHeaders({
      Authorization: "Bearer sk-ant-live-FAKE",
      "x-api-key": "sk-live-FAKE",
      "Content-Type": "application/json",
    });

    expect(redacted).not.toHaveProperty("Authorization");
    expect(redacted).not.toHaveProperty("authorization");
    expect(redacted).not.toHaveProperty("x-api-key");
    expect(redacted).toEqual({ "Content-Type": "application/json" });
  });

  it("matches credential header names case-insensitively", () => {
    const redacted = redactHeaders({
      AUTHORIZATION: "Bearer live-token",
      Cookie: "session=abc123",
      "Proxy-Authorization": "Basic abc",
      "API-Key": "live-key",
      "Set-Cookie": "session=abc123; Path=/",
    });

    expect(redacted).toEqual({});
  });

  it("leaves non-credential headers untouched", () => {
    const redacted = redactHeaders({
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    });

    expect(redacted).toEqual({
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    });
  });
});
