"use client"

import * as React from "react"
import { toast } from "sonner"
import { Trash2Icon, UsersIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/padel/empty-state"
import { InviteMemberModal } from "@/components/padel/invite-member-modal"
import type { AcademyMember } from "@/hooks/use-academies"

const ROLE_LABELS: Record<AcademyMember["role"], string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  COACH: "Profesor",
}

const STATUS_LABELS: Record<AcademyMember["status"], string> = {
  pending: "Pendiente",
  active: "Activo",
  removed: "Removido",
}

/**
 * Lista de miembros de la academia (SPEC-EPIC-01 Fase E).
 * GET /api/academies/[id]/members + DELETE /members/[userId] (soft remove).
 */
export function MembersList({
  academyId,
  members,
  canManage,
  onRemoved,
}: {
  academyId: string
  members: AcademyMember[]
  canManage: boolean
  onRemoved?: () => void
}) {
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  const handleRemove = async (member: AcademyMember) => {
    if (!window.confirm(`¿Remover a ${member.firstName ?? ""} ${member.lastName ?? ""} de la academia?`)) return
    setRemovingId(member.userId)
    try {
      const res = await fetch(`/api/academies/${academyId}/members/${member.userId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo remover al miembro")
        return
      }
      toast.success("Miembro removido")
      onRemoved?.()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <InviteMemberModal academyId={academyId} onInvited={onRemoved} />
        </div>
      )}
      {members.length === 0 ? (
        <EmptyState
          title="Sin miembros todavía"
          description="Invita profesores para que se unan a la academia."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="size-4" />
              {members.length} miembros
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">
                    {m.firstName} {m.lastName}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{m.email}</span>
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {ROLE_LABELS[m.role]}
                    </Badge>
                    <Badge variant={m.status === "active" ? "outline" : "secondary"} className="text-[10px]">
                      {STATUS_LABELS[m.status]}
                    </Badge>
                  </div>
                </div>
                {canManage && m.status !== "removed" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleRemove(m)}
                    disabled={removingId === m.userId}
                    aria-label={`Remover a ${m.firstName} ${m.lastName}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}