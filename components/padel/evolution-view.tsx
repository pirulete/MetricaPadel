"use client"

import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/padel/empty-state"
import type { Trend } from "@/lib/padel/evolution"

export type EvolutionItem = {
  id: string
  rubricId: string
  rubricTitle: string
  category: string
  version: number | null
  totalScore: number | null
  maxScore: number | null
  publishedAt: string | null
  readAt: string | null
}

export type EvolutionGroup = {
  category: string
  trend: Trend
  items: EvolutionItem[]
}

const CATEGORY_LABELS: Record<string, string> = {
  reglas: "Reglas",
  tecnica_basica: "Técnica Básica",
  tecnica_especifica: "Técnica Específica",
  tactica: "Táctica",
  fisica: "Física",
  actitud_equipo: "Actitud y Trabajo en Equipo",
}

const TREND_META: Record<Trend, { icon: typeof ArrowUpIcon; label: string; className: string }> = {
  up: { icon: ArrowUpIcon, label: "Mejorando", className: "text-emerald-600" },
  down: { icon: ArrowDownIcon, label: "En descenso", className: "text-destructive" },
  stable: { icon: MinusIcon, label: "Estable", className: "text-muted-foreground" },
}

/** Vista de evolución del alumno (G7): progreso por categoría con tendencia. */
export function EvolutionView({ evolution }: { evolution: EvolutionGroup[] }) {
  if (evolution.length === 0) {
    return (
      <EmptyState
        title="Sin datos de evolución todavía"
        description="Cuando tu coach publique evaluaciones, verás aquí tu progreso por categoría."
      />
    )
  }

  return (
    <div className="grid gap-4">
      {evolution.map((group) => {
        const meta = TREND_META[group.trend]
        const TrendIcon = meta.icon
        const latest = group.items[group.items.length - 1]
        const previous = group.items.length > 1 ? group.items[group.items.length - 2] : null

        return (
          <Card key={group.category}>
            <CardHeader className="gap-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {CATEGORY_LABELS[group.category] ?? group.category}
                </CardTitle>
                <Badge variant="outline" className={`gap-1 ${meta.className}`}>
                  <TrendIcon className="size-3.5" aria-hidden />
                  {meta.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {group.items.length} {group.items.length === 1 ? "evaluación" : "evaluaciones"}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Última evaluación</p>
                  <p className="text-lg font-bold">
                    {latest.totalScore ?? "—"}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {latest.maxScore ?? "—"}
                    </span>
                  </p>
                </div>
                {previous && (
                  <div className="text-right text-sm">
                    <p className="text-xs text-muted-foreground">Anterior</p>
                    <p className="font-medium">
                      {previous.totalScore ?? "—"}
                      <span className="text-muted-foreground"> / {previous.maxScore ?? "—"}</span>
                    </p>
                  </div>
                )}
              </div>

              <ol className="divide-y divide-border">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{item.rubricTitle}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {item.version && item.version > 1 && (
                        <Badge variant="secondary" className="text-[10px]">v{item.version}</Badge>
                      )}
                      <span>
                        {item.totalScore ?? "—"}
                        <span className="text-muted-foreground"> / {item.maxScore ?? "—"}</span>
                      </span>
                      <span className="text-xs">
                        {item.publishedAt
                          ? new Date(item.publishedAt).toLocaleDateString("es-ES")
                          : "—"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}