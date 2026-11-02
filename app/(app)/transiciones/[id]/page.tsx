import { notFound } from "next/navigation"
import { validateAdmin } from "@/lib/auth/admin-guard"
import { getTransitionById } from "@/lib/db/queries/padel"
import { Section } from "@/components/ui/section"
import { EditorScreen } from "@/components/padel/transition-editor/editor-screen"

/** Editar transición existente (coach/ADMIN); ajena o inexistente → 404. */
export default async function EditarTransicionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await validateAdmin()
  const { id } = await params

  const transition = await getTransitionById(session.user.id as string, id)
  if (!transition) notFound()

  return (
    <Section className="py-4 md:py-8">
      <div className="mx-auto max-w-md md:max-w-3xl">
        <EditorScreen
          initial={{
            id: transition.id,
            title: transition.title,
            initialStepIndex: transition.initialStepIndex,
            steps: transition.steps,
          }}
        />
      </div>
    </Section>
  )
}
