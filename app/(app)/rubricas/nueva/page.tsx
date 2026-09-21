import { validateAdmin } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { RubricEditor } from "@/components/padel/rubric-editor"

/** P03 — Nueva rúbrica (coach/ADMIN). */
export default async function NuevaRubricaPage() {
  await validateAdmin()

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <RubricEditor />
      </div>
    </Section>
  )
}