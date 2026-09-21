import { validateAdmin } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { RubricLibrary } from "@/components/padel/rubric-library"

/** P02 — Biblioteca de rúbricas (coach/ADMIN). */
export default async function RubricasPage() {
  await validateAdmin()

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-5xl">
        <RubricLibrary />
      </div>
    </Section>
  )
}