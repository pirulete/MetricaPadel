import { auth } from "@/auth"
import { Section } from "@/components/ui/section"
import { BottomNav } from "@/components/padel/bottom-nav"
import { EvolutionView, type EvolutionGroup } from "@/components/padel/evolution-view"
import { listStudentEvolution } from "@/lib/db/queries/padel"
import { computeTrend, groupByCategory } from "@/lib/padel/evolution"

/**
 * /evolucion — G7 vista de evolución del alumno (server component).
 * El layout (app) ya valida sesión; los datos se scoped al studentId de la
 * sesión (anti-IDOR). Para ADMIN (coach) la lista propia está vacía.
 */
export default async function EvolucionPage() {
  const session = await auth()
  const role = session?.user?.role === "ADMIN" ? "ADMIN" : "USER"
  const items = session?.user?.id
    ? await listStudentEvolution(session.user.id as string)
    : []

  const groups = groupByCategory(items)
  const evolution: EvolutionGroup[] = Object.entries(groups).map(([category, evaluations]) => ({
    category,
    trend: computeTrend(evaluations.map((e) => e.totalScore ?? 0)),
    items: evaluations.map((e) => ({
      id: e.id,
      rubricId: e.rubricId,
      rubricTitle: e.rubricTitle,
      category: e.category,
      version: e.version,
      totalScore: e.totalScore,
      maxScore: e.maxScore,
      publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
      readAt: e.readAt ? e.readAt.toISOString() : null,
    })),
  }))

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-3xl pb-16 md:pb-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Mi evolución</h1>
          <p className="text-sm text-muted-foreground">
            Progreso por categoría según tus evaluaciones publicadas.
          </p>
        </div>
        <EvolutionView evolution={evolution} />
      </div>
      <BottomNav role={role} />
    </Section>
  )
}