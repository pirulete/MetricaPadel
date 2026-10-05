"use client"

import * as React from "react"
import { toast } from "sonner"
import { Building2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { parseAdminError } from "@/hooks/use-admin-fetch"
import { AcademyCreateModal } from "./academy-create-modal"
import { TransferOwnershipModal } from "./transfer-ownership-modal"
import { RoleAssignModal } from "./role-assign-modal"

export type AdminAcademyRow = {
  id: string
  name: string
  slug: string
  status: "active" | "archived"
  primaryColor: string
  ownerId: string
  createdAt: string
  ownerEmail: string | null
  ownerFirstName: string | null
  ownerLastName: string | null
  memberCount: number
  rubricCount: number
}

function ownerLabel(a: AdminAcademyRow) {
  const name = [a.ownerFirstName, a.ownerLastName].filter(Boolean).join(" ")
  return name || a.ownerEmail || "—"
}

export function AcademyAdminTable() {
  const [rows, setRows] = React.useState<AdminAcademyRow[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [transferTarget, setTransferTarget] = React.useState<AdminAcademyRow | null>(null)
  const [roleTarget, setRoleTarget] = React.useState<AdminAcademyRow | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/admin/academies", { cache: "no-store" })
        if (!res.ok) throw new Error(await parseAdminError(res))
        const data = await res.json()
        if (!cancelled) {
          setRows(data.academies ?? [])
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar academias")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [tick])

  const reload = () => setTick((t) => t + 1)

  const archive = async (row: AdminAcademyRow) => {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/academies/${row.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await parseAdminError(res))
      toast.success(`Academia "${row.name}" archivada`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo archivar")
    } finally {
      setBusyId(null)
    }
  }

  const restore = async (row: AdminAcademyRow) => {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/academies/${row.id}/restore`, { method: "POST" })
      if (!res.ok) throw new Error(await parseAdminError(res))
      toast.success(`Academia "${row.name}" restaurada`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restaurar")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando academias…</p>
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Sin academias registradas.</p>
        <AcademyCreateModal open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AcademyCreateModal open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Miembros</TableHead>
              <TableHead className="text-right">Rúbricas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{row.slug}</TableCell>
                <TableCell>{ownerLabel(row)}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "active" ? "default" : "secondary"}>
                    {row.status === "active" ? "Activa" : "Archivada"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{row.memberCount}</TableCell>
                <TableCell className="text-right">{row.rubricCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRoleTarget(row)}>
                      Roles
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setTransferTarget(row)}>
                      Transferir
                    </Button>
                    {row.status === "active" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === row.id}
                        onClick={() => void archive(row)}
                      >
                        Archivar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={() => void restore(row)}
                      >
                        Restaurar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {transferTarget && (
        <TransferOwnershipModal
          academy={transferTarget}
          open={!!transferTarget}
          onOpenChange={(o) => { if (!o) setTransferTarget(null) }}
          onSaved={reload}
        />
      )}
      {roleTarget && (
        <RoleAssignModal
          academy={roleTarget}
          open={!!roleTarget}
          onOpenChange={(o) => { if (!o) setRoleTarget(null) }}
          onSaved={reload}
        />
      )}
    </div>
  )
}
