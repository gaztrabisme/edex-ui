# 009: Terminal Replacement Research

## Executive Summary

**The current xterm.js terminal is slow because of a fundamental architectural constraint: WebView-based terminal rendering cannot match native GPU rendering.** The bottleneck is not xterm.js itself (it's the industry standard, used by VS Code, Hyper, Tabby, etc.) — it's the pipeline: `PTY → Rust IPC → JSON serialize → WebKitGTK JS engine → xterm.js parser → WebGL via WebKitGTK → compositor → display`. Native terminals like Alacritty do: `PTY → VT parser → OpenGL → display`.

**There is no open-source Warp clone.** Warp's client is proprietary. The closest is Wave Terminal (Electron + Go), but it's a different product, not embeddable.

**Three viable paths forward, ranked by impact/effort:**

| # | Approach | Effort | Latency | Daily-driver? |
|---|----------|--------|---------|---------------|
| **A** | Fix remaining xterm.js bugs + add write batching | 1-2 days | ~15-30ms | Usable, not great |
| **B** | Embed Alacritty via `--embed` on X11 | 2-3 days | ~2-5ms | Excellent (X11 only) |
| **C** | Custom wgpu renderer + `alacritty_terminal` crate | 2-4 weeks | ~2-5ms | Excellent (portable) |

**Recommendation: Option B** — Embed Alacritty as a child window. Your system runs X11, Alacritty supports `--embed <window_id>`, and it gives you native GPU-accelerated terminal performance with minimal code. If Wayland becomes mandatory later, upgrade to Option C.

---

## Research Findings

### 1. Why the Current Terminal is Slow

#### The Fundamental Problem: WebView Pipeline

```
CURRENT (xterm.js in Tauri/WebKitGTK):
  PTY → BufReader(64KB) → utf8_lossy → JSON serialize → Tauri IPC bridge
    → WebKitGTK JSON parse → xterm.js VT parser (JS) → WebGL via WebKitGTK → display
  Latency: ~15-30ms | Throughput: ~20-50 MB/s

NATIVE (Alacritty):
  PTY → VT parser (Rust) → OpenGL direct → display
  Latency: ~2-5ms | Throughput: ~500-800 MB/s
```

The overhead comes from:
1. **IPC bridge** — every PTY output chunk crosses the Rust→WebView boundary with JSON serialization (~2-5ms per trip)
2. **JavaScript VT parsing** — xterm.js parses escape sequences in JS, which cannot match compiled Rust
3. **WebKitGTK's WebGL** — goes through ANGLE/wrapper, slower than direct OpenGL
4. **WebView compositor** — extra compositing layer adds ~1 frame of latency
5. **GC pauses** — JavaScript garbage collection causes micro-stutters during high output

#### Remaining Bugs in Current Implementation

| Issue | File | Severity | Description |
|-------|------|----------|-------------|
| Listener re-registration | session.tsx:241 | HIGH | Data listener closure captures reactive signal, may re-register on tab switch |
| Clipboard spam | session.tsx:185-190 | MEDIUM | `onSelectionChange` fires 100+/sec during drag, spams clipboard API |
| Keydown stale reads | session.tsx:288-296 | MEDIUM | `active()` signal read in closure without dependency tracking |
| No write batching | session.tsx:241-246 | MEDIUM | Each PTY emit triggers a separate `term.write()` call |

### 2. Open-Source Warp Alternatives

**No production-ready Warp clone exists.** Warp's rendering engine, UI framework, and terminal emulation are all proprietary.

| Project | Status | Assessment |
|---------|--------|------------|
| Warp (warpdotdev) | Proprietary | Client not open-source. Plans to open-source Rust UI framework never shipped |
| Wave Terminal | Active (v0.14.2) | Electron + Go. Closest "modern terminal" but not embeddable, different architecture |
| mycosavant/warp-clone | PoC | Too immature |
| cadot-eu/warp-alternative | Active | Next.js + xterm.js, web-based. Same bottleneck |

### 3. High-Performance Rust Terminal Emulators

| Project | Stars | GPU | Latency | Embeddable? |
|---------|-------|-----|---------|-------------|
| **Alacritty** | ~62.9K | OpenGL | ~2-5ms | YES — `alacritty_terminal` crate (used by Zed, Lapce) + `--embed` X11 flag |
| **Ghostty** | ~45.2K | Metal/Vulkan | ~2ms | YES — `libghostty` C ABI (but Zig, not Rust) |
| **WezTerm** | ~21K | OpenGL | ~3-5ms | Partial — `termwiz` + `portable-pty` crates (we already use portable-pty) |
| **Rio** | ~6.4K | WebGPU (wgpu) | TBD | No (monolithic) |
| **Kitty** | ~26K | OpenGL | ~3ms | No (C + Python, GPL-3.0) |

### 4. Embeddable Terminal Libraries (Rust Crates)

| Crate | Downloads | Purpose | Used By |
|-------|-----------|---------|---------|
| `vte` | 37.6M total | VT parser state machine | Alacritty, dozens of projects |
| `alacritty_terminal` | 458K total | Full terminal emulation (grid, scrollback, selection, search) | Zed, Lapce |
| `portable-pty` | Popular | Cross-platform PTY abstraction | **Already in eDEX**, WezTerm |
| `termwiz` | Active | Terminal capabilities, widgets, input decoding | WezTerm |

### 5. Embedding Approaches for Tauri v2

#### Option A: Optimize xterm.js (Quick Fix)

**What:** Fix remaining bugs + add write batching on both sides.

```typescript
// JS-side batching — accumulate events, flush per animation frame
let pending = '';
let rafScheduled = false;
listen(`data-${id}`, (e) => {
  pending += e.payload;
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      terminal.write(pending);
      pending = '';
      rafScheduled = false;
    });
  }
});
```

```rust
// Rust-side batching — accumulate PTY output for 4ms before emitting
// Reduces IPC calls from hundreds/sec to ~250/sec during output floods
```

**Pros:** Minimal code changes, no new dependencies, works on X11 + Wayland.
**Cons:** Still fundamentally limited by WebView pipeline. Maybe 30-50% improvement, not 10x.

#### Option B: Embed Alacritty via `--embed` (Recommended)

**What:** Spawn Alacritty as a child process embedded in the Tauri window via X11 embedding.

```rust
// Get X11 window ID from Tauri window
let raw_handle = window.window_handle()?.as_raw();
// Extract X11 window ID
let x11_id = match raw_handle {
    RawWindowHandle::Xlib(h) => h.window,
    _ => panic!("X11 required"),
};

// Spawn Alacritty embedded in our window
Command::new("alacritty")
    .args(["--embed", &x11_id.to_string()])
    .args(["--config-file", "/path/to/custom/alacritty.toml"])
    .spawn()?;
```

**Architecture:**
```
+-------------------+-------------------------------+-------------------+
|  System (WebView) |  Alacritty (native X11 child) |  Globe (WebView)  |
|  SolidJS panels   |  GPU-accelerated OpenGL       |  SolidJS panels   |
|                   |  ~2ms latency                 |                   |
+-------------------+-------------------------------+-------------------+
```

The WebView would have a transparent/empty region where the terminal goes. Alacritty's X11 window is positioned and sized to fill that region.

**Pros:**
- Native GPU rendering (~2-5ms latency, ~500MB/s throughput)
- Battle-tested terminal (selection, scrollback, search, SIXEL, ligatures, true color)
- Minimal code — just process management + resize coordination
- Alacritty config handles theming (map eDEX themes to Alacritty TOML)

**Cons:**
- X11 only — breaks on Wayland (no window embedding protocol)
- Focus management between WebView and Alacritty needs careful handling
- Tab management — multiple Alacritty instances or multiplex via `--socket`
- External dependency — Alacritty must be installed

**Viability:** High for your specific setup (Ubuntu 24.04, X11). Alacritty is `apt install alacritty`.

#### Option C: Custom wgpu Renderer + alacritty_terminal (Maximum)

**What:** Build a native GPU-accelerated terminal renderer using:
- `alacritty_terminal` for VTE parsing + terminal state
- `wgpu` for GPU rendering
- Overlay child window on Tauri (transparent, borderless, tracks main window)

This is how **Lapce** (35K stars) and **Zed** do it.

**Rendering approach (from Lapce's implementation):**
```rust
// Iterate terminal cells from alacritty_terminal
for cell in term.renderable_content().display_iter {
    // Draw background rect
    paint_cx.fill_rect(bg_rect, cell.bg);
    // Draw text glyph
    paint_cx.draw_glyph(cell.c, cell.point, cell.fg);
}
```

**Pros:**
- Full native performance
- Works on X11 + Wayland (wgpu supports both)
- Complete control over rendering and UX
- No external dependencies

**Cons:**
- 2-4 weeks of work: text shaping (cosmic-text/fontdue), glyph atlas, cursor, selection, scrollback rendering, search highlighting, resize
- Overlay window focus/input management is complex
- Must reimplement all terminal UX currently provided by xterm.js (context menu, search, tabs, etc.)

#### Options Considered and Rejected

| Approach | Why Rejected |
|----------|-------------|
| GTK VTE widget in Tauri's vbox | Can only stack above/below WebView, not embed in layout |
| Texture streaming (render in Rust, pipe frames to WebView) | Adds latency from GPU readback + encoding, would be slower than xterm.js |
| SharedArrayBuffer | WebKitGTK doesn't support it without COOP/COEP headers |
| Ghostty's libghostty | Written in Zig, not Rust. C FFI possible but adds complexity. WASM target not yet released |
| Replacing Tauri with pure Rust (iced/egui) | Would require rewriting the entire app, not just the terminal |

---

## Decision Matrix

| Criterion | A: Fix xterm.js | B: Embed Alacritty | C: Custom wgpu |
|-----------|----------------|-------------------|----------------|
| Effort | 1-2 days | 2-3 days | 2-4 weeks |
| Input latency | ~15-25ms | ~2-5ms | ~2-5ms |
| Throughput | ~30-60 MB/s | ~500+ MB/s | ~500+ MB/s |
| Daily-driver quality | Usable | Excellent | Excellent |
| Wayland support | Yes | No | Yes |
| Maintenance burden | Low | Low | High |
| Feature completeness | Full (current) | Full (Alacritty) | Must rebuild all |
| Risk | Low | Medium (X11 dep) | High (scope) |

---

## Recommendation

**Start with Option B (Embed Alacritty)** — it gives 10x performance improvement in 2-3 days of work. Your system runs X11, and Alacritty is the most popular GPU terminal on Linux.

Implementation plan:
1. Install Alacritty (`apt install alacritty`)
2. Create `alacritty.toml` that matches eDEX themes (colors, font, padding)
3. Add Rust code to spawn Alacritty as X11 child window in the terminal region
4. Handle resize events — when Tauri window resizes, resize the Alacritty child
5. Handle focus — click on terminal region → focus Alacritty, click elsewhere → focus WebView
6. Handle tabs — spawn multiple Alacritty instances or use tmux/Alacritty multiplexing
7. Keep xterm.js as fallback for Wayland (feature-flag or runtime detection)

If Wayland becomes a requirement later, upgrade to Option C (custom wgpu renderer).
