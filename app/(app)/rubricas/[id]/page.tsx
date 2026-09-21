import { validateAdmin } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { RubricEditor } from "@/components/padel/rubric-editor"

/** P03 — Editar rúbrica (coach/ADMIN). */
export default async function EditarRubricaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await validateAdmin()
  const { id } = await params

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <RubricEditor rubricId={id} />
      </div>
    </Section>
  )
}