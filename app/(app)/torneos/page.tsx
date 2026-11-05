import { validateAdmin } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { TournamentImportModal } from "@/components/torneos/tournament-import-modal"
import { TournamentList } from "@/components/torneos/tournament-list"

/**
 * /torneos — lista de torneos del coach (ADMIN/SUPER_ADMIN + ACTIVE).
 * El guard server-side filtra por ownerId; la UI no decide nada de auth.
 */
export default async function TorneosPage() {
  await validateAdmin()

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Torneos</h1>
            <p className="text-sm text-muted-foreground">
              Importa el JSON de un torneo y genera su agenda.
            </p>
          </div>
          <TournamentImportModal />
        </div>
        <TournamentList emptyAction={<TournamentImportModal />} />
      </div>
    </Section>
  )
}
