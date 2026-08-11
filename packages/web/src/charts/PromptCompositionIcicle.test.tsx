import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { assignIcicleColors } from "../lib/system-prompt-menu.js";
import { parseSystemPrompt } from "../lib/system-prompt-parser.js";
import { PromptCompositionIcicle } from "./PromptCompositionIcicle.js";

const SAMPLE_TEXT =
  "Intro text.\n<securityRequirements>Follow OWASP.</securityRequirements>\n" +
  "<skills><skill><name>graphify</name><description>Graph things.</description></skill></skills>";

function renderIcicle(text: string, overrides: Partial<Parameters<typeof PromptCompositionIcicle>[0]> = {}) {
  const { root, malformed } = parseSystemPrompt(text);
  const colors = assignIcicleColors(root);
  const onSelect = vi.fn();
  render(
    <PromptCompositionIcicle
      root={root}
      text={text}
      malformed={malformed}
      colors={colors}
      selectedId={null}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { root, onSelect };
}

describe("PromptCompositionIcicle", () => {
  it("renders one rect per top-level section plus the root row", () => {
    renderIcicle(SAMPLE_TEXT);

    expect(screen.getByTestId(/^icicle-node-root\.0$/)).toBeInTheDocument();
    expect(screen.getByTestId(/^icicle-node-root\.1$/)).toBeInTheDocument();
    expect(screen.getByTestId(/^icicle-node-root\.2$/)).toBeInTheDocument();
  });

  it("labels a wide-enough rect with the same label the nav menu would use", () => {
    renderIcicle(SAMPLE_TEXT);

    expect(screen.getByText("Security Requirements")).toBeInTheDocument();
  });

  it("shows a single-entry breadcrumb for the full prompt before any zoom", () => {
    renderIcicle(SAMPLE_TEXT);

    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(breadcrumb).getByText("Full prompt")).toBeInTheDocument();
  });

  it("zooms in on click, revealing descendants beyond the menu's depth-3 cap", () => {
    const text = "<skills><skill><details><nested>deep content here</nested></details></skill></skills>";
    const { root } = renderIcicle(text);
    const skill = root.children[0].children[0];

    fireEvent.click(screen.getByTestId(`icicle-node-${skill.id}`));

    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(breadcrumb).getByText("Skill")).toBeInTheDocument();
    const details = skill.children[0];
    expect(screen.getByTestId(`icicle-node-${details.id}`)).toBeInTheDocument();
  });

  it("zooms back out when the focused (top) row is clicked again", () => {
    const { root } = renderIcicle(SAMPLE_TEXT);
    const skills = root.children[2];

    fireEvent.click(screen.getByTestId(`icicle-node-${skills.id}`));
    const breadcrumbAfterZoomIn = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(breadcrumbAfterZoomIn).getByText("Skills")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`icicle-node-${skills.id}`));
    const breadcrumbAfterZoomOut = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(breadcrumbAfterZoomOut).queryByText("Skills")).not.toBeInTheDocument();
    expect(within(breadcrumbAfterZoomOut).getByText("Full prompt")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked node when within the shared selection depth cap", () => {
    const { root, onSelect } = renderIcicle(SAMPLE_TEXT);
    const securityRequirements = root.children[1];

    fireEvent.click(screen.getByTestId(`icicle-node-${securityRequirements.id}`));

    expect(onSelect).toHaveBeenCalledWith(securityRequirements);
  });

  it("shows each rect's size in characters and share of the current view", () => {
    const { root } = renderIcicle(SAMPLE_TEXT);
    const securityRequirements = root.children[1];

    const group = screen.getByTestId(`icicle-node-${securityRequirements.id}`);

    expect(within(group).getByText(/^\d+ chars · \d+%$/)).toBeInTheDocument();
  });

  it("caps the diagram's rendered width so labels don't scale up in a wide container", () => {
    renderIcicle(SAMPLE_TEXT);

    const svg = screen.getByRole("img", { name: /prompt composition icicle diagram/i });

    expect(svg).toHaveStyle({ maxWidth: "640px" });
  });

  it("truncates a label that doesn't fit its rect, ending in an ellipsis", () => {
    const LONG_TAG = "extremelyLongDescriptiveSectionName";
    const text = Array.from({ length: 14 }, (_, i) => `<${LONG_TAG}${i}>content</${LONG_TAG}${i}>`).join("");
    const { root } = renderIcicle(text);
    const firstSection = root.children[0];

    const group = screen.getByTestId(`icicle-node-${firstSection.id}`);
    const label = within(group).getByText(/…$/);

    expect(label.textContent).not.toBe("Extremely Long Descriptive Section Name0");
    expect(label.textContent!.length).toBeLessThan("Extremely Long Descriptive Section Name0".length);
  });

  it("gives the main label bold weight and the stats line normal weight", () => {
    const { root } = renderIcicle(SAMPLE_TEXT);
    const securityRequirements = root.children[1];
    const group = screen.getByTestId(`icicle-node-${securityRequirements.id}`);

    const mainLabel = within(group).getByText("Security Requirements");
    const stats = within(group).getByText(/^\d+ chars · \d+%$/);

    expect(mainLabel.getAttribute("font-weight")).toBe("600");
    expect(stats.getAttribute("font-weight")).toBe("400");
  });

  it("highlights the currently selected node with a distinct stroke", () => {
    const { root } = parseSystemPrompt(SAMPLE_TEXT);
    const colors = assignIcicleColors(root);
    const securityRequirements = root.children[1];

    render(
      <PromptCompositionIcicle
        root={root}
        text={SAMPLE_TEXT}
        malformed={false}
        colors={colors}
        selectedId={securityRequirements.id}
        onSelect={() => {}}
      />,
    );

    const rect = screen.getByTestId(`icicle-node-${securityRequirements.id}`).querySelector("rect");
    expect(rect?.getAttribute("stroke-width")).toBe("2");
  });
});
