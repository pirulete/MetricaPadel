"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArchiveIcon, PaletteIcon, UsersIcon, BookOpenIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AcademyForm } from "@/components/padel/academy-form"
import { LogoUpload } from "@/components/padel/logo-upload"
import { MembersList } from "@/components/padel/members-list"
import { AcademyRubricsTab } from "@/components/padel/academy-rubrics-tab"
import type { AcademyDetail, AcademyMember, AcademyRubricListItem } from "@/hooks/use-academies"

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  COACH: "Profesor",
}

/**
 * Detalle de academia con tabs Branding / Miembros / Rúbricas
 * (SPEC-EPIC-01 Fase E). Carga academia + members + rubrics institucionales.
 */
export function AcademyDetail({ academyId }: { academyId: string }) {
  const router = useRouter()
  const [academy, setAcademy] = React.useState<AcademyDetail | null>(null)
  const [myRole, setMyRole] = React.useState<string | null>(null)
  const [members, setMembers] = React.useState<AcademyMember[]>([])
  const [rubrics, setRubrics] = React.useState<AcademyRubricListItem[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try {
      const [academyRes, membersRes, rubricsRes] = await Promise.all([
        fetch(`/api/academies/${academyId}`, { cache: "no-store" }),
        fetch(`/api/academies/${academyId}/members`, { cache: "no-store" }),
        fetch(`/api/academies/${academyId}/rubrics`, { cache: "no-store" }),
      ])
      const [academyData, membersData, rubricsData] = await Promise.all([
        academyRes.json(),
        membersRes.json(),
        rubricsRes.json(),
      ])
      if (!academyRes.ok) {
        toast.error(academyData.error ?? "Error al cargar la academia")
        return
      }
      setAcademy(academyData.academy)
      setMyRole(academyData.myRole ?? null)
      setMembers(membersRes.ok ? (membersData.members ?? []) : [])
      setRubrics(rubricsRes.ok ? (rubricsData.rubrics ?? []) : [])
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
    }
  }, [academyId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const canManage = myRole === "OWNER" || myRole === "ADMIN"
  const isOwner = myRole === "OWNER"

  const handleArchive = async () => {
    try {
      const res = await fetch(`/api/academies/${academyId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo archivar la academia")
        return
      }
      toast.success("Academia archivada")
      router.push("/academias")
    } catch {
      toast.error("Error de conexión")
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando academia…</p>
  }

  if (!academy) {
    return <p className="text-sm text-muted-foreground">Academia no encontrada.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {academy.logoUrl ? (
            <img
              src={academy.logoUrl}
              alt={`Logo de ${academy.name}`}
              className="size-14 rounded-full border border-border object-cover"
            />
          ) : (
            <span
              className="flex size-14 items-center justify-center rounded-full text-xl font-bold text-white"
              style={{ backgroundColor: academy.primaryColor }}
              aria-hidden
            >
              {academy.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold">{academy.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{ROLE_LABELS[myRole ?? ""] ?? "Miembro"}</Badge>
              <span className="font-mono text-xs text-muted-foreground">/{academy.slug}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && <AcademyForm academy={academy} onSaved={() => void load()} />}
          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-muted-foreground">
                  <ArchiveIcon className="size-4" />
                  Archivar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Archivar esta academia?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La academia se archivará y dejará de ser visible. Las rúbricas institucionales y evaluaciones se conservan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchive}>Archivar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding">
            <PaletteIcon className="mr-1.5 size-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="members">
            <UsersIcon className="mr-1.5 size-4" />
            Miembros
          </TabsTrigger>
          <TabsTrigger value="rubrics">
            <BookOpenIcon className="mr-1.5 size-4" />
            Rúbricas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="mt-4 space-y-6">
          {canManage && <LogoUpload academy={academy} onUploaded={setAcademy} />}
          <div className="rounded-xl border border-border p-4">
            <p className="mb-1 text-sm font-medium">Color institucional</p>
            <div className="flex items-center gap-2">
              <span
                className="size-6 rounded-full border border-border"
                style={{ backgroundColor: academy.primaryColor }}
                aria-hidden
              />
              <span className="font-mono text-sm">{academy.primaryColor}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              El color y el logo se usan en los informes PDF de evaluaciones de esta academia.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MembersList
            academyId={academyId}
            members={members}
            canManage={canManage}
            onRemoved={() => void load()}
          />
        </TabsContent>

        <TabsContent value="rubrics" className="mt-4">
          <AcademyRubricsTab
            academyId={academyId}
            rubrics={rubrics}
            canManage={canManage}
            onCreated={() => void load()}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}