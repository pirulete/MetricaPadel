# Design Approved — Editor de Transiciones (coach)

> change_id: 2026-11-02-coach-transition-editor · date: 2026-11-02 · owner: @ui-designer

## Alcance aprobado

| Decisión | Estado | Fuente |
|---|---|---|
| **Modelo de interacción C**: canvas con selección + toolbar contextual + manija de arco + filmstrip + undo/redo | ✅ Aprobado por el usuario | Instrucción del orquestador (previa al diseño) |
| **Layout**: barra contextual **fija** bajo el canvas + filmstrip colapsable (`C · Editor`) | ⏳ Recomendado por @ui-designer — **requiere visto bueno explícito** | `design-exploration.md` §Recomendación |
| Alternativas A (toolbar flotante) y B (bottom sheet vaul) | 📦 Documentadas y descartadas | `design-exploration.md` |
| Huecos a crear: `EditorStage`, `StepFilmstrip`, `ContextBar`, `pxToCourt`, historial undo/redo | ✅ Aprobado (necesarios, 0 deps nuevas) | `ui-kit-audit.md` §3 |
| Preview reutiliza `CourtStage` | ✅ Aprobado (AC-03) | `feature-spec.md` |

## Pendiente antes de implementar

1. Validar el mockup navegable `/preview/coach-transition-editor` (requiere crear la ruta de 4 líneas; no se creó por límite de alcance).
2. Confirmar variante de **layout** (A / B / C) — la recomendación es **C**.
3. Confirmar que la barra contextual se queda con **iconos** (sin texto) a 375 px; el texto completo sólo aparece en `md+`.

## Condiciones de aprobación (checklist para @qa-release)

- [ ] Canvas completo visible a 375×667 sin scroll horizontal y sin colapsar filmstrip/barra (AC-01).
- [ ] Ningún control por debajo de 44×44 px.
- [ ] `touch-action: none` sólo dentro del canvas (EC-04).
- [ ] Cero hex fuera de `globals.css` + `COURT_COLORS`.
- [ ] Sin `Slider`/`Sheet` nuevos ni dependencias añadidas.
- [ ] Los 6 estados del mockup existen en la implementación real.
- [ ] Mockup borrado al cerrar la implementación.
