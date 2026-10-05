"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { parseAdminError } from "@/hooks/use-admin-fetch"
import type { AdminAcademyRow } from "./academy-admin-table"

type MemberRow = {
  userId: string
  role: string
  status: string
  firstName: string | null
  lastName: string | null
  email: string
}

const ROLES = ["ADMIN", "COACH", "OWNER"] as const

export function RoleAssignModal({
  academy,
  open,
  onOpenChange,
  onSaved,
}: {
  academy: AdminAcademyRow
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved?: () => void
}) {
  const [members, setMembers] = React.useState<MemberRow[]>([])
  const [loadingMembers, setLoadingMembers] = React.useState(true)
  const [userId, setUserId] = React.useState("")
  const [role, setRole] = React.useState<(typeof ROLES)[number]>("COACH")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoadingMembers(true)
      try {
        const res = await fetch(`/api/academies/${academy.id}/members`, { cache: "no-store" })
        if (!res.ok) throw new Error(await parseAdminError(res))
        const data = await res.json()
        if (!cancelled) {
          const active = (data.members ?? data.academyMembers ?? []) as MemberRow[]
          setMembers(active.filter((m) => m.status === "active"))
          setUserId("")
          setRole("COACH")
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "No se pudieron cargar miembros")
      } finally {
        if (!cancelled) setLoadingMembers(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, academy.id])

  const handleAssign = async () => {
    if (!userId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/academies/${academy.id}/members/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error(await parseAdminError(res))
      toast.success(`Rol ${role} asignado`)
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo asignar el rol")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar rol — {academy.name}</DialogTitle>
          <DialogDescription>
            OWNER solo puede asignarlo SUPER_ADMIN. Academy ADMIN puede asignar ADMIN/COACH.
          </DialogDescription>
        </DialogHeader>
        {loadingMembers ? (
          <p className="text-sm text-muted-foreground">Cargando miembros…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin miembros activos.</p>
        ) : (
          <div className="space-y-4">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar miembro" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email} ({m.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
              <SelectTrigger>
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!userId || busy} onClick={() => void handleAssign()}>
            {busy ? "Asignando…" : "Asignar rol"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
