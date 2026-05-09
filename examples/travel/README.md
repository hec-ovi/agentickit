# travel example

Polished trip-planning showcase for agentickit. One Vite + React + Hono app with a router, three theme modes (light, dark, system), seven sections, plugin-shaped tools, real and mock weather, animated stats, page transitions, confetti on a complete booking, and the four agentickit chat surfaces wired in.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
# open http://localhost:5174
```

The Vite dev server (5174) proxies `/api/*` to the Hono server (8788).

## Pages and what each one demos

| Path | Primitive | Hint of what to ask |
| --- | --- | --- |
| `/` Dashboard | suggestions prop, `<PilotSidebar>`, `usePilotState` (read-only summary), `usePilotAction` mutating | "plan a 5-day trip to Lisbon for two travelers in June" |
| `/trips/:id` Overview | `usePilotState` (typed trip), `<PilotPopup>` per destination, `WeatherStrip` via plugin | "what is the weather forecast for this trip?" |
| `/trips/:id/itinerary` | `renderAndWait` for flight + hotel pickers (real card UI, respond/cancel both wired) | "propose a flight from JFK on the trip start date" |
| `/trips/:id/packing` | `<PilotChatView>` headless body, page-scoped tools, progress bar | "add 5 things for a rainy spring week" |
| `/trips/:id/book` | `mutating: true` actions, custom `renderConfirm`, confetti + toasts | "book the cheapest flight" |
| `/preferences` | `usePilotState` setter (auto `update_<name>`) plus `usePilotForm` | "set my home airport to LAX" |
| `/agents` | multi-agent registry + `<PilotAgentStateView>` for live state stream | switch to the Flights specialist, send a hello |

## Tool plugins

The plugin pattern is just "a no-render React component that calls `usePilotAction`". Mount the component, the tool registers; unmount, it cleans up. `src/plugins/index.tsx` exposes `<PilotPlugins plugins={[...]}>` for ergonomic batching.

The example ships three:

- **`weatherPlugin`**: `get_weather({ city, days, startDate? })`. Calls `/api/weather`, which proxies OpenWeather when `OPENWEATHER_API_KEY` is set in `.env.local`, otherwise returns deterministic mock data with the same shape. The agent can call this from any page; the trip-detail Overview tab also consumes the same endpoint via the `WeatherStrip` widget.
- **`currencyPlugin`**: `convert_currency({ amount, from, to })`. Static reference rates, six currencies. Useful when comparing trip costs in the user's preferred currency.
- **`destinationsPlugin`**: `list_destinations()` and `describe_destination({ city })`. Read-only catalog so the agent knows which cities have rich data + airport codes without hard-coding it in the prompt.

## Data layer

- `src/data/cities.ts`: catalog of five cities (Tokyo, Kyoto, Lisbon, Reykjavik, Buenos Aires). Each has airline list, hotel templates, activity catalog, palette + landmark glyph for the SVG cover.
- `src/data/seeds.ts`: five seeded trips (different statuses, dates, budgets, partial bookings) so the dashboard looks lived-in on first paint.
- `src/data/store.ts`: localStorage-backed React stores (`useTripsStore`, `usePreferencesStore`).
- `src/data/mock-search.ts`: deterministic `searchFlights / searchHotels / searchActivities / searchWeather`. Same inputs, same outputs, with seeded variety so picker UIs show realistic-feeling diversity.

## Theming

Three modes: light, dark, system. System tracks `prefers-color-scheme` and updates live when the OS changes. Choice persists in `localStorage` (`ak-travel-theme`). A bootstrap script in `index.html` writes `data-theme` to `<html>` before React mounts so there is no flash on initial paint.

The pilot chat-surface variables (`--pilot-accent`, `--pilot-bg`, etc.) are mapped to the host's design tokens at higher selector specificity (`:root[data-theme="light"]` and `:root[data-theme="dark"]`) so the host's manual choice always wins, including against the package's own `@media (prefers-color-scheme: dark)` defaults.

## Polish + UX

- Page transitions: routes fade and slide in via `<RouteFrame>`; respects `prefers-reduced-motion`.
- Mouse-aware glow on trip cards (radial gradient follows the cursor; pure CSS via `--mx`/`--my` vars).
- Animated stat counters tween up on first paint.
- Per-route chat suggestions: each page shows different starter prompts on the empty sidebar.
- Toast system at the bottom-right for feedback on bookings, renames, status changes.
- Confetti burst when a trip is fully booked.
- Sticky tab bar on the trip-detail page, with a subtle blur backdrop.
- Day-card timeline: vertical-line per day, colored dots per item kind (flight, hotel, activity, free), staggered reveal animation.
- Countdown chips ("In 12 days", "Day 2 of 7", "Past trip") on every trip card and the trip detail header.
- Pill-style currency / mobility / dietary controls on Preferences (instead of bare radios).
- "AI online" status pulse in the nav, plus a brand-dot ping.
- First-visit toast nudges new users to the chat sidebar.
- Mobile pass: nav collapses to icon-only, day cards reflow to 2 columns, popup launchers don't collide, toasts reposition.

## vLLM specifics

The server reuses the four shims from the todo example: streaming on, reasoning off via `chat_template_kwargs.enable_thinking=false`, Responses API only, assistant-history shape normalized, `function_call.arguments` sanitized. They live at the network boundary in `server/index.ts`. If your LLM is real OpenAI (or any sane Responses-compatible host), unset `OPENAI_BASE_URL` and the shims become inert.

## Layout

```
examples/travel/
├── server/index.ts                  Hono + createPilotHandler + AG-UI specialists + /api/weather
├── src/
│   ├── main.tsx                     React entrypoint, BrowserRouter
│   ├── app.tsx                      Theme + ToastProvider + AgentRegistry + Pilot + Routes + plugins
│   ├── styles.css                   Theme tokens, animations, component styles
│   ├── shell-context.tsx            Trips and preferences shared across routes
│   ├── theme/theme-provider.tsx     Light/dark/system + localStorage persistence
│   ├── plugins/                     PilotPlugins shell + weather, currency, destinations plugins
│   ├── data/
│   │   ├── cities.ts                5-city catalog
│   │   ├── types.ts                 Zod-typed trip, flight, hotel, activity, prefs
│   │   ├── seeds.ts                 5 pre-loaded sample trips
│   │   ├── store.ts                 localStorage-backed React stores
│   │   └── mock-search.ts           Deterministic in-memory search functions
│   ├── lib/
│   │   ├── format.ts                Currency, date, duration formatters
│   │   ├── mouse-glow.ts            Mouse-aware CSS-var setter for card glow
│   │   └── toast.tsx                Toast provider + stack
│   ├── components/
│   │   ├── nav.tsx                  Top nav + theme toggle + AI online indicator
│   │   ├── theme-toggle.tsx         Three-state segmented control
│   │   ├── modal.tsx                Generic centered dialog
│   │   ├── empty-state.tsx
│   │   ├── trip-card.tsx            With mouse-glow + countdown chip
│   │   ├── option-cards.tsx         Flight + hotel picker cards
│   │   ├── budget-bar.tsx
│   │   ├── countdown-chip.tsx
│   │   ├── animated-counter.tsx
│   │   ├── confetti.tsx             One-shot CSS confetti burst
│   │   ├── destination-cover.tsx    Per-city stylized SVG covers
│   │   ├── weather-strip.tsx        7-day forecast strip
│   │   ├── route-frame.tsx          Page transition wrapper
│   │   ├── first-visit-hint.tsx     One-shot welcome toast
│   │   └── app-confirm.tsx          Custom renderConfirm for mutating actions
│   ├── widgets/new-trip-wizard.tsx  PilotForm-bound modal wizard
│   └── routes/                      Seven page-level showcases
│       ├── dashboard.tsx
│       ├── trip-detail.tsx
│       ├── itinerary.tsx
│       ├── packing.tsx
│       ├── booking.tsx
│       ├── preferences.tsx
│       └── agents.tsx
```
