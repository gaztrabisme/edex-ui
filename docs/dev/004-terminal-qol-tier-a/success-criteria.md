## Done When

### 1. Font Size Zoom (Ctrl+Plus/Minus)
- [x] Ctrl+= (or Ctrl+Shift+=) increases terminal font size
- [x] Ctrl+- decreases terminal font size
- [x] Font size has sensible min/max bounds (8–32)
- [x] Zoom level persists per-session (doesn't reset on tab switch) — `fontSizeOffset` signal is per Session component
- [x] xterm key events for Ctrl+=/- are intercepted (not sent to shell) — added to OVERRIDE_KEY_MAP + Ctrl+0 for reset

### 2. Copy on Select
- [x] Selecting text in the terminal automatically copies it to clipboard — `term.onSelectionChange()` in onMount
- [x] No interference with existing Ctrl+Shift+C manual copy — both work independently

### 3. CWD in Tab Title
- [x] Tab label shows last directory component of the current working directory — basename extraction via `split('/').filter(Boolean).pop()`
- [x] Tab title updates when shell changes directory — listens to `files` event (already emitted by backend on CWD change)
- [x] Falls back to `#N` index when CWD is not yet known
- [x] Manual rename (edit icon) still overrides CWD-based title — `terminalNames()[id]` checked first

### 4. Clickable File Paths
- [x] Absolute paths in terminal output (e.g. `/home/bppc/file.txt`) are clickable — custom ILinkProvider with regex `/(\/[\w.+\-@][\w.+\-@/]*)/g`
- [x] Clicking opens the path via Tauri's `openPath` — imported from `@tauri-apps/plugin-opener`
- [x] Does not break existing URL link handling — WebLinksAddon still active, custom provider is additive

### 5. Long Command Notification
- [x] When a terminal tab receives output while NOT the active tab, a pulsing dot appears on the tab
- [x] Indicator clears when the user switches to that tab — cleared in `createEffect(on(active, ...))`

### Verification
- [x] `pnpm run check` passes (5 pre-existing warnings only)
- [x] `pnpm run type-check` passes
