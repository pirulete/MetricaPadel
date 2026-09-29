import { validateAdmin } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { PairScoringCanvas } from "@/components/padel/pair-scoring-canvas"

/** SPEC-01 — Evaluar en pareja (2v2, coach/ADMIN). Entrada desde el detalle de curso. */
export default async function EvaluarParejaPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>
}) {
  await validateAdmin()
  const { courseId } = await searchParams

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-5xl">
        <PairScoringCanvas courseId={courseId} />
      </div>
    </Section>
  )
}