import { validateAdmin } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { ScoringCanvas } from "@/components/padel/scoring-canvas"

/** P09 — Evaluar alumno (resume borrador, coach/ADMIN). */
export default async function EvaluarResumePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await validateAdmin()
  const { id } = await params

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-4xl">
        <ScoringCanvas evaluationId={id} />
      </div>
    </Section>
  )
}