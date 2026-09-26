"use client"

import * as React from "react"
import { Section } from "@/components/ui/section"
import { AcademyDetail } from "@/components/padel/academy-detail"

/** /academias/[id] — detalle de academia con tabs (SPEC-EPIC-01 Fase E). */
export default function AcademiaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [id, setId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    params.then((p) => {
      if (!cancelled) setId(p.id)
    })
    return () => {
      cancelled = true
    }
  }, [params])

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-4xl">
        {id ? <AcademyDetail academyId={id} /> : <p className="text-sm text-muted-foreground">Cargando…</p>}
      </div>
    </Section>
  )
}