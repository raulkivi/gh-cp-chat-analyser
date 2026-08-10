// Credential-bearing header names stripped (not merely masked) before any
// captured exchange reaches a MitmExchangeDecoder, the enricher, or the API
// response (architecture.md §11.2/§6.2.3, phase-9-log-providers-
// implementation.md §4). Matched case-insensitively since HTTP header names
// are case-insensitive and HAR captures don't normalize casing.
const CREDENTIAL_HEADER_NAMES = new Set([
  "authorization",
  "x-api-key",
  "api-key",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (CREDENTIAL_HEADER_NAMES.has(name.toLowerCase())) {
      continue;
    }
    redacted[name] = value;
  }
  return redacted;
}
