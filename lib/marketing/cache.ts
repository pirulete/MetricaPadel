/**
 * Capa de caché del Marketing CMS.
 *
 * Las queries Drizzle (`lib/db/queries/marketing/*`) son puras y NO cachean;
 * este módulo las envuelve con `unstable_cache` + tags + TTL fallback 300s.
 * Las mutaciones admin revalidan tags on-demand vía `invalidateForEntity`
 * + `revalidateMarketing` (o `POST /api/admin/marketing/revalidate`).
 *
 * Advertencia: `unstable_cache`/`revalidateTag` son APIs experimentales de
 * Next.js. Si cambian de firma, el fix es local a este archivo.
 */
import { revalidateTag, unstable_cache } from "next/cache";
import {
  getPageBySlug,
  getPublishedPosts,
  getPublishedProducts,
  getSettingsMap,
} from "@/lib/db/queries/marketing";
import {
  DEFAULT_NAVIGATION,
  type NavLink,
  type NavigationData,
} from "./types";

export const MARKETING_CACHE_TTL = 300;

export const CACHE_TAGS = {
  posts: "posts",
  products: "products",
  settings: "settings",
  navigation: "navigation",
} as const;

export const pageTag = (slug: string) => `pages:${slug}`;

/** Página publicada con sus secciones ordenadas. null si no existe o es draft. */
export function getCachedPage(slug: string) {
  return unstable_cache(
    async () => getPageBySlug(slug, { publishedOnly: true }),
    ["mk-page", slug],
    { tags: [pageTag(slug)], revalidate: MARKETING_CACHE_TTL }
  )();
}

/** Posts publicados, ordenados por publishedAt desc. */
export function getCachedPosts(limit = 20) {
  return unstable_cache(
    async () => getPublishedPosts(limit),
    ["mk-posts", String(limit)],
    { tags: [CACHE_TAGS.posts], revalidate: MARKETING_CACHE_TTL }
  )();
}

/** Productos publicados; opcional filtrar por slug de categoría. */
export function getCachedProducts(opts: { categorySlug?: string } = {}) {
  const categorySlug = opts.categorySlug?.trim().toLowerCase() || "";
  return unstable_cache(
    async () => getPublishedProducts({ categorySlug: categorySlug || undefined }),
    ["mk-products", categorySlug || "all"],
    { tags: [CACHE_TAGS.products], revalidate: MARKETING_CACHE_TTL }
  )();
}

/** Mapa key → value de marketing_settings (jsonb). */
export function getCachedSettings() {
  return unstable_cache(
    async () => getSettingsMap(),
    ["mk-settings"],
    { tags: [CACHE_TAGS.settings], revalidate: MARKETING_CACHE_TTL }
  )();
}

/** Navegación pública (siteName, logo, navLinks, footerLinks) con defaults vacíos. */
export function getCachedNavigation(): Promise<NavigationData> {
  return unstable_cache(
    async () => {
      const settings = await getSettingsMap();
      return {
        siteName:
          typeof settings.siteName === "string" ? settings.siteName : DEFAULT_NAVIGATION.siteName,
        logo: typeof settings.logo === "string" ? settings.logo : DEFAULT_NAVIGATION.logo,
        navLinks: Array.isArray(settings.navLinks)
          ? (settings.navLinks as NavLink[])
          : DEFAULT_NAVIGATION.navLinks,
        footerLinks: Array.isArray(settings.footerLinks)
          ? (settings.footerLinks as NavLink[])
          : DEFAULT_NAVIGATION.footerLinks,
      };
    },
    ["mk-navigation"],
    { tags: [CACHE_TAGS.navigation], revalidate: MARKETING_CACHE_TTL }
  )();
}

export type MarketingEntity =
  | "page"
  | "post"
  | "product"
  | "category"
  | "settings"
  | "navigation";

/**
 * Devuelve los tags a revalidar para una entidad mutada.
 * Usado por los route handlers admin para invalidar caché on-demand.
 */
export function invalidateForEntity(entity: MarketingEntity, slug?: string): string[] {
  switch (entity) {
    case "page":
      return [pageTag(slug ?? "")];
    case "post":
      return [CACHE_TAGS.posts];
    case "product":
      return [CACHE_TAGS.products];
    case "category":
      return [CACHE_TAGS.products];
    case "settings":
      return [CACHE_TAGS.settings, CACHE_TAGS.navigation];
    case "navigation":
      return [CACHE_TAGS.navigation];
  }
}

/** Revalida una lista de tags (solo en runtime request, no en build). */
export function revalidateMarketing(tags: string[]) {
  for (const tag of tags) {
    // Next 16 cambió la firma: revalidateTag(tag, profile)
    revalidateTag(tag, { expire: MARKETING_CACHE_TTL });
  }
}

/** Headers de caché para endpoints públicos (coherente con unstable_cache TTL). */
export const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const;
