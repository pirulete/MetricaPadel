import { validateAdmin } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { EditorScreen } from "@/components/padel/transition-editor/editor-screen"

/** Nueva transición: borrador en memoria, sin fetch previo (coach/ADMIN). */
export default async function NuevaTransicionPage() {
  await validateAdmin()

  return (
    <Section className="py-4 md:py-8">
      <div className="mx-auto max-w-md md:max-w-3xl">
        <EditorScreen />
      </div>
    </Section>
  )
}
