# CLAUDE.md

## What Is This

A Tauri v2 rewrite of [eDEX-UI](https://github.com/GitSquared/edex-ui) — a fullscreen sci-fi terminal + system monitor. Forked from [zluo01/edex-ui](https://github.com/zluo01/edex-ui), customized for a 32:9 ultrawide (5120x1440).

## Tech Stack

### Frontend (SolidJS + TypeScript)
- **SolidJS** — reactive UI framework (not React — no virtual DOM, fine-grained reactivity)
- **Tailwind CSS v4** — utility-first styling
- **Vite 7** — build tool (requires Node 22+, use nvm)
- **xterm.js v6** — terminal emulator with WebGL renderer
- **augmented-ui** — CSS library for sci-fi clip-path borders
- **SmoothieCharts** — real-time streaming graphs
- **TanStack Solid Query** — async data fetching

### Backend (Rust)
- **Tauri v2.10** — app framework, IPC between Rust and WebView
- **portable-pty** — spawns real shell (bash) via pseudo-terminal
- **sysinfo** — CPU, memory, disk, network, process monitoring
- **nvml-wrapper** — NVIDIA GPU stats (temp, utilization, VRAM)
- **notify** — filesystem watcher (watches terminal CWD)
- **tokio** — async runtime

## Project Structure

```
src/                          # SolidJS frontend
  App.tsx                     # Root layout: System | Terminal | Network + FileSystem
  components/
    terminal/                 # xterm.js terminal with tabs (Ctrl+T/W/Tab)
    filesystem/               # File browser grid, follows terminal CWD
    system/                   # Left panel: clock, sysinfo, CPU/GPU, memory, processes
    network/                  # Right panel: connection status, traffic, disk usage
    setting/                  # Settings modal (theme picker)
    banner/                   # Section header component
  lib/
    themes/                   # Theme system (CSS vars + xterm.js config)
    terminal/                 # Terminal creation, SolidJS context
    setting/                  # Persistent settings via Tauri store
    queries/                  # TanStack Query hooks for system data
    os/                       # Tauri command wrappers

src-tauri/                    # Rust backend
  src/main.rs                 # App setup, plugin init, background tasks
  src/sys/main.rs             # SystemMonitor: polls CPU/GPU/mem/disk/net every 1s
  src/session/main.rs         # PtySessionManager: PTY lifecycle, read/write/resize
  src/file/main.rs            # DirectoryFileWatcher: watches CWD, scans files
  src/event/main.rs           # EventProcessor: central event bus (mpsc -> Tauri emit)
```

## Commands

```bash
# Must use Node 22 (system Node 18 is too old for Vite 7)
source ~/.nvm/nvm.sh && nvm use 22

# Dev (hot reload for frontend, recompiles Rust on change)
WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm run dev

# Production build
pnpm run build

# Lint + format
pnpm run check

# Type check
pnpm run type-check
```

## Layout (32:9 Adapted)

```
+-------------------+-------------------------------+-------------------+
|  System (20vw)    |  Terminal (flex-1, ~60vw)     |  Network (20vw)   |
|  min-w: 280px     |  xterm.js + tabs              |  min-w: 280px     |
|  Clock, CPU, RAM  |                               |  Traffic, Disk    |
|  GPU, Processes   |                               |  Status           |
+-------------------+-------------------------------+-------------------+
|  Filesystem (full width, 38vh)                                        |
|  Grid: auto-rows-[10vh] grid-cols-[repeat(auto-fill,minmax(10vh,14vh))]|
+-----------------------------------------------------------------------+
```

Side panels use `w-[20vw]` instead of original `16vw` for ultrawide readability.
Terminal uses `flex-1` instead of fixed `w-[68vw]` to fill remaining space.

## Theming

Themes defined in `src/index.css` as CSS custom properties under `html[data-theme="name"]`.
Terminal-specific colors in `src/lib/themes/styles.ts`.
Active theme: **TRON** (cyan `rgb(170, 207, 209)` on dark `#05080d`).

5 built-in themes: TRON, APOLLO, BLADE, CYBORG, INTERSTELLAR.

## IPC Pattern

- **Events** (Rust -> Frontend): system stats, PTY output, file changes — streamed via `app.emit()`
- **Commands** (Frontend -> Rust): terminal write/resize, file actions — via `invoke()`

## Conventions

- SolidJS uses `createSignal`/`createResource`, NOT React hooks
- Tailwind classes inline, no separate CSS files (except `index.css` for themes)
- Rust modules: each feature in its own dir (`sys/`, `session/`, `file/`, `event/`) with `mod.rs` + `main.rs`
- Biome for linting/formatting (not ESLint/Prettier)
