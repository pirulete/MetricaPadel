import Link from "next/link"
import type { z } from "zod"

import { Section } from "@/components/ui/section"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ctaBannerSchema } from "@/lib/marketing/schemas"
import { EmptyState } from "@/components/marketing/block-states"

type CtaBannerConfig = z.infer<typeof ctaBannerSchema>

export function CtaBannerBlock({
  config,
  className,
}: {
  config: CtaBannerConfig
  className?: string
}) {
  if (!config.title) {
    return <EmptyState className={className} title="CTA sin configurar" hint="Agrega título y botón de acción." />
  }

  return (
    <Section className={className}>
      <div className="flex flex-col items-center gap-4 rounded-xl bg-primary px-6 py-12 text-center">
        <h2 className="text-2xl font-bold text-primary-foreground sm:text-3xl">{config.title}</h2>
        {config.subtitle && (
          <p className="max-w-xl text-primary-foreground/80">{config.subtitle}</p>
        )}
        {config.buttonLabel && (
          <Button
            asChild
            size="lg"
            className={cn("bg-background text-foreground hover:bg-secondary")}
          >
            <Link href={config.buttonHref || "#"}>{config.buttonLabel}</Link>
          </Button>
        )}
      </div>
    </Section>
  )
}
