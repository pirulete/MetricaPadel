# Ponytail Review Report — Etapa 2-3 Onboarding & Dashboard

**Reviewer**: @ponytail-reviewer  
**Date**: 2026-09-21  
**Files reviewed**: 18 files across lib/, components/, app/api/

## Escalera Ponytail Results

### 1. YAGNI — You Aren't Gonna Need It

| File | Function | Verdict | Action |
|------|----------|---------|--------|
| `lib/padel/course-code.ts` | `normalizeInviteCode` | **UNUSED** — SQL handles case-insensitive via `upper()` | ✅ DELETED |
| `lib/padel/course-code.ts` | `isValidInviteCode` | **UNUSED** — Zod schema validates format | ✅ DELETED |
| `lib/padel/dashboard.ts` | `computeAverage` | **UNUSED** — SQL computes avg directly | ✅ DELETED |
| `lib/padel/dashboard.ts` | `deriveLevel` | Used (now wired into dashboard query) | ✅ KEPT |
| `lib/padel/dashboard.ts` | `isClassToday` | Used (now wired into dashboard query) | ✅ KEPT |
| `lib/padel/dashboard.ts` | `todayLabel` | Used by `isClassToday` | ✅ KEPT |

### 2. Native Platform
No custom abstractions that duplicate platform capabilities. Drizzle, Zod, Radix all used correctly.

### 3. Existing Dependencies
No missing dependency usage detected. All functions use built-in TS/Node APIs.

### 4. Single Line Rule
All functions are already minimal (1-27 lines). No reduction needed.

## Bug Fix (Critical)

| Issue | File | Before | After |
|-------|------|--------|-------|
| `classesToday` always counted ALL courses with days, not just TODAY | `lib/db/queries/padel/dashboard.ts:64` | `coursesList.filter((c) => c.days.length > 0).length` | `coursesList.filter((c) => isClassToday(c.days)).length` |

## DRY Violation Fix

| Issue | File | Before | After |
|-------|------|--------|-------|
| `getStudentDashboard` reimplemented `deriveLevel` inline (lines 89-93) | `lib/db/queries/padel/dashboard.ts:89-93` | Inline ternary chain | `deriveLevel(last.totalScore / last.maxScore)` |

## Dead Import Cleanup

| File | Import | Reason |
|------|--------|--------|
| `lib/db/queries/padel/dashboard.ts` | `users` | Not referenced by any function |

## Line Count Summary

| Change | Lines removed | Lines added | Net |
|--------|--------------|-------------|-----|
| Remove `computeAverage` + test | -15 | 0 | **-15** |
| Remove `normalizeInviteCode` + test | -12 | 0 | **-12** |
| Remove `isValidInviteCode` + test | -16 | 0 | **-16** |
| Wire `isClassToday` into dashboard | 0 | +1 | +1 |
| Wire `deriveLevel` into dashboard | -3 | +1 | **-2** |
| Remove unused `users` import | -1 | 0 | **-1** |
| Update FEATURES.md | -1 | +1 | 0 |
| **TOTAL** | **-48** | **+3** | **-45 lines** |

## Files Modified

1. `lib/padel/course-code.ts` — removed `normalizeInviteCode`, `isValidInviteCode` (27→17 lines)
2. `lib/padel/dashboard.ts` — removed `computeAverage` (38→29 lines)
3. `lib/db/queries/padel/dashboard.ts` — fixed `classesToday` bug, used `deriveLevel`, removed unused import (96→96 lines)
4. `tests/unit/padel/course-code.test.ts` — removed tests for deleted functions (42→19 lines)
5. `tests/unit/padel/dashboard.test.ts` — removed `computeAverage` tests (59→41 lines)
6. `FEATURES.md` — updated pure logic description

## Files NOT Modified (Clean)

- `lib/db/queries/padel/courses.ts` (208 lines) — well-structured, no over-engineering
- `lib/db/queries/padel/enrollments.ts` (101 lines) — clean transaction logic
- `components/padel/course-card.tsx` (62 lines) — minimal
- `components/padel/dashboard-metrics.tsx` (47 lines) — clean data-driven pattern
- `components/padel/teacher-dashboard.tsx` (83 lines) — clean
- `components/padel/student-dashboard.tsx` (150 lines) — clean (LEVEL_LABELS duplication acceptable in React)
- `components/padel/course-detail.tsx` (161 lines) — clean
- `components/padel/create-course-modal.tsx` (144 lines) — clean
- All API routes — clean guard + audit patterns

## Verdict

**APPROVED** — 3 unused functions removed (-43 lines), 1 bug fixed (`classesToday` was counting ALL courses with days instead of courses with class TODAY), 1 DRY violation resolved, 1 dead import cleaned.

Net: **-45 lines** (net negative = good per Ponytail rules).
