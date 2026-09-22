# Mockup Phases — Rúbricas de Pádel (MVP)

> status: proposed
> release: v0.1
> date: 2026-09-20
> change_id: rubricas-blueprint
> module: ui
> tags: [ui, mockup, design, mvp]

## 1. Clasificación de valor

| Clase | Pantallas | Por qué |
|-------|-----------|---------|
| **CORE** (loop principal) | P09 Evaluar, P03 Editor Rúbrica, A03 Ver Evaluación, P02 Biblioteca, A01 Home Alumno, P01 Home Profesor | El bucle de valor: el coach crea rúbrica → evalúa → el alumno la ve. Sin esto no hay producto. |
| **PREREQUISITO** | SCR-02 Registro, SCR-03 Login, P05 Cursos, P07 Detalle Curso, A02 Unirse | Sin auth y sin cursos no hay contexto donde evaluar. Desbloquean el CORE. |
| **MANAGEMENT** | P04 Templates, P06 Crear Curso, P08 Asignar Rúbrica, P10 Historial | Aceleran y organizan el uso, pero no son indispensables para el primer loop. |
| **POLISH** | SCR-01 Splash | Diferenciación de marca; no aporta función. Última prioridad. |

## 2. Etapas de maquetación (orden de ejecución)

### Etapa 1 — Core evaluativo (4 pantallas)
- **P09 Evaluar Alumno** (canvas, la más compleja: sticky header con score en vivo, selector de nivel por criterio, comentarios por criterio + global, barra inferior guardar/publicar)
- **P03 Editor Rúbrica** (formulario: título/categoría, niveles horizontales, matriz de descriptores)
- **A03 Detalle Evaluación** (read-only: hero score, comentario profesor, desglose por criterio, marcar leído)
- **P02 Biblioteca Rúbricas** (tabs activas/archivadas, cards, menú contextual)

**Justificación**: son las 4 pantallas con mayor densidad de UI y donde se definen los patrones que el resto reutiliza (selector de nivel, badge de score, cards de rúbrica). Maquetarlas primero fija el design language del producto.

### Etapa 2 — Onboarding y cursos (5 pantallas)
- SCR-02 Registro (selector rol coach/player segmented)
- SCR-03 Login
- P05 Cursos (cards con código invite)
- P07 Detalle Curso (tabs alumnos/rúbricas)
- A02 Unirse con código (modal PAD-XXXX)

**Justificación**: auth + cursos son prerequisito funcional; UI de formularios y modales ya validada en Etapa 1.

### Etapa 3 — Dashboard y management (5 pantallas)
- P01 Home Profesor (métricas + CTA evaluar + bottom nav)
- A01 Home Alumno (CTA unirse + notificaciones + cursos)
- P06 Modal Crear Curso
- P08 Modal Asignar Rúbrica
- P10 Historial

**Justificación**: hubs y modales de gestión; dependen de los patrones de card/modal de Etapas 1-2.

### Etapa 4 — Templates y polish (2 pantallas)
- P04 Templates (3 cards predefinidas)
- SCR-01 Splash

### Etapa 5 — Admin (sin UI visual)
- Endpoints admin (CRUD de templates, gestión de usuarios) — solo API, no mockup.

## 3. UI kit audit (Etapa 1)

| Componente shadcn | Uso en mockup | ¿Nuevo componente? |
|-------------------|---------------|--------------------|
| Button | CTAs, guardar/publicar, menú contextual | No |
| Card + CardHeader/CardContent | Criterios, rúbricas, hero score | No |
| Badge | Score en vivo, estado, nivel | No |
| Tabs | Biblioteca activas/archivadas | No |
| Input / Textarea | Título, comentarios, descriptores | No |
| Label | Campos de formulario | No |
| Select | Categoría | No |
| Separator | División editor | No |

**No se crean componentes nuevos**: el selector de nivel (P09) se resuelve con Button/Badge + estado local; la matriz de descriptores (P03) con grid + Textarea.

## 4. Decisiones de diseño (Etapa 1)

1. **Score en vivo en sticky header (P09)**: el coach ve el total actualizarse al tocar niveles — feedback inmediato, refuerza el loop.
2. **Selector de nivel = cards 4-col con check**: nivel seleccionado en `--primary` (verde pádel `oklch(0.50 0.17 145)`) con check; contraste AA (texto blanco sobre primary).
3. **Matriz de descriptores con scroll horizontal en móvil** (`min-w-[560px]`): en 360px las 4 celdas no caben legibles; scroll preserva la lectura.
4. **A03 muestra 4 criterios** (no 3) para mantener coherencia con el score 13/16 (4×4=16). El "3 criterios" de la spec era ejemplo; la consistencia de datos gana.
5. **Dark mode**: PreviewShell redefine las mismas CSS variables con valores oscuros derivados de la paleta oklch (no se inventan colores nuevos).
6. **Estados**: default + loading (skeleton `animate-pulse`) en las 4 pantallas; empty en P02 (biblioteca vacía) y A03 (sin evaluaciones).

## 5. Responsive

- **360px (mobile-first)**: canvas P09 en columna única, selector 4-col compacto, matriz con scroll horizontal, bottom bar sticky.
- **768px+**: editor P03 en 2 columnas (título/categoría), niveles en 4-col, biblioteca max-w-2xl centrada.

## 6. Archivos

- `components/preview/preview-shell.tsx` — PreviewShell compartido (nav de pantallas + toggle dark/light + toolbar de estado)
- `components/preview/etapa1-core-evaluativo.tsx` — mockup navegable Etapa 1 (P09, P03, A03, P02)
- `production_artifacts/2026-09-20-rubricas-blueprint/mockup-phases.md` — este documento