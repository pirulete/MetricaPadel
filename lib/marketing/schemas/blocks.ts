/**
 * Schemas Zod de los 10 block types del Marketing CMS.
 * Cada block type valida su config jsonb antes de guardarse (API admin)
 * y antes de renderizarse (block-renderer).
 *
 * Seguridad: validación anti-XSS en URLs — se prohíben esquemas
 * `javascript:`, `data:` y `vbscript:` en href e imágenes; las imágenes
 * solo aceptan http(s).
 */
import { z } from "zod";

// ── Validación anti-XSS ──────────────────────────────────────────────

const UNSAFE_SCHEME = /^(javascript|data|vbscript):/i;

function hasControlChars(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/** href seguro: relativo (/, /blog, #ancla) o absoluto; nunca esquemas ejecutables. */
export const safeHref = z
  .string()
  .trim()
  .max(2000, "La URL es demasiado larga")
  .refine((v) => !UNSAFE_SCHEME.test(v), "URL insegura: esquema no permitido")
  .refine((v) => !hasControlChars(v), "URL contiene caracteres de control");

/** URL de imagen: solo http(s) (sin data: para evitar payloads embebidos). */
export const imageUrl = z
  .string()
  .trim()
  .max(500, "La URL de imagen es demasiado larga")
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Solo se permiten URLs http(s)")
  .refine((v) => !hasControlChars(v), "URL contiene caracteres de control");

export const ctaVariantSchema = z.enum(["default", "outline", "secondary", "ghost", "link"]);

const optionalText = (max: number) => z.string().trim().max(max).optional();

// ── 1. Hero ──────────────────────────────────────────────────────────

export const heroCtaSchema = z.object({
  label: z.string().trim().min(1, "El label del CTA es requerido").max(60),
  href: safeHref,
  variant: ctaVariantSchema.default("default"),
});

export const heroSchema = z.object({
  title: z.string().trim().min(1, "El título es requerido").max(200),
  subtitle: optionalText(500),
  image: imageUrl.optional(),
  ctas: z.array(heroCtaSchema).max(4).default([]),
});

// ── 2. Features Grid ─────────────────────────────────────────────────

export const featureItemSchema = z.object({
  icon: z.string().trim().max(16).optional(),
  title: z.string().trim().min(1, "El título del feature es requerido").max(120),
  description: z.string().trim().min(1, "La descripción del feature es requerida").max(500),
});

export const featuresGridSchema = z.object({
  title: z.string().trim().min(1, "El título es requerido").max(200),
  subtitle: optionalText(500),
  features: z.array(featureItemSchema).max(12).default([]),
});

// ── 3. Pricing ───────────────────────────────────────────────────────

export const pricingPlanSchema = z.object({
  name: z.string().trim().min(1, "El nombre del plan es requerido").max(120),
  price: z.string().trim().min(1, "El precio es requerido").max(40),
  period: optionalText(20),
  description: optionalText(300),
  features: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  ctaLabel: optionalText(60),
  ctaHref: safeHref.optional(),
  highlighted: z.boolean().default(false),
});

export const pricingSchema = z.object({
  title: z.string().trim().min(1, "El título es requerido").max(200),
  subtitle: optionalText(500),
  plans: z.array(pricingPlanSchema).max(6).default([]),
});

// ── 4. Testimonials ──────────────────────────────────────────────────

export const testimonialItemSchema = z.object({
  quote: z.string().trim().min(1, "La cita es requerida").max(1000),
  author: z.string().trim().min(1, "El autor es requerido").max(120),
  role: optionalText(200),
  avatar: imageUrl.optional(),
});

export const testimonialsSchema = z.object({
  title: z.string().trim().min(1, "El título es requerido").max(200),
  subtitle: optionalText(500),
  items: z.array(testimonialItemSchema).max(12).default([]),
});

// ── 5. CTA Banner ────────────────────────────────────────────────────

export const ctaBannerSchema = z.object({
  title: z.string().trim().min(1, "El título es requerido").max(200),
  subtitle: optionalText(500),
  buttonLabel: optionalText(60),
  buttonHref: safeHref.optional(),
});

// ── 6. FAQ ───────────────────────────────────────────────────────────

export const faqItemSchema = z.object({
  question: z.string().trim().min(1, "La pregunta es requerida").max(300),
  answer: z.string().trim().min(1, "La respuesta es requerida").max(2000),
});

export const faqSchema = z.object({
  title: z.string().trim().min(1, "El título es requerido").max(200),
  subtitle: optionalText(500),
  items: z.array(faqItemSchema).max(20).default([]),
});

// ── 7. Contact Form ──────────────────────────────────────────────────

export const contactFormSchema = z.object({
  title: optionalText(200),
  subtitle: optionalText(500),
  successMessage: optionalText(300),
});

// ── 8. Stats ─────────────────────────────────────────────────────────

export const statItemSchema = z.object({
  value: z.string().trim().min(1, "El valor es requerido").max(60),
  label: z.string().trim().min(1, "La etiqueta es requerida").max(120),
});

export const statsSchema = z.object({
  title: optionalText(200),
  items: z.array(statItemSchema).max(8).default([]),
});

// ── 9. Product Grid ──────────────────────────────────────────────────

export const productGridSchema = z.object({
  title: optionalText(200),
  subtitle: optionalText(500),
  categoryFilter: z.string().trim().max(200).nullable().optional(),
  limit: z.coerce.number().int().min(1).max(24).default(8),
  columns: z.coerce.number().int().min(2).max(4).default(3),
});

// ── 10. Blog List ────────────────────────────────────────────────────

export const blogListSchema = z.object({
  title: optionalText(200),
  subtitle: optionalText(500),
  limit: z.coerce.number().int().min(1).max(24).default(3),
  columns: z.coerce.number().int().min(2).max(3).default(3),
});

// ── Registry ─────────────────────────────────────────────────────────

/** Registro único: blockType → schema Zod. Fuente de verdad para validación y render. */
export const BLOCK_TYPE_REGISTRY = {
  hero: heroSchema,
  features_grid: featuresGridSchema,
  pricing: pricingSchema,
  testimonials: testimonialsSchema,
  cta_banner: ctaBannerSchema,
  faq: faqSchema,
  contact_form: contactFormSchema,
  stats: statsSchema,
  product_grid: productGridSchema,
  blog_list: blogListSchema,
} as const;

export type BlockType = keyof typeof BLOCK_TYPE_REGISTRY;

/** Unión de configs válidas de todos los block types. */
export type BlockConfig = {
  [K in BlockType]: z.infer<(typeof BLOCK_TYPE_REGISTRY)[K]>;
}[BlockType];

export type ParseBlockConfigResult =
  | { ok: true; data: BlockConfig }
  | { ok: false; error: string };

/** Valida una config contra el schema de su blockType. Render tolerante: si falla → { ok: false }. */
export function parseBlockConfig(blockType: string, config: unknown): ParseBlockConfigResult {
  const schema = BLOCK_TYPE_REGISTRY[blockType as BlockType];
  if (!schema) {
    return { ok: false, error: `Tipo de bloque desconocido: ${blockType}` };
  }
  const result = schema.safeParse(config);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    error: result.error.issues.map((issue) => issue.message).join("; "),
  };
}
