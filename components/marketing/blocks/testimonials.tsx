import type { z } from "zod"

import { Section, SectionHeader } from "@/components/ui/section"
import { Card, CardContent } from "@/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import type { testimonialsSchema } from "@/lib/marketing/schemas"
import { EmptyState } from "@/components/marketing/block-states"

type TestimonialsConfig = z.infer<typeof testimonialsSchema>

export function TestimonialsBlock({
  config,
  className,
}: {
  config: TestimonialsConfig
  className?: string
}) {
  return (
    <Section className={className}>
      <SectionHeader title={config.title} subtitle={config.subtitle} centered />
      {config.items.length === 0 ? (
        <EmptyState title="Sin testimonios" hint="Agrega citas de clientes en el editor." />
      ) : (
        <Carousel className="mx-auto w-full max-w-4xl" opts={{ align: "start", loop: true }}>
          <CarouselContent className="-ml-2 md:-ml-4">
            {config.items.map((item) => (
              <CarouselItem key={item.author} className="pl-2 md:basis-1/2 md:pl-4 lg:basis-1/3">
                <Card className="h-full gap-4">
                  <CardContent className="space-y-4">
                    <p className="text-foreground">“{item.quote}”</p>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.author}</p>
                      {item.role && <p className="text-xs text-muted-foreground">{item.role}</p>}
                    </div>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      )}
    </Section>
  )
}
