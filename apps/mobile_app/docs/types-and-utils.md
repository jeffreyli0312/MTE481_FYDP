# Types & Utilities

## Shared Types (`app/types/workout.ts`)

Types used across the homepage, session view, and exercise overview.

```typescript
Exercise      { id, name, icon }           // Available exercises (e.g. Bench Press)
SetRecord     { id, durationSec, avgForceN } // A completed set within a session
SessionRecord { id, dateISO, durationSec, setsCount, avgForceN } // A completed session
```

---

## Formatters (`app/utils/format.ts`)

Utility functions for displaying time and dates.

| Function | Input | Output | Example |
|----------|-------|--------|---------|
| `pad2(n)` | number | zero-padded string | `pad2(5)` → `"05"` |
| `formatMMSS(seconds)` | total seconds | `MM:SS` string | `formatMMSS(125)` → `"02:05"` |
| `formatMinSec(seconds)` | total seconds | `Xm Ys` string | `formatMinSec(125)` → `"2m 5s"` |
| `formatDateShort(iso)` | ISO date string | localized date | `formatDateShort("2026-02-23T...")` → `"Feb 23, 2026"` |
