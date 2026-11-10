import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Section } from "@/components/ui/section"
import { DiagnosticsPanel } from "@/components/torneos/diagnostics-panel"
import { validateAdmin } from "@/lib/auth/admin-guard"
import { getTournamentDetail } from "@/lib/db/queries/torneos"
import { getActiveRun, getCurrentRun, getRun } from "@/lib/db/queries/torneos/runs"
import type { TournamentRunView } from "@/hooks/use-tournament-run"

const STATUS_META = {
  draft: { label: "Borrador", variant: "outline" as const },
  agenda_draft: { label: "Agenda generada", variant: "default" as const },
  archived: { label: "Archivado", variant: "secondary" as const },
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-ES")
}

type Tramo = { key: string; label: string; blocks: number; capacity: number; from: string; to: string }

/** Bloques consecutivos del mismo día·fase (resumen de la instancia). */
function summarizeBlocks(blocks: readonly { dayLabel: string; startTime: string; phase: string; capacity: number }[]): Tramo[] {
  const tramos: Tramo[] = []
  for (const block of blocks) {
    const key = `${block.dayLabel}|${block.phase}`
    const last = tramos[tramos.length - 1]
    if (last?.key === key) {
      last.blocks += 1
      last.capacity += block.capacity
      last.to = block.startTime
    } else {
      tramos.push({
        key,
        label: `${block.dayLabel} · ${block.phase}`,
        blocks: 1,
        capacity: block.capacity,
        from: block.startTime,
        to: block.startTime,
      })
    }
  }
  return tramos
}

/**
 * /torneos/[id] — detalle del torneo (F4b). Guard server-side `validateAdmin`;
 * `getTournamentDetail` filtra por owner ⇒ torneo ajeno o inexistente = 404.
 * La generación de agenda y el polling viven en el island client.
 */
export default async function TorneoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await validateAdmin()
  const { id } = await params
  const ownerId = session.user.id as string

  const detail = await getTournamentDetail(id, ownerId)
  if (!detail) notFound()

  const [activeRun, currentRun] = await Promise.all([getActiveRun(id), getCurrentRun(id)])
  const runId = activeRun?.runId ?? currentRun?.runId ?? null
  const initialRun = runId
    ? ((await getRun(runId, { tournamentId: id, includeSlots: true })) as TournamentRunView | null)
    : null

  const { tournament, counts } = detail
  const status = STATUS_META[tournament.status]
  const tramos = summarizeBlocks(detail.blocks)

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <Link href="/torneos" className="text-sm text-muted-foreground hover:underline">
            ← Torneos
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{tournament.name}</h1>
              <p className="text-sm text-muted-foreground">
                {formatDate(tournament.startDate)} — {formatDate(tournament.endDate)} ·{" "}
                {tournament.courts} canchas · {tournament.blockMinutes} min por bloque
              </p>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </header>

        <section aria-labelledby="instancia-titulo" className="space-y-3">
          <h2 id="instancia-titulo" className="text-lg font-semibold">
            Instancia
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Categorías", counts.categories],
              ["Grupos", counts.groups],
              ["Parejas", counts.teams],
              ["Bloques", counts.blocks],
              ["Partidos", counts.matches],
              ["Previa", counts.matchesPrevia],
              ["Cuadro", counts.matchesFinal],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            {tramos.map((tramo) => (
              <li key={tramo.key}>
                {tramo.label}: {tramo.blocks} bloques ({tramo.from}–{tramo.to}) · {tramo.capacity} casillas
              </li>
            ))}
          </ul>
        </section>

        <DiagnosticsPanel
          tournamentId={id}
          tournamentStatus={tournament.status}
          courts={tournament.courts}
          blocks={detail.blocks}
          initialRun={initialRun}
        />
      </div>
    </Section>
  )
}
