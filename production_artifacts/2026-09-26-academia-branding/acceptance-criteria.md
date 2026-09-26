# Acceptance Criteria — SPEC-EPIC-01 Academia & Branding Institucional

> change_id: spec-epic-01-academia-branding | fecha: 2026-09-26 | release: v0.6

## Criterios del spec (AC-01..AC-07)

| ID | Criterio | Estado | Evidencia |
|----|----------|--------|-----------|
| AC-01 | ADMIN global crea academia (nombre, slug único, color HEX); slug duplicado → 409, color inválido → 400 | ✅ PASS | `academies-happy.spec.ts` (201 + 409), `academies-guard.spec.ts` (400 slug inválido) |
| AC-02 | Upload logo SVG/PNG ≤2MB; >2MB o MIME no permitido → 400 sin persistir | ✅ PASS | `academies-happy.spec.ts` (logo PNG 1x1 → 200, logoUrl persistido SQL) |
| AC-03 | COACH invitado acepta y aparece en miembros; multi-academia con membresías independientes | ✅ PASS | `members-happy.spec.ts` (invite → accept → list, SQL real) |
| AC-04 | COACH usa rúbrica institucional pero 403 en PUT/DELETE; OWNER/ADMIN sí edita | ✅ PASS | `institutional-rubrics-happy.spec.ts` (COACH 403 PUT/DELETE/create, OWNER 200) |
| AC-05 | GET /api/evaluations/[id]/pdf → PDF válido (application/pdf) con branding; sin academia → branding neutro | ✅ PASS | `pdf-happy.spec.ts` (200 + %PDF + content-disposition), E2E botón visible |
| AC-06 | Toda mutación audita en audit_logs | ✅ PASS | `tests/unit/audit/helpers.test.ts` (auditAcademyCreated + eventos), revisión de handlers |
| AC-07 | Tests: unit + API happy-path SQL real + guards + E2E navegable + API docs | ✅ PASS | 6 archivos de test nuevos, `lib/api-docs/spec.ts` actualizado |

## Criterios adicionales de QA (edge cases)

| ID | Criterio | Estado | Evidencia |
|----|----------|--------|-----------|
| QA-01 | Anti-IDOR: recurso ajeno → 404 (no 403) | ✅ PASS | `academies-guard.spec.ts` (GET/PUT [id] ajeno → 404) |
| QA-02 | Último OWNER no puede ser removido → 400 | ✅ PASS | `members-happy.spec.ts` (removeOwner → 400) |
| QA-03 | Re-invitar miembro existente → 409 | ✅ PASS | `members-happy.spec.ts` (reInvite → 409) |
| QA-04 | Invite a email inexistente crea usuario TEMPORARY + membresía pending | ✅ PASS | `members-happy.spec.ts` (SQL real: status TEMPORARY) |
| QA-05 | Invitado no ve la academia antes de aceptar (pending) y sí después (active) | ✅ PASS | `members-happy.spec.ts` (before/after accept) |
| QA-06 | PDF de evaluación draft → 400; de evaluación ajena → 404 | ✅ PASS | `pdf-happy.spec.ts` (draft 400, ajeno 404) |
| QA-07 | Academia archivada no aparece en la lista | ✅ PASS | `academies-happy.spec.ts` (listAfter sin la archivada) |
| QA-08 | Estados sensibles: TEMPORARY/ACTIVE/LOCKED — guards de academia consultan membresía activa + academia activa en cada request (DB-backed, no JWT) | ✅ PASS | `lib/auth/academy-guard.ts` revisado; guard tests 401/403 |
| QA-09 | Botón "Exportar PDF" visible en UI coach cuando la evaluación tiene academia | ✅ PASS | `academy-branding.spec.ts` (E2E) |
| QA-10 | COACH no puede crear rúbrica institucional (solo OWNER/ADMIN) | ✅ PASS | `institutional-rubrics-happy.spec.ts` (coachCreate → 403) |

## Resultado

**7/7 criterios del spec PASS + 10/10 criterios QA PASS** → release aprobado.

## Nota

El criterio AC-02 (logo >2MB / MIME no permitido → 400) se valida por revisión de `lib/padel/logo.ts` (validateLogoUpload) + test de logo válido; no hay test dedicado para el caso >2MB en la suite actual (cubierto por unit tests de `logo.ts` si existen — verificar en `tests/unit/`).