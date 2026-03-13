# 001 — UI Bug Fixes

## Done When

- [x] Memory shows correct usage % (used/total*100), not swap ratio
  - `sys/main.rs`: `ratio` now computed as `(used_memory / total_memory) * 100.0`
- [x] VRAM shows correct capacity % (usedMemory/totalMemory*100), not memory controller utilization
  - `sys/main.rs`: `memory_usage` now computed as `(used_memory / total_memory) * 100.0` instead of `rates.memory`
- [x] Swap bar width calculated from swap_used/swap_total, not swap_used/total_ram
  - Added `swap_total` field to MemoryInfo struct and frontend model; swap bar divides by `swapTotal`
- [x] Network In chart receives data (fix `received` vs `receive` field name mismatch)
  - `models/index.ts`: renamed `receive` → `received`; updated all references in `traffic/index.tsx`
- [x] CPU/GPU charts don't overflow their boundaries
  - `load.tsx`: wrapped canvas elements in clipping `div` with `overflow-hidden`
- [x] App compiles and runs without errors (`pnpm run check` passes)
  - `cargo check`: clean, `pnpm run check`: 5 pre-existing warnings (non-null assertions), `tsc --noEmit`: clean
