/**
 * `{{NAME}}` agent — client component.
 *
 * Drop `<{{NAME_PASCAL}}Agent />` somewhere in your route tree. It mounts
 * a `<Pilot>` provider pointing at the matching server route at
 * `/api/{{NAME}}` plus a sidebar surface. The page suggestions and
 * empty-state text are cosmetic; tweak them to match how your users
 * should phrase their first prompts.
 *
 * If you already have a `<Pilot>` higher in the tree, drop the wrapper
 * here and just render the surface (or nothing — the surface is in
 * whatever parent already mounted Pilot).
 */

import { Pilot, PilotSidebar } from "@hec-ovi/agentickit";

export function {{NAME_PASCAL}}Agent() {
  return (
    <Pilot apiUrl="/api/{{NAME}}">
      <PilotSidebar
        defaultOpen={false}
        position="right"
        labels={{
          title: "{{NAME_PASCAL}}",
          openButton: "Open {{NAME_PASCAL}} chat",
          inputPlaceholder: "Ask {{NAME_PASCAL}}...",
          emptyState: "Hi! I'm the {{NAME_PASCAL}} assistant. What can I help with?",
        }}
        suggestions={[
          // Replace these with prompts that work well against your
          // {{NAME_PASCAL}} agent's system prompt + tool surface.
          "What can you help me with?",
          "Show me an example task",
          "Explain how you work in one sentence",
        ]}
      />
    </Pilot>
  );
}
