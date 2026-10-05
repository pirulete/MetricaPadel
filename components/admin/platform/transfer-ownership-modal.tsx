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

export function TransferOwnershipModal({
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
  const [targetUserId, setTargetUserId] = React.useState("")
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
          setMembers(active.filter((m) => m.status === "active" && m.userId !== academy.ownerId))
          setTargetUserId("")
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "No se pudieron cargar miembros")
      } finally {
        if (!cancelled) setLoadingMembers(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, academy.id, academy.ownerId])

  const handleTransfer = async () => {
    if (!targetUserId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/academies/${academy.id}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      })
      if (!res.ok) throw new Error(await parseAdminError(res))
      toast.success("Ownership transferido. El owner anterior pasó a ADMIN.")
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo transferir el ownership")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir ownership — {academy.name}</DialogTitle>
          <DialogDescription>
            El nuevo owner pasa a OWNER; el owner actual ({academy.ownerEmail}) queda como ADMIN. Solo SUPER_ADMIN puede transferir.
          </DialogDescription>
        </DialogHeader>
        {loadingMembers ? (
          <p className="text-sm text-muted-foreground">Cargando miembros…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin miembros activos elegibles (además del owner actual).</p>
        ) : (
          <Select value={targetUserId} onValueChange={setTargetUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar nuevo owner" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!targetUserId || busy} onClick={() => void handleTransfer()}>
            {busy ? "Transfiriendo…" : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
