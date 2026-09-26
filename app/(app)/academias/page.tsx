"use client"

import * as React from "react"
import { Section, SectionHeader } from "@/components/ui/section"
import { EmptyState } from "@/components/padel/empty-state"
import { AcademyCard } from "@/components/padel/academy-card"
import { AcademyForm } from "@/components/padel/academy-form"
import { BottomNav } from "@/components/padel/bottom-nav"
import { useAcademies } from "@/hooks/use-academies"

/**
 * /academias — lista de academias del usuario (SPEC-EPIC-01 Fase E).
 * GET /api/academies (guardUser): academias donde es miembro activo.
 */
export default function AcademiasPage() {
  const { academies, loading, error, reload } = useAcademies()
  const [role, setRole] = React.useState<"ADMIN" | "USER" | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/teacher", { cache: "no-store" })
        if (res.ok && !cancelled) setRole("ADMIN")
        else if (!cancelled) setRole("USER")
      } catch {
        if (!cancelled) setRole("USER")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-5xl pb-16 md:pb-0">
        <SectionHeader
          title="Academias"
          subtitle="Gestiona tus academias, branding institucional y rúbricas compartidas"
        />
        <div className="mb-6 flex justify-end">
          {role === "ADMIN" && <AcademyForm onSaved={() => void reload()} />}
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando academias…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : academies.length === 0 ? (
          <EmptyState
            title="No estás en ninguna academia"
            description={
              role === "ADMIN"
                ? "Crea tu primera academia para estandarizar rúbricas y emitir informes con tu branding."
                : "Pídele a tu coach una invitación para unirte a su academia."
            }
            action={role === "ADMIN" ? <AcademyForm onSaved={() => void reload()} /> : undefined}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {academies.map((a) => (
              <AcademyCard key={a.id} academy={a} />
            ))}
          </div>
        )}
      </div>
      {role && <BottomNav role={role} />}
    </Section>
  )
}