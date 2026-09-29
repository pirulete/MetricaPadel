/**
 * Tipos compartidos de paginación por cursor (G15).
 * Patrón: cursor = ISO date string del campo de orden (createdAt/updatedAt/
 * publishedAt según la query), limit+1 para detectar hasMore, nextCursor = ISO
 * del último item de la página. Reutiliza el patrón de
 * getNotificationsByUserId (lib/db/queries/notifications.ts).
 */
export type PaginationParams = {
  /** Tamaño de página (default 20, máx 50). */
  limit?: number;
  /** Cursor ISO date string del último item de la página anterior. */
  cursor?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
};

/** Clamp del limit: default 20, máx 50 (mismo tope que notifications). */
export function resolveLimit(limit?: number): number {
  return Math.min(limit ?? 20, 50);
}