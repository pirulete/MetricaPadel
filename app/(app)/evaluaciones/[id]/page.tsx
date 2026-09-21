"use client"

import * as React from "react"
import { Section } from "@/components/ui/section"
import { RubricViewer } from "@/components/padel/rubric-viewer"

/** A03 — Detalle de evaluación publicada del alumno (protegida por layout validateUser). */
export default function EvaluacionDetallePage({
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
      <div className="mx-auto max-w-3xl">
        {id ? <RubricViewer evaluationId={id} /> : <p className="text-sm text-muted-foreground">Cargando…</p>}
      </div>
    </Section>
  )
}