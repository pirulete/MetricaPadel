import Link from "next/link"
import Image from "next/image"
import type { z } from "zod"

import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { heroSchema } from "@/lib/marketing/schemas"
import { EmptyState } from "@/components/marketing/block-states"

type HeroConfig = z.infer<typeof heroSchema>

export function HeroBlock({ config, className }: { config: HeroConfig; className?: string }) {
  if (!config.title) {
    return (
      <EmptyState
        className={className}
        title="Hero sin configurar"
        hint="Agrega título, subtítulo e imagen en el editor."
      />
    )
  }

  return (
    <div className={cn("grid items-center gap-8 lg:grid-cols-2", className)}>
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
          {config.title}
        </h1>
        {config.subtitle && (
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            {config.subtitle}
          </p>
        )}
        {config.ctas.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {config.ctas.map((cta) => (
              <Button key={cta.label} asChild variant={cta.variant} size="lg">
                <Link href={cta.href}>{cta.label}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
      {config.image && (
        <AspectRatio
          ratio={16 / 9}
          className="relative overflow-hidden rounded-xl border border-border bg-muted/40"
        >
          <Image
            src={config.image}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </AspectRatio>
      )}
    </div>
  )
}
