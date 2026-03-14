# 010: Warp-Like Terminal — Success Criteria

## Done When

### Step 1: Fix Terminal Bugs
- [x] Clipboard spam debounced on selection drag (100ms debounce timer)
- [x] PTY output batched via RAF on JS side (reduces write calls during floods)

### Step 2: Rich Input Editor (Core)
- [x] CodeMirror editor appears below terminal output
- [x] Shift+Enter inserts newline in editor
- [x] Enter sends command text to PTY and clears editor
- [x] Arrow keys navigate within editor text (Up/Down at boundary sends to shell)
- [x] Click-to-position cursor works in editor
- [x] Editor styled to match terminal theme (font, colors, background via Compartment)
- [x] Raw mode: keystrokes pass directly to PTY for interactive programs (vim, htop, ssh)
- [x] Mode toggle keybind: Ctrl+Shift+E switches editor/raw mode
- [x] Tab sends tab character to PTY (for autocomplete)
- [x] Ctrl+C sends interrupt when no selection
- [x] CodeMirror chunk-split in Vite build (265KB separate chunk)

### Step 3: OSC 133 Shell Integration
- [x] Frontend detects OSC 133 B/C markers in PTY output via string matching
- [x] Auto-switches between editor mode (prompt ready) and raw mode (command running)
- [x] Shell integration script injected for zsh (precmd/preexec hooks + PS1 marker)
- [x] Shell integration script injected for bash (PROMPT_COMMAND + DEBUG trap + PS1)
- [x] Injection runs on background thread with 500ms delay for shell init
- [x] Screen cleared after injection to hide setup script

### Step 4: Visual Command Blocks
- [ ] Each command + output grouped in a styled block
- [ ] Success/fail indicator per block
- [ ] Blocks are collapsible
- [ ] Copy block output button
