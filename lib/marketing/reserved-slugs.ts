/**
 * Slugs reservados para rutas públicas de la aplicación.
 * En Next.js las rutas estáticas ganan a `/[slug]`, pero validamos
 * defensivamente en handlers y schemas para evitar colisiones.
 */
export const RESERVED_SLUGS = [
  "login",
  "register",
  "admin",
  "api",
  "blog",
  "shop",
  "dashboard",
  "settings",
  "home",
] as const;

const reservedSet = new Set<string>(RESERVED_SLUGS);

export function isReservedSlug(slug: string): boolean {
  return reservedSet.has(slug.trim().toLowerCase());
}
