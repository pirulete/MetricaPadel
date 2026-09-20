import Link from "next/link"
import type { z } from "zod"

import { Section, SectionHeader } from "@/components/ui/section"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { pricingSchema } from "@/lib/marketing/schemas"
import { EmptyState } from "@/components/marketing/block-states"

type PricingConfig = z.infer<typeof pricingSchema>

export function PricingBlock({ config, className }: { config: PricingConfig; className?: string }) {
  return (
    <Section className={cn("bg-muted/40", className)}>
      <SectionHeader title={config.title} subtitle={config.subtitle} centered />
      {config.plans.length === 0 ? (
        <EmptyState title="Sin planes" hint="Configura los planes de pricing en el editor." />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {config.plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn("relative gap-4", plan.highlighted && "border-primary ring-1 ring-primary")}
            >
              {plan.highlighted && <Badge className="absolute right-4 top-4">Recomendado</Badge>}
              <CardHeader className="gap-1">
                <CardTitle>{plan.name}</CardTitle>
                <p className="text-3xl font-bold text-foreground">
                  {plan.price}
                  {plan.period && (
                    <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
                  )}
                </p>
                {plan.description && <CardDescription>{plan.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                {plan.features.length > 0 && (
                  <ul className="space-y-2 text-sm text-foreground">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <span aria-hidden className="text-primary">
                          ✓
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
              <CardFooter>
                {plan.ctaLabel && (
                  <Button asChild className="w-full" variant={plan.highlighted ? "default" : "outline"}>
                    <Link href={plan.ctaHref || "#"}>{plan.ctaLabel}</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </Section>
  )
}
