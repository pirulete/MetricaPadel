# Acceptance Criteria — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: `etapa2-3-onboarding-dashboard`
> release: v0.2
> date: 2026-09-21
> Fuente: `feature-spec.md` (AC Etapa 2 ×8, Etapa 3 ×8) + edge cases.

## Etapa 2 — Onboarding y Cursos

| # | Criterio | Verificación | Estado |
|---|----------|--------------|--------|
| AC-E2-1 | Registro (SCR-02): visitante se registra con email+password+nombre; selector coach/player se muestra pero backend crea siempre USER/TEMPORARY (nunca ADMIN); email duplicado → 400; rate limit aplica | Unit validations + API happy-path + guard + E2E onboarding | ✅ |
| AC-E2-2 | Login (SCR-03): usuario verificado puede loguearse; credenciales inválidas → 401; LOCKED bloqueado; link a registro | API happy-path + guard + E2E onboarding | ✅ |
| AC-E2-3 | Crear curso (P06): ADMIN crea curso con nombre/nivel/horario/días + código `PAD-XXXX` automático (UNIQUE); código visible con botón copiar | Unit course-code + API happy-path + E2E course-flow | ✅ |
| AC-E2-4 | Lista cursos (P05): ADMIN ve solo sus cursos (cards nº alumnos, horario, badge código); empty state; CTA crear | API happy-path + ownership IDOR 404 + E2E course-flow | ✅ |
| AC-E2-5 | Detalle curso (P07): tabs Alumnos + Rúbricas asignadas; copia código; curso ajeno → 404 | API happy-path + guard | ✅ |
| AC-E2-6 | Unirse con código (A02): USER se une a curso activo → 201; código inválido → 404; ya inscrito → 409; archivado → 404; coach a su propio curso → 400 | API join-happy (201/404/409/400) + E2E course-flow | ✅ |
| AC-E2-7 | Guards y ownership: sin sesión → 401 en todos los endpoints de cursos; USER en endpoints coach → 403; ADMIN en endpoints alumno → 403 | API courses-guard | ✅ |
| AC-E2-8 | API docs: todos los endpoints nuevos en `lib/api-docs/spec.ts` | Gate `--api-docs` (paths/schemas/tags) | ✅ |

## Etapa 3 — Dashboard y Management

| # | Criterio | Verificación | Estado |
|---|----------|--------------|--------|
| AC-E3-1 | Home Profesor (P01): ADMIN ve métricas reales (alumnos, evaluaciones, promedio) de DB, CTA "Evaluar ahora", lista "Mis cursos", empty state | API dashboard-happy + E2E dashboard | ✅ |
| AC-E3-2 | Home Alumno (A01): USER ve saludo, CTA unirse a curso, notificaciones recientes, "Mis cursos"; empty states | API dashboard-happy + E2E dashboard | ✅ |
| AC-E3-3 | Asignar rúbrica (P08): ADMIN elige rúbrica activa + alumnos inscritos y asigna (persiste `course_rubrics`); curso sin alumnos → empty state; rúbrica ya asignada → 409 | Unit query + API courses-happy (assign + 409) + E2E course-flow | ✅ |
| AC-E3-4 | Historial (P10): ADMIN ve sus evaluaciones (alumno, rúbrica, curso, fecha, score, nivel) con filtros; empty state; solo propias (IDOR → 404) | API history-happy (filtros + IDOR) + E2E dashboard | ✅ |
| AC-E3-5 | Métricas correctas: promedio = AVG(totalScore/maxScore) publicadas del coach; alumnos = COUNT enrollments; evaluaciones = COUNT propias | Unit dashboard.test + API dashboard-happy | ✅ |
| AC-E3-6 | Guards y ownership: sin sesión → 401; USER en dashboard/historial coach → 403; ADMIN en dashboard alumno → 403 | API courses-guard | ✅ |
| AC-E3-7 | API docs: endpoints nuevos en `lib/api-docs/spec.ts` | Gate `--api-docs` | ✅ |
| AC-E3-8 | Calidad global: `tsc --noEmit` 0 errores, ESLint 0 errores, build exitoso, cobertura sin regresión >3% | Gates `--typecheck --lint --build --coverage` | ✅ |

## Edge Cases Validados

| Edge case | Resultado esperado | Estado |
|-----------|--------------------|--------|
| Código invite duplicado al generar | Retry ≤5 o 500 controlado | ✅ (unit course-code) |
| Código invite mayúsculas/minúsculas | Lookup case-insensitive (`upper()`) | ✅ (unit + join-happy) |
| Curso sin alumnos al asignar rúbrica | Empty state P08, botón deshabilitado | ✅ (UI + API) |
| Alumno ya inscrito intenta unirse | 409 con mensaje claro | ✅ (join-happy) |
| Coach intenta unirse a su propio curso | 400 | ✅ (join-happy) |
| Curso archivado | No aparece en activos ni acepta joins; historial intacto | ✅ (courses-happy DELETE archive) |
| Coach sin cursos | Empty state P01/P05 | ✅ (UI) |
| Alumno sin cursos | Empty state A01 | ✅ (UI) |
| Coach sin evaluaciones | Empty state P10 | ✅ (UI) |
| Promedio sin evaluaciones publicadas | 0 o "—" (sin división por cero) | ✅ (unit dashboard) |
| Registro email duplicado | 400 | ✅ (register route + admin-users-happy) |
| Usuario TEMPORARY intenta operar | Flujo verificación existente (no bypass) | ✅ (guards) |
| Nivel de curso inválido | 400 (enum cerrado) | ✅ (unit validations) |
| Días de clase vacíos | Permitido (decisión @architect) | ✅ (schema) |
| Asignar rúbrica archivada | 400 (solo active) | ✅ (validations) |
| Asignar rúbrica de otro coach | 404 (ownership) | ✅ (guard.spec IDOR) |

## Criterios Adicionales de Aceptación (QA)

1. **Registro no auto-ADMIN (D6)**: enviar `role: "coach"` en register → usuario creado como USER/TEMPORARY; verificado en API + unit. ✅
2. **Anti-IDOR consistente**: recurso ajeno devuelve 404 (no 403) en courses, rubrics, history. ✅
3. **Auditoría en mutaciones**: crear/editar/archivar curso, join y asignar rúbrica registran `audit_logs`. ✅ (security-checklist)
4. **Migración verificada**: `0005_goofy_charles_xavier.sql` generada vía `db:generate`; columnas verificadas post-migración. ✅ (migration-notes)
5. **E2E por feature**: onboarding, course-flow y dashboard tienen spec E2E (auth-guard + render + API guards). ✅

## Conclusión

**16/16 acceptance criteria cumplidos** + 16 edge cases validados + 5 criterios QA adicionales. Release APROBADO.