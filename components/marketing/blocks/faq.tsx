import type { z } from "zod"

import { Section, SectionHeader } from "@/components/ui/section"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { faqSchema } from "@/lib/marketing/schemas"
import { EmptyState } from "@/components/marketing/block-states"

type FaqConfig = z.infer<typeof faqSchema>

export function FaqBlock({ config, className }: { config: FaqConfig; className?: string }) {
  return (
    <Section className={className}>
      <SectionHeader title={config.title} subtitle={config.subtitle} centered />
      {config.items.length === 0 ? (
        <EmptyState title="Sin preguntas" hint="Configura el FAQ en el editor." />
      ) : (
        <Accordion type="single" collapsible className="mx-auto max-w-3xl">
          {config.items.map((item, index) => (
            <AccordionItem key={item.question} value={`item-${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </Section>
  )
}
