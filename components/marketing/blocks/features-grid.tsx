import type { z } from "zod"

import { Section, SectionHeader } from "@/components/ui/section"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { featuresGridSchema } from "@/lib/marketing/schemas"
import { EmptyState } from "@/components/marketing/block-states"

type FeaturesGridConfig = z.infer<typeof featuresGridSchema>

export function FeaturesGridBlock({
  config,
  className,
}: {
  config: FeaturesGridConfig
  className?: string
}) {
  return (
    <Section className={className}>
      <SectionHeader title={config.title} subtitle={config.subtitle} centered />
      {config.features.length === 0 ? (
        <EmptyState title="Sin características" hint="Configura el grid de features en el editor." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {config.features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader className="gap-2">
                {feature.icon && (
                  <span aria-hidden className="text-2xl text-primary">
                    {feature.icon}
                  </span>
                )}
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Section>
  )
}
