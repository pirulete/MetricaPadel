import type { z } from "zod"

import { Section, SectionHeader } from "@/components/ui/section"
import { cn } from "@/lib/utils"
import type { statsSchema } from "@/lib/marketing/schemas"
import { EmptyState } from "@/components/marketing/block-states"

type StatsConfig = z.infer<typeof statsSchema>

export function StatsBlock({ config, className }: { config: StatsConfig; className?: string }) {
  return (
    <Section className={cn("bg-muted/40", className)}>
      <SectionHeader title={config.title || "Métricas"} centered />
      {config.items.length === 0 ? (
        <EmptyState title="Sin métricas" hint="Agrega valores y etiquetas en el editor." />
      ) : (
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {config.items.map((item) => (
            <div
              key={item.label}
              className="flex flex-col rounded-xl border border-border bg-card p-6 text-center"
            >
              <dd className="order-1 text-3xl font-bold text-primary">{item.value}</dd>
              <dt className="order-2 text-sm text-muted-foreground">{item.label}</dt>
            </div>
          ))}
        </dl>
      )}
    </Section>
  )
}
