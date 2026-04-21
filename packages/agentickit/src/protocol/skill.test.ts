import { describe, expect, it } from "vitest";
import { parseSkill } from "./skill.js";

describe("parseSkill", () => {
  it("parses minimal Anthropic-spec frontmatter (name + description only)", () => {
    const md = `---
name: create-task
description: Create a new task in the current project.
---

# create-task

Body content here.
`;
    const { frontmatter, body } = parseSkill(md);
    expect(frontmatter.name).toBe("create-task");
    expect(frontmatter.description).toBe("Create a new task in the current project.");
    expect(body).toContain("# create-task");
    expect(body).toContain("Body content here.");
  });

  it("parses the full gbrain superset (triggers, tools, mutating, version)", () => {
    const md = `---
name: enrich
version: 1.0.0
description: Enrich person and company pages.
triggers:
  - "enrich"
  - "look up this person"
tools:
  - get_page
  - put_page
  - search
mutating: true
---

Body.
`;
    const { frontmatter } = parseSkill(md);
    expect(frontmatter.name).toBe("enrich");
    expect(frontmatter.version).toBe("1.0.0");
    expect(frontmatter.triggers).toEqual(["enrich", "look up this person"]);
    expect(frontmatter.tools).toEqual(["get_page", "put_page", "search"]);
    expect(frontmatter.mutating).toBe(true);
  });

  it("parses a block-scalar description (pipe-style)", () => {
    const md = `---
name: long-skill
description: |
  First line of the description.
  Second line continues here.
---

Body.
`;
    const { frontmatter } = parseSkill(md);
    expect(frontmatter.description).toContain("First line");
    expect(frontmatter.description).toContain("Second line");
  });

  it("accepts the Anthropic-spelled allowed-tools field", () => {
    const md = `---
name: x
description: x
allowed-tools:
  - read
  - search
---

Body.
`;
    const { frontmatter } = parseSkill(md);
    expect(frontmatter.allowedTools).toEqual(["read", "search"]);
  });

  it("throws when frontmatter is missing", () => {
    expect(() => parseSkill("# Just a body\n")).toThrow(/frontmatter/);
  });

  it("throws when required `name` is missing", () => {
    const md = `---
description: no name field
---

Body.
`;
    expect(() => parseSkill(md)).toThrow(/name/);
  });

  it("throws when required `description` is missing", () => {
    const md = `---
name: x
---

Body.
`;
    expect(() => parseSkill(md)).toThrow(/description/);
  });

  it("strips surrounding quotes from scalar values", () => {
    const md = `---
name: "quoted-name"
description: 'single-quoted description'
---

Body.
`;
    const { frontmatter } = parseSkill(md);
    expect(frontmatter.name).toBe("quoted-name");
    expect(frontmatter.description).toBe("single-quoted description");
  });

  it("handles mutating: false explicitly", () => {
    const md = `---
name: read-only
description: x
mutating: false
---
`;
    const { frontmatter } = parseSkill(md);
    expect(frontmatter.mutating).toBe(false);
  });
});
