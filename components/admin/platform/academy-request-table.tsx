"use client"

import * as React from "react"
import { toast } from "sonner"
import { Inbox } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useAcademyRequests, type AcademyRequest } from "@/hooks/use-academy-requests"

const statusVariant: Record<AcademyRequest["status"], "default" | "secondary" | "destructive"> = {
  pending: "default",
  approved: "secondary",
  rejected: "destructive",
}

const typeLabel: Record<AcademyRequest["type"], string> = {
  join_academy: "Unirse a academia",
  create_academy: "Crear academia",
}

function requesterLabel(r: AcademyRequest) {
  const name = [r.requesterFirstName, r.requesterLastName].filter(Boolean).join(" ")
  return name || r.requesterEmail || "—"
}

function targetLabel(r: AcademyRequest) {
  if (r.type === "join_academy") return r.academyName || r.academyId || "—"
  const payload = r.payload as { name?: string; slug?: string }
  return [payload?.name, payload?.slug ? `(${payload.slug})` : ""].filter(Boolean).join(" ") || "—"
}

export function AcademyRequestTable() {
  const { requests, loading, error, reload, approve, reject } = useAcademyRequests()
  const [filter, setFilter] = React.useState<"pending" | "all">("pending")
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<AcademyRequest | null>(null)

  React.useEffect(() => {
    void reload(filter === "pending" ? { status: "pending" } : undefined)
  }, [filter, reload])

  const handleApprove = async (r: AcademyRequest) => {
    setBusyId(r.id)
    try {
      const res = await approve(r.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Solicitud aprobada")
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (r: AcademyRequest) => {
    setBusyId(r.id)
    try {
      const res = await reject(r.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Solicitud rechazada")
      setRejectTarget(null)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando solicitudes…</p>
  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filter === "pending" ? "Solo pendientes" : "Todas las solicitudes"}
        </p>
        <Button size="sm" variant="outline" onClick={() => setFilter(filter === "pending" ? "all" : "pending")}>
          {filter === "pending" ? "Ver todas" : "Ver pendientes"}
        </Button>
      </div>
      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Sin solicitudes {filter === "pending" ? "pendientes" : ""}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Solicitante</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Rol pedido</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{requesterLabel(r)}</TableCell>
                  <TableCell>{typeLabel[r.type]}</TableCell>
                  <TableCell>{targetLabel(r)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.requestedRole}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[r.status]}>
                      {r.status === "pending" ? "Pendiente" : r.status === "approved" ? "Aprobada" : "Rechazada"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={busyId === r.id}
                          onClick={() => void handleApprove(r)}
                        >
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === r.id}
                          onClick={() => setRejectTarget(r)}
                        >
                          Rechazar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) setRejectTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>
              Se marcará como rechazada. El solicitante podrá enviar una nueva.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={busyId === rejectTarget?.id}
              onClick={() => { if (rejectTarget) void handleReject(rejectTarget) }}
            >
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
