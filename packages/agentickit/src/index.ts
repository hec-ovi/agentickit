// Public client-side API.
// Hooks and components ship here; server-only code lives under /server.

export type {
  PilotActionRegistration,
  PilotConfig,
  PilotFormRegistration,
  PilotMessage,
  PilotMessagePart,
  PilotRenderAndWait,
  PilotRenderAndWaitArgs,
  PilotStateRegistration,
} from "./types.js";

// Hooks and components are implemented in a subsequent pass; this file
// is the export surface that the public API contract locks in.
export { usePilotAction } from "./hooks/use-pilot-action.js";
export { usePilotState } from "./hooks/use-pilot-state.js";
export { usePilotForm } from "./hooks/use-pilot-form.js";
export { Pilot, type PilotProps } from "./components/pilot-provider.js";
export { PilotSidebar, type PilotSidebarProps } from "./components/pilot-sidebar.js";
export { PilotPopup, type PilotPopupProps, type PilotPopupPosition } from "./components/pilot-popup.js";
export { PilotModal, type PilotModalProps } from "./components/pilot-modal.js";
export {
  PilotChatView,
  type PilotChatViewProps,
  type PilotChatViewHandle,
  type PilotChatViewLabels,
} from "./components/pilot-chat-view.js";
export {
  PilotConfirmModal,
  type PilotConfirmModalProps,
  type PilotConfirmRender,
  type PilotConfirmRenderArgs,
} from "./components/pilot-confirm-modal.js";

// Runtime abstraction. The default `<Pilot>` ships with `localRuntime()`
// (AI SDK 6 over HTTP/SSE); consumers can swap in any implementation of
// `PilotRuntime`, e.g. `agUiRuntime({ agent })` for AG-UI agents.
export { localRuntime } from "./runtime/local-runtime.js";
export {
  agUiRuntime,
  usePilotAgentState,
  usePilotAgentActivity,
  type AgUiRuntimeOptions,
} from "./runtime/ag-ui-runtime.js";
export type {
  PilotRuntime,
  PilotRuntimeConfig,
  PilotIncomingToolCall,
} from "./runtime/types.js";
