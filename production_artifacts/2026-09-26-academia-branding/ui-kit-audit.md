# UI Kit Audit — SPEC-EPIC-01 Academia & Branding

> change_id: spec-epic-01-academia-branding | fecha: 2026-09-26 | autor: @ui-designer

## 1. Inventario del UI kit

### Primitivos shadcn/ui (`components/ui/`)
`button`, `card`, `dialog`, `alert-dialog`, `input`, `label`, `textarea`, `select`, `tabs`, `badge`, `table`, `switch`, `separator`, `dropdown-menu`, `tooltip`, `popover`, `accordion`, `form`, `section`, `aspect-ratio`, `carousel`, `navigation-menu`.

### Componentes de dominio padel (`components/padel/`)
| Componente | Patrón que aporta | Reutilizable para Academia |
|---|---|---|
| `rubric-library.tsx` | Lista + Tabs de filtro (all/draft/active/archived) + loading + error + EmptyState + grid de cards | **Sí** — base de la librería de rúbricas institucionales (añadir filtro scope) |
| `rubric-card.tsx` | Card con Badge status + Badge categoría + acciones editar/archivar | **Sí** — card de rúbrica institucional (ocultar "Editar" para COACH) |
| `rubric-editor.tsx` | Editor de estructura (criterios/niveles/descriptores) | **Sí** — reutilizado tal cual para crear rúbrica institucional (OWNER/ADMIN) |
| `rubric-viewer.tsx` | Vista read-only de evaluación publicada (alumno) | **Sí** — patrón de detalle read-only; base para preview con branding |
| `course-detail.tsx` | Detalle con Tabs (Alumnos/Rúbricas) + lista Card divide-y + remover + AlertDialog archivar + modales | **Sí** — patrón principal del detalle de academia (Miembros/Branding/Rúbricas) |
| `create-course-modal.tsx` | Modal Dialog de creación + toast + reset de form | **Sí** — base para modal "Crear academia" e "Invitar miembro" |
| `add-student-modal.tsx` | Modal de búsqueda + agregar (G12) | **Parcial** — patrón de búsqueda; invitación es por email, no por búsqueda |
| `assign-rubric-modal.tsx` | Modal de asignación de rúbrica a curso | **Sí** — asignar rúbrica institucional a curso |
| `course-card.tsx` | Card de entidad con acciones | **Sí** — card de academia en listado |
| `empty-state.tsx` | Estado vacío reutilizable | **Sí** — todos los listados |
| `scoring-canvas.tsx` | Canvas de evaluación (P09) | **Parcial** — el preview con branding envuelve el detalle, no el canvas |
| `evaluation-card.tsx` | Card de evaluación (alumno) | **Sí** — añadir botón "Exportar PDF" en detalle |
| `history-list.tsx` | Lista con filtros | No crítico |
| `dashboard-metrics.tsx` | Cards de métricas | **Sí** — métricas de academia si se agregan |
| `bottom-nav.tsx` | Navegación móvil | **Sí** — añadir entrada "Academias" si aplica |
| `profile-form.tsx` | Form de settings | **Sí** — patrón de form de branding (color picker + logo) |

### Componentes admin (`components/admin/`)
| Componente | Patrón | Reutilizable |
|---|---|---|
| `marketing/settings-form.tsx` | Form de branding whitelabel (logo + colores del sitio público) | **Sí** — referencia directa para form de branding de academia |
| `users/user-list.tsx` | Tabla de usuarios con acciones | **Parcial** — lista de miembros podría usar Table en desktop |
| `users/create-user-form.tsx` | Form de creación de usuario | **Parcial** — invitación por email comparte validación de email |
| `marketing/page-list.tsx` / `blog-list.tsx` | Listados admin | No crítico |

## 2. Design tokens disponibles (`app/globals.css`)

- `--primary` (verde institucional oklch), `--primary-dark`, `--primary-foreground`, `--ring`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--card`, `--chart-1..5`.
- **No existe token por-tenant.** El `primaryColor` de academia (HEX del usuario) debe aplicarse como **override de CSS variable en línea** (`style={{ "--brand": hex }}`) y consumirse vía `bg-[var(--brand)]`/`text-[var(--brand)]`, nunca como clase hardcodeada. Verificación de contraste WCAG AA requerida antes de aceptar el HEX (ej. texto sobre color de academia).
- **Charts**: `recharts@2.15.4` **ya es dependencia** → el radar de 6 dimensiones en preview web usa `RadarChart` de recharts (sin dependencia nueva). El PDF (server-side) necesitará SVG manual o `@react-pdf/renderer` — decisión de @architect, fuera del alcance UI.

## 3. Mapa de reutilización por pantalla

| Pantalla | Componentes a reutilizar | Componentes nuevos necesarios |
|---|---|---|
| Lista de academias | `course-card` (patrón), `empty-state`, `Button`, `Card` | `academy-card.tsx` (variante con logo+color) |
| Crear academia | `create-course-modal` (patrón Dialog), `Input`, `Label`, `Button` | `create-academy-modal.tsx` (slug + color picker HEX) |
| Detalle academia (tabs) | `course-detail` (patrón Tabs), `empty-state`, `AlertDialog`, `Badge` | `academy-detail.tsx` + `branding-form.tsx` + `members-list.tsx` |
| Invitar miembro | `add-student-modal` (patrón), `Input` email | `invite-member-modal.tsx` (email + rol) |
| Rúbricas institucionales | `rubric-library` (filtro scope), `rubric-card` (sin editar para COACH), `rubric-editor`, `rubric-viewer` | `institutional-rubric-badge.tsx` (scope) — opcional |
| Preview evaluación branding | `rubric-viewer`, `evaluation-card`, `Badge` | `academy-brand-header.tsx` (logo+color) + `radar-chart.tsx` (recharts) |
| Exportar PDF | `Button` en detalle de evaluación | Botón en `evaluation-card`/detalle (sin componente nuevo) |

**Conclusión**: >80% de las pantallas se cubren con componentes existentes. Solo son genuinamente nuevos: `academy-card`, `create-academy-modal`, `academy-detail` (tabs), `branding-form`, `members-list`, `invite-member-modal`, `academy-brand-header`, `radar-chart`. Ninguno es un primitivo nuevo — todos son composiciones de `components/ui/` + patrones `components/padel/`.