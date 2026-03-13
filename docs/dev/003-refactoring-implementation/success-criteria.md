## Done When

### Phase 1: Quick Wins
- [x] C1: Canvas elements in load.tsx and traffic/index.tsx use refs instead of createElement in component body
- [x] C2: useScreenWidth() in session.tsx uses proper cleanup (no AbortController leak)
- [x] H3: lodash-es removed, replaced with lightweight deep equality (JSON.stringify)
- [x] H4: ip-api.com — documented as HTTP-only (free tier does not support HTTPS)
- [x] H5: Artificial lazy-load delays removed from System, Network, FileSystem
- [x] M7: .nvmrc file added with Node 22
- [x] M8: globe.gl version pinned (2.45.0, no caret)

### Phase 2: Performance
- [x] H1: Polling intervals extracted to named constants (SYSTEM_POLL_INTERVAL, CONNECTION_POLL_INTERVAL, CWD_POLL_INTERVAL, GEOLOCATION_TIMEOUT, GEOLOCATION_BATCH_SIZE)
- [x] H2: SystemMonitor extract_process uses Vec::with_capacity pre-allocation
- [x] M1: PtySessionManager kills old session before overwriting (sends Exit event + removes from map)
- [x] M4: CWD watcher — documented why polling is necessary (procfs symlinks don't trigger inotify). N/A for inotify replacement.
- [x] M6: CWD watcher uses as_deref() instead of clone()

### Phase 3: Code Quality
- [x] M2+M3: Terminal magic numbers extracted to 11 named constants (GCD values, breakpoints, font sizes, extra cols/rows)
- [x] M5: useTauriEvent() hook created at src/lib/hooks/useTauriEvent.ts, used in 7 components
- [x] L2: Geolocation parsing uses GeoApiResponse serde struct instead of manual JSON extraction
- [x] L3: ConnectionMonitor has send_event() helper method
- [x] L5: @types/lodash and @types/lodash-es removed

### Verification
- [x] `pnpm run check` passes (5 pre-existing warnings only)
- [x] `pnpm run type-check` passes
- [x] `cargo check` passes in src-tauri/
