# Test Matrix — 2026-09-20-fix-problems

## Error Under Test
Runtime DB connection failure when NeonDB is unreachable.

## Test Scenarios

### 1. Lazy Pool Initialization
- **Input:** Module imported without DATABASE_URL reachable
- **Expected:** No crash at import time; Pool created on first query
- **Type:** Unit test

### 2. Graceful Fallback in Layout
- **Input:** DB query fails with connection error
- **Expected:** Layout renders with DEFAULT_NAVIGATION
- **Type:** Unit test

### 3. Build Success
- **Input:** `pnpm run build`
- **Expected:** Build completes without errors
- **Type:** Build gate

### 4. Existing Tests Pass
- **Input:** `pnpm run test:unit`
- **Expected:** All existing tests pass
- **Type:** Regression
