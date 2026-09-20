/**
 * Schemas Zod de entidades del Marketing CMS: páginas, posts, productos,
 * categorías, settings y contacto. Se usan en API pública y admin.
 */
import { z } from "zod";
import { imageUrl, safeHref } from "./blocks";

export const slugSchema = z
  .string()
  .trim()
  .min(1, "El slug es requerido")
  .max(200, "El slug es demasiado largo")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Solo minúsculas, números y guiones (sin guiones al inicio o final)"
  );

export const marketingStatusSchema = z.enum(["draft", "published"]);

// ── Páginas ──────────────────────────────────────────────────────────

export const pageSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, "El título es requerido").max(200),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  status: marketingStatusSchema.default("draft"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const pageUpdateSchema = pageSchema.partial();

// ── Posts ────────────────────────────────────────────────────────────

/** Bloque tipográfico del contenido de un post (sin HTML libre, anti-XSS). */
export const postContentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(5000) }),
  z.object({
    type: z.literal("list"),
    items: z.array(z.string().trim().min(1).max(1000)).max(30),
  }),
]);

export const postContentSchema = z.array(postContentBlockSchema).max(100).default([]);

export const postSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, "El título es requerido").max(200),
  excerpt: z.string().trim().max(500).optional(),
  content: postContentSchema,
  coverImage: imageUrl.optional(),
  publishedAt: z.string().datetime().optional().nullable(),
  status: marketingStatusSchema.default("draft"),
});

export const postUpdateSchema = postSchema.partial();

// ── Productos ────────────────────────────────────────────────────────

/** price como string decimal ("29.99") — numeric de pg se serializa como string. */
export const priceSchema = z
  .string()
  .trim()
  .min(1, "El precio es requerido")
  .regex(/^\d+(\.\d{1,2})?$/, "Precio inválido (ej: 29.99)");

export const productSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, "El nombre es requerido").max(200),
  description: z.string().trim().max(5000).optional(),
  price: priceSchema,
  compareAtPrice: priceSchema.nullable().optional(),
  images: z.array(imageUrl).max(10).default([]),
  categoryId: z.string().uuid().nullable().optional(),
  status: marketingStatusSchema.default("draft"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const productUpdateSchema = productSchema.partial();

// ── Categorías ───────────────────────────────────────────────────────

export const categorySchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, "El nombre es requerido").max(200),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const categoryUpdateSchema = categorySchema.partial();

// ── Settings ─────────────────────────────────────────────────────────

export const navLinkSchema = z.object({
  label: z.string().trim().min(1, "El label es requerido").max(60),
  href: safeHref,
});

export const settingsSchema = z.object({
  siteName: z.string().trim().max(120).optional(),
  logo: imageUrl.optional(),
  navLinks: z.array(navLinkSchema).max(12).default([]),
  footerLinks: z.array(navLinkSchema).max(12).default([]),
});

export const settingsKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Key inválida");

// ── Contacto público ─────────────────────────────────────────────────

export const contactSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(100),
  email: z.string().trim().email("Email inválido").max(200),
  message: z
    .string()
    .trim()
    .min(1, "El mensaje es requerido")
    .max(2000, "El mensaje es demasiado largo (máx 2000 caracteres)"),
});
