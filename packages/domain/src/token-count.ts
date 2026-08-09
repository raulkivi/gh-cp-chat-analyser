import { z } from "zod";

export const tokenCountSchema = z.union([
  z.object({ known: z.literal(true), value: z.number() }),
  z.object({ known: z.literal(false), reason: z.string() }),
]);

export type TokenCount = z.infer<typeof tokenCountSchema>;

export function unavailableTokenCount(reason: string): TokenCount {
  return { known: false, reason };
}

// All-or-nothing: one unknown count makes the total unknown rather than
// silently under-counting it. Reused for both a session's total AI Credits
// and a turns table's running cumulative total.
export function sumTokenCounts(counts: TokenCount[], reasonWhenUnknown: string): TokenCount {
  let total = 0;
  for (const count of counts) {
    if (!count.known) {
      return unavailableTokenCount(reasonWhenUnknown);
    }
    total += count.value;
  }
  return { known: true, value: total };
}
