import { useMemo, useState } from "react";
import type { HierarchyRectangularNode } from "d3-hierarchy";
import { hierarchy as d3Hierarchy, partition as d3Partition } from "d3-hierarchy";
import { labelForNode, MAX_MENU_DEPTH, NEUTRAL_COLOR } from "../lib/system-prompt-menu.js";
import type { PromptNode } from "../lib/system-prompt-parser.js";

const WIDTH = 640;
const ROW_HEIGHT = 28;
// One row for the focused node itself plus up to 3 descendant levels —
// beyond that a row gets too thin to read, so deeper content stays folded
// into its ancestor's rect until the user zooms again.
const VISIBLE_LEVELS = 4;
const MIN_LABEL_WIDTH = 28;
const MIN_STATS_WIDTH = 50;
const MIN_STATS_HEIGHT = 20;

// Share of the *current* focus, not the whole prompt — so the percentage
// re-normalizes to 100% of whatever's visible as the user zooms in, instead
// of shrinking toward 0% the deeper they go.
function formatShare(value: number, total: number): string {
  return `${total > 0 ? Math.round((value / total) * 100) : 0}%`;
}

interface PromptCompositionIcicleProps {
  root: PromptNode;
  text: string;
  malformed: boolean;
  colors: Map<string, string>;
  selectedId: string | null;
  onSelect: (node: PromptNode) => void;
}

function findPath(node: PromptNode, id: string): PromptNode[] | null {
  if (node.id === id) return [node];
  for (const child of node.children) {
    const rest = findPath(child, id);
    if (rest) return [node, ...rest];
  }
  return null;
}

// A node's own textual real estate — its full span minus whatever its
// children already account for — so summing self-values back up a subtree
// reconstructs exactly the ancestor's own span, with no double-counting of
// nested content. Also the correct value for a node whose real children are
// hidden by the visible-depth cutoff (nothing subtracted, so its rect's
// width still reflects everything nested inside it).
function selfSpan(node: PromptNode): number {
  const own = node.end - node.start;
  const childrenSpan = node.children.reduce((sum, child) => sum + (child.end - child.start), 0);
  return Math.max(0, own - childrenSpan);
}

/**
 * Zoomable icicle diagram of a parsed system prompt's tag structure. Not
 * self-contained — `root`/`malformed` come from `parseSystemPrompt(text)`
 * and `colors` from `assignIcicleColors(root)`; build those first, then
 * pass their output straight through as props. Click a rect to zoom into
 * it (breadcrumb trail shows the way back out) and to call `onSelect` when
 * the node is within the shared selection depth cap.
 */
export function PromptCompositionIcicle({
  root,
  text,
  malformed,
  colors,
  selectedId,
  onSelect,
}: PromptCompositionIcicleProps) {
  const [focusId, setFocusId] = useState(root.id);

  const path = useMemo(() => findPath(root, focusId) ?? [root], [root, focusId]);
  const focusNode = path[path.length - 1];
  const focusParent = path.length > 1 ? path[path.length - 2] : null;

  const partitionedRoot = useMemo(() => {
    const hierarchyRoot = d3Hierarchy(focusNode, (node) =>
      node.depth - focusNode.depth < VISIBLE_LEVELS - 1 ? node.children : undefined,
    ).sum((node) => {
      const cutoff = node.depth - focusNode.depth >= VISIBLE_LEVELS - 1 && node.children.length > 0;
      return cutoff ? node.end - node.start : selfSpan(node);
    });
    return d3Partition<PromptNode>().size([WIDTH, VISIBLE_LEVELS * ROW_HEIGHT])(hierarchyRoot);
  }, [focusNode]);

  const labelCounts = useMemo(() => new Map<string, number>(), [focusNode]);

  function labelFor(node: HierarchyRectangularNode<PromptNode>): string {
    if (!node.parent) {
      return focusParent ? labelForNode(focusNode, focusParent, malformed, text, labelCounts).label : "Full prompt";
    }
    return labelForNode(node.data, node.parent.data, malformed, text, labelCounts).label;
  }

  function handleClick(node: PromptNode, isFocusRow: boolean): void {
    if (isFocusRow) {
      if (focusParent) setFocusId(focusParent.id);
    } else {
      setFocusId(node.id);
    }
    if (node.depth > 0 && node.depth <= MAX_MENU_DEPTH) onSelect(node);
  }

  if (!partitionedRoot.value) {
    return <p className="text-muted">No composition data.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <nav aria-label="Composition breadcrumb" style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: 12 }}>
        {path.map((node, index) => {
          const label =
            index === 0 ? "Full prompt" : labelForNode(node, path[index - 1], malformed, text, new Map()).label;
          const isCurrent = node.id === focusId;
          return (
            <span key={node.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {index > 0 && (
                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              )}
              {isCurrent ? (
                <span aria-current="location" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}>
                  {label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setFocusId(node.id)}
                  className="btn-link"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "var(--color-accent)",
                    fontWeight: 400,
                  }}
                >
                  {label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      <svg
        role="img"
        aria-label="Prompt composition icicle diagram"
        width="100%"
        viewBox={`0 0 ${WIDTH} ${VISIBLE_LEVELS * ROW_HEIGHT}`}
        style={{ display: "block" }}
      >
        {partitionedRoot.descendants().map((node) => {
          const w = node.x1 - node.x0;
          const h = node.y1 - node.y0;
          if (w <= 0 || h <= 0) return null;
          const isFocusRow = !node.parent;
          const fill = colors.get(node.data.id) ?? NEUTRAL_COLOR;
          const label = labelFor(node);
          const isSelected = node.data.id === selectedId;
          const value = node.value ?? 0;
          const showStats = w >= MIN_STATS_WIDTH && h >= MIN_STATS_HEIGHT;
          return (
            <g
              key={node.data.id}
              data-testid={`icicle-node-${node.data.id}`}
              transform={`translate(${node.x0},${node.y0})`}
              onClick={() => handleClick(node.data, isFocusRow)}
              style={{ cursor: "pointer", transition: "transform 200ms ease" }}
            >
              <title>{`${label} — ${value} chars${isFocusRow ? " (focused — click to zoom out)" : ""}`}</title>
              <rect
                width={Math.max(w - 1, 0)}
                height={Math.max(h - 1, 0)}
                fill={fill}
                stroke={isSelected ? "var(--color-text)" : "var(--color-surface)"}
                strokeWidth={isSelected ? 2 : 1}
                style={{ transition: "width 200ms ease, height 200ms ease" }}
              />
              {w >= MIN_LABEL_WIDTH && (
                <text
                  x={4}
                  y={showStats ? h / 2 - 6 : h / 2}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--color-text)"
                  style={{ pointerEvents: "none" }}
                >
                  {label}
                </text>
              )}
              {showStats && (
                <text
                  x={4}
                  y={h / 2 + 8}
                  dominantBaseline="middle"
                  fontSize={9}
                  className="text-muted"
                  style={{ pointerEvents: "none" }}
                >
                  {`${value} chars · ${formatShare(value, partitionedRoot.value ?? 0)}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
