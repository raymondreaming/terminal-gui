# Tier 2: UI Additions + Agent Creation UX Fix

## Overview

Three Tier 2 features (token/cost display, project notes, agent naming) **plus** a UX fix for agent creation — moving the "add agent" flow into the workspace/pane area so it's discoverable.

---

## 1. Agent Creation UX Overhaul

**Problem:** Currently the only way to add an agent to a group is via the "New" dropdown in the top-right toolbar — completely disconnected from the empty pane area. Nobody would discover this naturally.

**Solution:** When a new group is created (or a group has no panes), show an inline agent selection screen directly in the empty workspace area. Also add a `+` button within the pane area for adding more panes to an existing group.

### Changes:

**A) New groups start empty (no auto-created terminal pane)**

- `src/pages/Terminal/index.tsx`: Change `addGroup()` to create a group with `panes: []` instead of auto-creating a terminal pane

**B) Redesign the EmptyState for groups**

- Replace the current generic EmptyState with a prominent agent selection UI
- Show 3 large cards/buttons: **Claude**, **Codex**, **Local Models** (placeholder)
- Each card shows: icon, name, short description
- Clicking a card triggers the existing `handleAddPane(kind)` flow (with directory picker)
- Local Models card shows "Coming Soon" and is disabled

**C) Add a "local" agent kind (placeholder)**

- `src/lib/agents.ts`: Add `"local"` to `AgentKind` type, add `AgentDefinition` for it
- `src/lib/agent-ui.tsx`: Add an icon for local models (generic brain/chip icon)
- `src/server/agents/registry.ts`: No adapter registered yet — trying to use it would show an error
- Add a new `IconLocal` or `IconChip` to `Icons.tsx`
- `NEW_PANE_AGENT_KINDS`: Add `"local"` to the array
- The `isChatAgentKind` function should include `"local"` so it shows chat UI
- Since there's no backend adapter, the chat service should gracefully handle this (show "Coming soon" or similar)

**D) Add `+` button for adding more panes to an existing group**

- In the pane grid area (either in the header bar or as a small button at the end of the pane tabs), add a `+` button that opens a small inline menu (Claude / Codex / Local Models / Terminal)
- This duplicates what the "New" dropdown does but is contextually placed

**E) The "New" dropdown in toolbar stays** — it's still useful for power users, but no longer the only way

### Files modified:

- `src/lib/agents.ts` — add `"local"` kind
- `src/lib/agent-ui.tsx` — add icon mapping
- `src/components/ui/Icons.tsx` — add local model icon
- `src/pages/Terminal/index.tsx` — change `addGroup()`, redesign empty state
- `src/pages/Terminal/NewSessionButtons.tsx` — update to show new card-style layout for empty state vs compact mode for inline `+` menu
- `src/server/services/claude-chat.ts` — handle "local" kind gracefully (error message)

---

## 2. Token/Cost Display

**Current state:** Backend already emits `chat:usage` WebSocket events with `SessionUsage` data (inputTokens, outputTokens, costUsd, contextTokens, contextLimit, numTurns, durationMs).

**Solution:** Show a small, unobtrusive usage badge in the chat pane. Display it in the pane header bar next to the agent label.

### Changes:

**A) Listen for `chat:usage` events in ClaudeChatView**

- `src/components/chat/ClaudeChatView.tsx`: Subscribe to `chat:usage` WebSocket messages for this pane
- Store usage in local state

**B) Display usage in the pane header**

- `src/pages/Terminal/TerminalPaneView.tsx`: Accept usage data as a prop or via shared state
- Show a small text like `$0.12 · 2.4k tokens` in the header bar, right-aligned before the close button
- Use muted text styling (`text-surgent-text-3`, small font)
- Only show when there's actual usage data (not for fresh sessions)

### Files modified:

- `src/components/chat/ClaudeChatView.tsx` — subscribe to usage events, expose via callback or state
- `src/pages/Terminal/TerminalPaneView.tsx` — display usage badge in header
- `src/pages/Terminal/index.tsx` — wire up usage state if needed
- `src/lib/websocket.ts` — may need to check if usage events are already handled

---

## 3. Project Notes (System Prompt Injection)

**Current state:** Backend already supports `systemPrompt` in `SendMessageOpts` and wires it through to the Claude adapter. The UI just doesn't send it.

**Solution:** Add a collapsible "Notes" section in the right sidebar (same pattern as Ports, Processes sections). Contains a textarea where users type notes/instructions. These get persisted per-group and sent as the system prompt with every message.

### Changes:

**A) Add Notes sidebar section**

- New component `src/pages/Terminal/NotesSidebar.tsx`
- Collapsible section with a textarea
- Auto-saves on blur/debounce via REST endpoint or WebSocket
- Persisted to server as a JSON file (using atomic writes)

**B) Server endpoint for notes**

- `src/server/routes/api.ts` or new route file: GET/PUT `/api/notes/:groupId`
- Store in `data/notes.json` or `data/notes/<groupId>.json`
- Use `atomicWriteJson` for persistence

**C) Wire notes into chat messages**

- `src/lib/websocket.ts` or `src/components/chat/ClaudeChatView.tsx`: When sending a `chat:send` message, include the current notes as `systemPrompt`
- The backend already handles this — just need the UI to pass it through

**D) Add to sidebar layout**

- `src/pages/Terminal/index.tsx`: Add NotesSidebar section after the Ports section, before Processes
- Add `notes` to `sidebarSections` state for collapse toggle

### Files modified:

- `src/pages/Terminal/NotesSidebar.tsx` (NEW)
- `src/server/routes/api.ts` — add notes endpoints
- `src/pages/Terminal/index.tsx` — add sidebar section
- `src/components/chat/ClaudeChatView.tsx` — pass notes as systemPrompt when sending messages
- `src/lib/websocket.ts` — may need to update message types

---

## 4. Agent/Pane Naming

**Current state:** Panes show their agent type label ("Claude", "Codex", "Terminal") and optionally the directory name. No custom naming.

**Solution:** Allow users to name their panes. Double-click the pane header label to rename (same UX pattern as group tab renaming).

### Changes:

**A) Add `name` field to TerminalPaneModel**

- `src/lib/terminal-utils.ts`: Add optional `name?: string` to `TerminalPaneModel`
- Update `createTerminalPane` to accept optional name
- Update `getPaneTitle` to prefer custom name over default

**B) Add rename action to groups reducer**

- `src/pages/Terminal/index.tsx`: Add `"renamePane"` action type
- Handler updates the pane's name field

**C) Inline rename in pane header**

- `src/pages/Terminal/TerminalPaneView.tsx`: Make the agent label double-clickable
- On double-click, show an inline input (same pattern as GroupTabs rename)
- On blur/enter, dispatch rename action
- Display: show custom name if set, otherwise show agent type + directory

**D) Also show custom name in the right sidebar agent list**

- `src/pages/Terminal/AgentSidebar.tsx`: Display custom name if available

### Files modified:

- `src/lib/terminal-utils.ts` — add `name` to model
- `src/pages/Terminal/index.tsx` — add rename action
- `src/pages/Terminal/TerminalPaneView.tsx` — inline rename UI
- `src/pages/Terminal/AgentSidebar.tsx` — show custom name

---

## Implementation Order

1. **Agent Creation UX** (biggest UX impact, foundational)
2. **Agent/Pane Naming** (small, self-contained)
3. **Token/Cost Display** (backend ready, just UI wiring)
4. **Project Notes** (most work — new sidebar section + server endpoint + wiring)
