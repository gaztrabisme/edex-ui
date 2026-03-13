## Done When

### 1. Terminal Bell → Visual Flash
- [x] When the terminal bell character (\x07) is received, the terminal panel briefly flashes — `term.onBell()` adds `bell-flash` CSS class
- [x] Flash is a subtle inset white glow, not disruptive — `box-shadow: inset 0 0 40px rgba(255,255,255,0.15)`
- [x] Flash duration 200ms — `setTimeout` removes class after 200ms

### 2. Confirm Close with Running Process
- [x] Ctrl+W on a tab with a running foreground process shows a confirmation prompt
- [x] Ctrl+W on a tab with only the shell (no child process) closes immediately as before
- [x] Confirmation styled consistently with the sci-fi theme — border-default, bg-secondary, text-main
- [x] New Rust command `has_running_children(session_id)` checks `/proc/pid/task/pid/children`
- [x] `SessionPids` shared state tracks session_id → PID mapping, managed by Tauri

### 3. Tab Drag Reorder
- [x] Tabs can be dragged to reorder via mouse drag-and-drop — HTML5 drag API
- [x] Visual feedback during drag — dragged tab opacity 0.4, drop target shows border highlight
- [x] Terminal order updates in the underlying data structure — `reorderTabs` rearranges Map entries
- [x] No interference with existing tab click-to-switch behavior — drag only triggers on actual drag, not click

### 4. Ctrl+Shift+K Clear Scrollback
- [x] Ctrl+Shift+K clears the terminal scrollback buffer — calls `terminal.term.clear()`
- [x] Keyboard shortcut wired up in `handleKeyboardShortcuts` (context menu already showed it)
- [x] xterm key event intercepted — `isLinux && e.code === 'KeyK'` returns false in custom handler

### Verification
- [x] `pnpm run check` passes (5 pre-existing warnings only)
- [x] `pnpm run type-check` passes
- [x] `cargo check` passes in src-tauri/
