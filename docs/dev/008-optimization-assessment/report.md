# 008 — Optimization & Resource Assessment

## Executive Summary

The codebase is already well-hardened (zero unwrap, LTO builds, per-panel error boundaries). The main optimization opportunities fall into three tiers:

**Tier 1 — High Impact, Easy** (~2-3h): Polling reduction, memory leak fixes, devtools removal
**Tier 2 — Medium Impact, Moderate** (~3-4h): Reactive system improvements, debouncing, cache strategy
**Tier 3 — Low Impact, Polish** (~2h): Allocation patterns, code hygiene

Estimated combined effect: **40-60% reduction in idle CPU/memory pressure**, primarily from reducing unnecessary polling, fixing SmoothieChart lifecycle, and eliminating redundant resize handlers.

---

## Tier 1 — High Impact (Do First)

### 1.1 Latency Query Fires Every 1 Second
**File:** `src/lib/queries/index.ts`
**Issue:** Latency query (`refetchInterval: 1000`) pings Cloudflare DNS every second, even when data hasn't changed. IP query fires every 5s.
**Impact:** HIGH — ~86,400 unnecessary DNS queries/day; CPU overhead from fetch + parse
**Fix:** Set `refetchInterval: 30000` for latency, `60000` for IP. Add `staleTime: 15000`. Disable `refetchOnWindowFocus`.
**Savings:** ~98% reduction in network polling

### 1.2 SmoothieCharts Created at Module Scope (Memory Leak)
**Files:** `src/components/network/traffic/index.tsx`, `src/components/system/hardwareInfo/load.tsx`
**Issue:** Charts and TimeSeries created outside component lifecycle — persist after unmount, theme changes don't update line colors, series keep appending data to detached canvases.
**Impact:** HIGH — Memory leak on panel restart (error boundary); stale theme colors
**Fix:** Move chart creation to `onMount()`, call `chart.stop()` + nullify refs in `onCleanup()`, subscribe to theme signal for color updates.

### 1.3 SolidQueryDevtools Bundled in Production
**File:** `src/main.tsx`
**Issue:** `@tanstack/solid-query-devtools` imported unconditionally — ~100KB shipped in production binary.
**Impact:** HIGH — 100KB wasted in bundle
**Fix:** Wrap in `import.meta.env.DEV` conditional: `{import.meta.env.DEV && <SolidQueryDevtools />}`

### 1.4 Duplicate Terminal Resize Listeners
**File:** `src/components/terminal/session.tsx`
**Issue:** Two separate `window.addEventListener('resize', ...)` — one from `useScreenWidth()`, one direct. Both trigger `resizeTerminal()`, causing double resize per event.
**Impact:** MEDIUM-HIGH — Double xterm fit calculations on every resize; resize storms during window drag
**Fix:** Remove duplicate listener; use single debounced resize handler (requestAnimationFrame).

### 1.5 Disk Refresh Every 1 Second (Should Be 10s)
**File:** `src-tauri/src/sys/main.rs`
**Issue:** `disks.refresh_specifics()` runs every 1s poll. Disk usage changes slowly — 10s is sufficient.
**Impact:** MEDIUM — Disk I/O overhead on every poll (10-30ms per refresh)
**Fix:** Track disk refresh separately: refresh disks every 10 polls (10s), CPU/mem/GPU every 1s.

### 1.6 Component Temperature Refresh Every 1s (Should Be 5-10s)
**File:** `src-tauri/src/sys/main.rs`
**Issue:** `components.refresh()` (hardware temperature sensors) polled every 1s. Temperature changes slowly.
**Impact:** MEDIUM — 5-10ms per refresh, unnecessary at 1s granularity
**Fix:** Refresh components every 5-10 polls.

---

## Tier 2 — Medium Impact

### 2.1 GeoCache Full Clear at 500 Entries
**File:** `src-tauri/src/connections/main.rs`
**Issue:** When geo cache hits 500 entries, entire cache is cleared — all cached geolocations lost, forcing re-fetch of every IP.
**Impact:** MEDIUM — Periodic cache thrashing causes burst of HTTP requests to ip-api.com
**Fix:** Implement LRU-style eviction: remove oldest 50 entries when limit reached instead of full clear. Or increase limit to 1000-2000.

### 2.2 Directory Full Rescan on Every File Change
**File:** `src-tauri/src/file/main.rs`
**Issue:** Any file create/modify/remove triggers full `scan_directory()`. In active build directories (node_modules, target/), this can fire hundreds of times per second.
**Impact:** MEDIUM-HIGH — Large directories (1000+ files) take 50-200ms to scan
**Fix:** Add 500ms debounce: collect notify events, scan once after settling. This alone could reduce file scan CPU by 80%.

### 2.3 MemInfo 440-Cell Grid Recomputes Every Update
**File:** `src/components/system/meminfo/index.tsx`
**Issue:** `getCellOpacityClass()` called for all 440 grid cells on every memory event (1/sec). No memoization.
**Impact:** MEDIUM — 440 function calls + DOM reconciliation per second
**Fix:** Use `createMemo()` to cache opacity class map; update only when memory percentage changes significantly (>1%).

### 2.4 Clock Recreates 9 DOM Nodes Every Second
**File:** `src/components/system/clock/index.tsx`
**Issue:** `clockText()` returns new JSX array every second — 8 digit spans + colon element recreated.
**Impact:** MEDIUM — Unnecessary DOM churn
**Fix:** Wrap in `createMemo()`, or use individual signals per digit position.

### 2.5 Unbounded mpsc Channels
**File:** `src-tauri/src/event/main.rs`
**Issue:** All event channels use `mpsc::unbounded_channel()`. Under sustained load (e.g., `cat large_file`), events can accumulate unbounded.
**Impact:** MEDIUM — Theoretical unbounded memory growth
**Fix:** Switch to bounded channels (`mpsc::channel(1024)`), implement backpressure (drop oldest or rate-limit).

### 2.6 Vite Chunk Splitting Not Configured
**File:** `vite.config.mts`
**Issue:** No `manualChunks` — three.js + globe.gl + xterm all in one 1.8MB chunk. Could be split for better caching and lazy loading.
**Impact:** MEDIUM — Slower initial load; no differential caching
**Fix:** Add `rollupOptions.output.manualChunks` to isolate `three`/`globe.gl` and `xterm` into separate chunks.

---

## Tier 3 — Low Impact / Polish

### 3.1 Process List Full Sort (Only Need Top 10)
**File:** `src-tauri/src/sys/main.rs`
**Issue:** Full process list sorted by CPU every 1s, but only top 10 sent. Partial sort would be 50% faster.
**Fix:** Use `select_nth_unstable_by()` for partial sort.

### 3.2 Vec::new() Without Capacity in Directory Scan
**File:** `src-tauri/src/file/main.rs`
**Issue:** `Vec::new()` grows incrementally. Large directories cause multiple reallocations.
**Fix:** `Vec::with_capacity(64)` or estimate from read_dir hints.

### 3.3 Disk deepEqual via JSON.stringify
**File:** `src/components/network/disk/index.tsx`
**Issue:** `JSON.stringify()` comparison on every disk update (1/sec). Works but wasteful.
**Fix:** Shallow structural comparison on key fields only.

### 3.4 Globe Theme Change Re-maps All Data Arrays
**File:** `src/components/network/globe/index.tsx`
**Issue:** Theme change re-creates points, arcs, and rings arrays for Three.js. Rare but expensive.
**Fix:** Update material colors directly instead of recreating data arrays.

### 3.5 `three` in devDependencies
**File:** `package.json`
**Issue:** Listed in devDependencies but is a runtime transitive dependency of globe.gl.
**Fix:** Remove from devDependencies (let globe.gl resolve it as peer dep).

### 3.6 Resize Listener Not Debounced
**File:** `src/components/terminal/session.tsx`
**Issue:** Window resize triggers immediate terminal resize. Rapid resize events (window drag) cause 10+ resizes/sec.
**Fix:** Debounce with `requestAnimationFrame`.

---

## Priority Matrix

| # | Finding | Impact | Effort | Priority |
|---|---------|--------|--------|----------|
| 1.1 | Query polling 1s → 30s | HIGH | 15min | **P0** |
| 1.2 | SmoothieChart lifecycle | HIGH | 1h | **P0** |
| 1.3 | DevTools in prod bundle | HIGH | 10min | **P0** |
| 1.4 | Duplicate resize listeners | MED-HIGH | 30min | **P0** |
| 1.5 | Disk refresh 1s → 10s | MEDIUM | 30min | **P1** |
| 1.6 | Temperature refresh 1s → 5s | MEDIUM | 15min | **P1** |
| 2.1 | GeoCache LRU eviction | MEDIUM | 45min | **P1** |
| 2.2 | File watcher debounce | MED-HIGH | 45min | **P1** |
| 2.3 | MemInfo grid memoization | MEDIUM | 30min | **P1** |
| 2.4 | Clock memo | MEDIUM | 15min | **P2** |
| 2.5 | Bounded channels | MEDIUM | 30min | **P2** |
| 2.6 | Vite chunk splitting | MEDIUM | 30min | **P2** |
| 3.1 | Partial process sort | LOW | 15min | **P3** |
| 3.2 | Vec with_capacity | LOW | 5min | **P3** |
| 3.3 | Disk shallow compare | LOW | 15min | **P3** |
| 3.4 | Globe theme colors | LOW | 30min | **P3** |
| 3.5 | three in devDeps | LOW | 2min | **P3** |
| 3.6 | Resize debounce | LOW-MED | 15min | **P3** |

**Total estimated effort:** ~7-8 hours across all tiers
**Recommended approach:** Implement P0 first (2-3h), measure, then P1 (2-3h), then P2/P3 as desired.
