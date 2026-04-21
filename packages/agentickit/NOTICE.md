# NOTICE

agentickit is an original work, released under the MIT license (see
[LICENSE](../../LICENSE)). Some of its design was informed by, and should
credit, the following prior work:

## assistant-ui

The structural composition of `<PilotSidebar>` was informed by
[assistant-ui](https://github.com/assistant-ui/assistant-ui)'s primitives
(MIT-licensed). Specifically the split between a scrollable viewport, a
message list that walks `UIMessage.parts` in order, a composer that grabs
focus on open, and the sticky-to-bottom autoscroll heuristic. We did not
copy its source; the agentickit sidebar is an independently written, much
smaller surface (≈5 files) and does not ship any assistant-ui APIs. If you
want the full primitive-driven experience, use assistant-ui directly.
It's excellent.

## Vercel AI SDK

agentickit is built on top of [Vercel's AI SDK](https://ai-sdk.dev) (Apache
2.0) and adopts its `UIMessage` part shape verbatim on the wire.
