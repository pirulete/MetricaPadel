import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { validateAdmin } from "@/lib/auth/admin-guard"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/ui/section"
import { TransitionLibraryView } from "@/components/padel/transition-editor/transition-library-view"

/** Lista de transiciones del coach (ADMIN/SUPER_ADMIN + ACTIVE). */
export default async function TransicionesPage() {
  await validateAdmin()

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-3xl space-y-3">
        <Button asChild variant="ghost" size="sm" className="h-11">
          <Link href="/dashboard">
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
        </Button>
        <TransitionLibraryView />
      </div>
    </Section>
  )
}
