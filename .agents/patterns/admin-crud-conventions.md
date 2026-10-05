# Admin CRUD Conventions — Padrón de referencia para @admin-engineer

> Propósito: acotar el comportamiento del agente (prevención de loops / sobre-exploración).
> Referencia obligatoria al implementar tablas, modales y acciones en `/admin`.

## Página admin (server component)

```tsx
import { validateSuperAdmin } from "@/lib/auth/admin-guard";

export default async function AdminXPage() {
  await validateSuperAdmin(); // o validateAdmin según alcance
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <XClient /> {/* "use client" wrapper con data fetching */}
    </main>
  );
}
```

Patrón real: `app/admin/admins/page.tsx`, `app/admin/platform/page.tsx`.

## Tabla client (patrón `user-list.tsx`)

- `"use client"` + `useState`/`useEffect` con `cancelled` flag
- `fetch(url, { cache: "no-store" })` → `parseAdminError(res)` de `@/hooks/use-admin-fetch`
- Estados: `loading` (texto "Cargando…"), `error` (toast Sonner), empty state propio
- Acciones mutantes: `busyId` para deshabilitar botones + `toast.success/error` + `reload`/`tick`
- UI: shadcn `Table`, `Badge` para status/roles, `Button` con iconos lucide
- Debounce 300ms si hay search input

## Modal (patrón `Dialog` shadcn)

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>…</DialogTitle>
      <DialogDescription>…</DialogDescription>
    </DialogHeader>
    {/* form o acciones */}
  </DialogContent>
</Dialog>
```

## Roles en UI

- Detectar SUPER_ADMIN con `isSuperAdminRole(session.user.role)` o endpoint que exponga el role
- **No** confiar solo en client-side: los guards server-side ya existen; la UI solo muestra lo que el rol permite
- OWNER solo es visible/asignable si el caller es SUPER_ADMIN

## Endpoints academy v0.9 (ya implementados — consumir, no re-inventar)

| Acción | Endpoint | Guard server |
|--------|----------|--------------|
| Listar academias globales | `GET /api/admin/academies` | guardSuperAdmin |
| Crear academia | `POST /api/academies` (body: name, slug, primaryColor?, ownerId?) | guardSuperAdmin |
| Editar branding | `PUT /api/academies/[id]` | guardSuperAdminOrAcademyAdmin |
| Archivar | `DELETE /api/academies/[id]` | guardSuperAdminOrAcademyOwner |
| Desarchivar | `POST /api/academies/[id]/restore` | guardSuperAdmin |
| Transferir ownership | `POST /api/academies/[id]/transfer-ownership` `{ targetUserId }` | guardSuperAdmin |
| Asignar rol | `PUT /api/academies/[id]/members/[userId]` `{ role }` | guardSuperAdminOrAcademyAdmin + OWNER solo SA |
| Listar solicitudes | `GET /api/academy-requests?status=&type=` | guardSuperAdmin |
| Aprobar solicitud | `POST /api/academy-requests/[id]/approve` | guardSuperAdmin |
| Rechazar solicitud | `POST /api/academy-requests/[id]/reject` | guardSuperAdmin |

Hooks listos: `use-academy-requests.ts` (list/approve/reject), `use-academies.ts` (transfer/assign/restore — verificar exports).

## Errores

- 401 no autenticado · 403 rol insuficiente · 404 anti-IDOR/recurso inexistente · 409 duplicado · 429 rate limit
- Mostrar `data.error` del body con Sonner; nunca inventar mensajes

## Prohibido (circuit breaker)

- Ejecutar `next build`, `playwright`, `db:migrate`, servers
- Re-leer technical-design completo (usar secciones dadas en el prompt)
- Crear componentes si shadcn/ui ya cubre (Table, Dialog, Button, Badge, Input, Card)
- Agregar dependencias nuevas
