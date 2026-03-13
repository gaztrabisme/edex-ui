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
- **globe.gl** — 3D globe visualization (Three.js-based)

### Backend (Rust)
- **Tauri v2.10** — app framework, IPC between Rust and WebView
- **portable-pty** — spawns real shell (bash) via pseudo-terminal
- **sysinfo** — CPU, memory, disk, network, process monitoring
- **nvml-wrapper** — NVIDIA GPU stats (temp, utilization, VRAM)
- **procfs** — reads `/proc/net/tcp[6]` for active TCP connections
- **reqwest** — HTTP client for ip-api.com geolocation
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
    network/                  # Right panel: 3D globe, connection status, traffic, disk usage
      globe/                  # globe.gl 3D globe with live TCP connection arcs
    setting/                  # Settings modal (theme picker)
    banner/                   # Section header component
  lib/
    themes/                   # Theme system (CSS vars + xterm.js config)
    terminal/                 # Terminal creation, SolidJS context
    setting/                  # Persistent settings via Tauri store
    queries/                  # TanStack Query hooks for system data
    os/                       # Tauri command wrappers
    fileColors.ts             # Theme-derived file type colors (HSL hue rotation)

src-tauri/                    # Rust backend
  src/main.rs                 # App setup, plugin init, background tasks
  src/sys/main.rs             # SystemMonitor: polls CPU/GPU/mem/disk/net every 1s
  src/session/main.rs         # PtySessionManager: PTY lifecycle, read/write/resize
  src/file/main.rs            # DirectoryFileWatcher: watches CWD, scans files
  src/event/main.rs           # EventProcessor: central event bus (mpsc -> Tauri emit)
  src/connections/main.rs     # ConnectionMonitor: TCP connections + IP geolocation
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
|  System (20vw)    |  Terminal (flex-1, ~60vw)     |  Globe (20vw)     |
|  min-w: 280px     |  xterm.js + tabs              |  3D earth + arcs  |
|  Clock, CPU, RAM  |                               |  Network Status   |
|  GPU, Processes   |                               |  Traffic, Disk    |
+-------------------+-------------------------------+                   |
|  Filesystem (spans system + terminal)             |                   |
|  Grid: auto-rows-[10vh] ...minmax(10vh,14vh)      |                   |
+---------------------------------------------------+-------------------+
```

Right column (Network) spans full viewport height. Globe on top, network content below.
Side panels use responsive `w-[16vw] lg:w-[20vw]` (16vw on standard screens, 20vw on ultrawide via 2560px `lg` breakpoint).
Terminal uses `flex-1` instead of fixed `w-[68vw]` to fill remaining space.

## Theming

Themes defined in `src/index.css` as CSS custom properties under `html[data-theme="name"]`.
Terminal-specific colors in `src/lib/themes/styles.ts`.
Active theme: **TRON** (cyan `rgb(170, 207, 209)` on dark `#05080d`).

6 built-in themes: TRON, APOLLO, BLADE, CYBORG, INTERSTELLAR, DAEMON.

## IPC Pattern

- **Events** (Rust -> Frontend): system stats, PTY output, file changes — streamed via `app.emit()`
- **Commands** (Frontend -> Rust): terminal write/resize, file actions — via `invoke()`

## Conventions

- SolidJS uses `createSignal`/`createResource`, NOT React hooks
- Tailwind classes inline, no separate CSS files (except `index.css` for themes)
- Rust modules: each feature in its own dir (`sys/`, `session/`, `file/`, `event/`, `connections/`) with `mod.rs` + `main.rs`
- Biome for linting/formatting (not ESLint/Prettier)
