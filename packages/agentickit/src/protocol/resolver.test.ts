import { describe, expect, it } from "vitest";
import { parseResolver } from "./resolver.js";

describe("parseResolver", () => {
  it("parses a simple RESOLVER.md with one section and one skill", () => {
    const md = `# App Resolver

## Core capabilities

| Trigger | Skill |
|---------|-------|
| "create a task" | \`skills/create-task/SKILL.md\` |
`;
    const entries = parseResolver(md);
    expect(entries).toEqual([
      {
        trigger: '"create a task"',
        skillPath: "skills/create-task/SKILL.md",
        section: "Core capabilities",
        isExternalPointer: false,
      },
    ]);
  });

  it("tracks section changes across H2 headings", () => {
    const md = `## Always-on

| Trigger | Skill |
|---------|-------|
| Every message | \`skills/signal/SKILL.md\` |

## Ingestion

| Trigger | Skill |
|---------|-------|
| "ingest this" | \`skills/ingest/SKILL.md\` |
`;
    const entries = parseResolver(md);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.section).toBe("Always-on");
    expect(entries[1]?.section).toBe("Ingestion");
  });

  it("ignores the separator row and table header row", () => {
    const md = `## Test

| Trigger | Skill |
|---------|-------|
| "do it" | \`skills/it/SKILL.md\` |
`;
    const entries = parseResolver(md);
    // The header "| Trigger | Skill |" must not become an entry.
    expect(entries).toHaveLength(1);
  });

  it("skips malformed skill cells (no backticked path)", () => {
    const md = `## Test

| Trigger | Skill |
|---------|-------|
| "bad" | this is just prose |
`;
    const entries = parseResolver(md);
    expect(entries).toEqual([]);
  });

  it("preserves external pointers (GStack, Check, Read)", () => {
    const md = `## External

| Trigger | Skill |
|---------|-------|
| "office hours" | GStack: office-hours |
| "policy question" | Check ACCESS_POLICY.md |
| "style guide" | Read style-guide.md |
`;
    const entries = parseResolver(md);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.isExternalPointer)).toBe(true);
    expect(entries[0]?.skillPath).toBe("GStack: office-hours");
    expect(entries[1]?.skillPath).toBe("Check ACCESS_POLICY.md");
  });

  it("ignores H1 and other-level headings when tracking sections", () => {
    const md = `# Not a section

### Not a section either

## Real section

| Trigger | Skill |
|---------|-------|
| "x" | \`skills/x/SKILL.md\` |
`;
    const entries = parseResolver(md);
    expect(entries[0]?.section).toBe("Real section");
  });

  it("returns empty array on empty input", () => {
    expect(parseResolver("")).toEqual([]);
  });
});
