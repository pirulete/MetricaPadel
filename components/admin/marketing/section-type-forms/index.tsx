"use client";

/**
 * Registry de forms por block type + config por defecto para secciones nuevas.
 * La validación final la hace la API con los schemas de lib/marketing/schemas.
 */
import { BLOCK_TYPE_REGISTRY, type BlockType } from "@/lib/marketing/schemas";
import type { BlockFormComponent } from "./types";
import { HeroForm } from "./hero-form";
import { FeaturesGridForm } from "./features-grid-form";
import { PricingForm } from "./pricing-form";
import { TestimonialsForm } from "./testimonials-form";
import { CtaBannerForm } from "./cta-banner-form";
import { FaqForm } from "./faq-form";
import { ContactFormBlockForm } from "./contact-form-block-form";
import { StatsForm } from "./stats-form";
import { ProductGridForm } from "./product-grid-form";
import { BlogListForm } from "./blog-list-form";

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  hero: "Hero",
  features_grid: "Features Grid",
  pricing: "Pricing",
  testimonials: "Testimonials",
  cta_banner: "CTA Banner",
  faq: "FAQ",
  contact_form: "Contact Form",
  stats: "Stats",
  product_grid: "Product Grid",
  blog_list: "Blog List",
};

const FORMS: Record<BlockType, BlockFormComponent> = {
  hero: HeroForm,
  features_grid: FeaturesGridForm,
  pricing: PricingForm,
  testimonials: TestimonialsForm,
  cta_banner: CtaBannerForm,
  faq: FaqForm,
  contact_form: ContactFormBlockForm,
  stats: StatsForm,
  product_grid: ProductGridForm,
  blog_list: BlogListForm,
};

export const BLOCK_TYPES = Object.keys(BLOCK_TYPE_REGISTRY) as BlockType[];

/** Config base (valores vacíos) para una sección nueva. Se completa en el form. */
export function defaultBlockConfig(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "hero":
      return { title: "", subtitle: "", image: "", ctas: [] };
    case "features_grid":
      return { title: "", subtitle: "", features: [] };
    case "pricing":
      return { title: "", subtitle: "", plans: [] };
    case "testimonials":
      return { title: "", subtitle: "", items: [] };
    case "cta_banner":
      return { title: "", subtitle: "", buttonLabel: "", buttonHref: "" };
    case "faq":
      return { title: "", subtitle: "", items: [] };
    case "contact_form":
      return { title: "", subtitle: "", successMessage: "" };
    case "stats":
      return { title: "", items: [] };
    case "product_grid":
      return { title: "", subtitle: "", categoryFilter: "", limit: 8, columns: 3 };
    case "blog_list":
      return { title: "", subtitle: "", limit: 3, columns: 3 };
  }
}

export function SectionTypeForm({
  blockType,
  config,
  onChange,
}: {
  blockType: BlockType;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const Form = FORMS[blockType];
  return <Form config={config} onChange={onChange} />;
}
