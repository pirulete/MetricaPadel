"use client"

import type { ReactNode } from "react"

import { parseBlockConfig } from "@/lib/marketing/schemas"
import { HeroBlock } from "./blocks/hero"
import { FeaturesGridBlock } from "./blocks/features-grid"
import { PricingBlock } from "./blocks/pricing"
import { TestimonialsBlock } from "./blocks/testimonials"
import { CtaBannerBlock } from "./blocks/cta-banner"
import { FaqBlock } from "./blocks/faq"
import { ContactFormBlock } from "./blocks/contact-form"
import { StatsBlock } from "./blocks/stats"
import { ProductGridBlock } from "./blocks/product-grid"
import { BlogListBlock } from "./blocks/blog-list"

type BlockComponent = (props: { config: never; className?: string }) => ReactNode | Promise<ReactNode>

const BLOCKS: Record<string, BlockComponent> = {
  hero: HeroBlock,
  features_grid: FeaturesGridBlock,
  pricing: PricingBlock,
  testimonials: TestimonialsBlock,
  cta_banner: CtaBannerBlock,
  faq: FaqBlock,
  contact_form: ContactFormBlock,
  stats: StatsBlock,
  product_grid: ProductGridBlock,
  blog_list: BlogListBlock,
}

export function BlockRenderer({
  blockType,
  config,
  showErrors = false,
  className,
}: {
  blockType: string
  config: unknown
  /** En preview admin muestra el error de validación; en público omite el bloque. */
  showErrors?: boolean
  className?: string
}) {
  const parsed = parseBlockConfig(blockType, config)

  if (!parsed.ok) {
    if (!showErrors) return null
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <p className="font-medium">Bloque inválido ({blockType})</p>
        <p className="mt-1 text-xs opacity-80">{parsed.error}</p>
      </div>
    )
  }

  const Component = BLOCKS[blockType]
  if (!Component) return null

  return <Component config={parsed.data as never} className={className} />
}
