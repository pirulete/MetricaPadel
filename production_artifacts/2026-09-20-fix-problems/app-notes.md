# App Notes — 2026-09-20-fix-problems

## Fix Applied

**Problem:** Runtime DB connection failure when NeonDB is unreachable. The app crashes on any public page because the layout eagerly queries the database.

**Solution:** Added graceful fallback in `app/(public)/layout.tsx` — when `getCachedNavigation()` throws (DB unreachable), the layout renders with `DEFAULT_NAVIGATION` instead of crashing.

## Files Modified

| File | Change |
|------|--------|
| `app/(public)/layout.tsx` | Added try/catch around `getCachedNavigation()` with `DEFAULT_NAVIGATION` fallback |

## Verification

- ✅ Typecheck: 0 errors
- ✅ Lint: 0 new errors (pre-existing warnings only)
- ✅ Build: Success

## Notes

- The fix is minimal and targeted — only the layout is affected
- When DB is available, behavior is unchanged
- When DB is unreachable, the app renders with default navigation, allowing mock screens to work
- No changes to business logic or contracts
