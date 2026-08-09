import type { PromptNode } from "./system-prompt-parser.js";

// Validated 8-hue categorical palette (dataviz skill's reference instance,
// light-mode column) — fixed order, never cycled within a single family of
// 8; a 9th distinct tag family wraps back to slot 1 rather than inventing a
// new hue, same rule a chart legend would follow.
export const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export const NEUTRAL_COLOR = "#7a7a7d"; // matches theme.css --color-neutral-600

// Menu/coloring stops at depth 3 (root tag > its subtag > that subtag's own
// entries, e.g. <skills> > <skill> > — matching the "tags and subtags"
// granularity a reader actually wants to navigate by. Anything deeper
// (a skill's own <name>/<description>/<file>) still renders as plain text
// within its depth-3 ancestor's colored block — see system-prompt-text.ts.
export const MAX_MENU_DEPTH = 3;

export interface MenuEntry {
  node: PromptNode;
  label: string;
  fullPath?: string;
  color: string;
}

function formatTagName(tagName: string): string {
  const spaced = tagName.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function findChild(node: PromptNode, tagName: string): PromptNode | undefined {
  return node.children.find((child) => child.tagName === tagName);
}

// One color per node, assigned by walking depth-1 first: a new distinct
// tagName claims the next categorical slot (cycling); a repeated tagName
// (e.g. two root-level <instructions>) reuses its family's slot. Depth-2/3
// descendants inherit their depth-1 ancestor's hue, lightened via
// color-mix so nesting reads as "same family, more specific," not as an
// unrelated color.
export function assignColors(root: PromptNode): Map<string, string> {
  const colors = new Map<string, string>();
  const hueByTagName = new Map<string, string>();
  let nextHueIndex = 0;

  function hueForDepth1(node: PromptNode): string {
    if (node.tagName === null) return NEUTRAL_COLOR;
    const existing = hueByTagName.get(node.tagName);
    if (existing) return existing;
    const hue = CATEGORICAL_PALETTE[nextHueIndex % CATEGORICAL_PALETTE.length];
    hueByTagName.set(node.tagName, hue);
    nextHueIndex += 1;
    return hue;
  }

  function tint(hue: string, depth: number): string {
    if (depth <= 1 || hue === NEUTRAL_COLOR) return hue;
    const mixPercent = depth === 2 ? 62 : 38;
    return `color-mix(in srgb, ${hue} ${mixPercent}%, white)`;
  }

  function walk(node: PromptNode, depth1Hue: string | null): void {
    for (const child of node.children) {
      if (child.depth > MAX_MENU_DEPTH) continue;
      const hue = child.depth === 1 ? hueForDepth1(child) : (depth1Hue ?? NEUTRAL_COLOR);
      colors.set(child.id, tint(hue, child.depth));
      walk(child, child.depth === 1 ? hue : depth1Hue);
    }
  }
  walk(root, null);
  return colors;
}

export function buildMenu(root: PromptNode, malformed: boolean, text: string): MenuEntry[] {
  const colors = assignColors(root);
  const entries: MenuEntry[] = [];
  const labelCounts = new Map<string, number>();

  function labelFor(node: PromptNode, parent: PromptNode): { label: string; fullPath?: string } {
    if (node.tagName === null) {
      if (malformed) return { label: "Full system prompt (unparsed)" };
      if (parent.children[0] === node) return { label: "Preamble" };
      if (parent.children[parent.children.length - 1] === node) return { label: "Trailing content" };
      return { label: "Untagged text" };
    }

    const nameChild = findChild(node, "name");
    if (nameChild) return { label: text.slice(nameChild.contentStart, nameChild.contentEnd).trim() };

    if (node.attrs.filePath) {
      const segments = node.attrs.filePath.split("/");
      return { label: segments[segments.length - 1] || node.attrs.filePath, fullPath: node.attrs.filePath };
    }

    const fileChild = findChild(node, "file");
    if (fileChild) return { label: text.slice(fileChild.contentStart, fileChild.contentEnd).trim() };

    const key = `${parent.id}|${node.tagName}`;
    const count = (labelCounts.get(key) ?? 0) + 1;
    labelCounts.set(key, count);
    const base = formatTagName(node.tagName);
    return { label: count > 1 ? `${base} (${count})` : base };
  }

  function walk(node: PromptNode): void {
    for (const child of node.children) {
      if (child.depth > MAX_MENU_DEPTH) continue;
      const { label, fullPath } = labelFor(child, node);
      entries.push({ node: child, label, fullPath, color: colors.get(child.id) ?? NEUTRAL_COLOR });
      walk(child);
    }
  }
  walk(root);
  return entries;
}
