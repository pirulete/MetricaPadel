import { buildCsv } from "@/lib/utils";

/**
 * Fila mínima necesaria para exportar el historial a CSV (G2).
 * Coincide con la forma que devuelve GET /api/history (items visibles).
 */
export type HistoryCsvRow = {
  studentName: string;
  rubricTitle: string;
  category: string | null;
  totalScore: number | null;
  maxScore: number | null;
  date: string | Date | null;
  status: string;
};

const HEADERS = ["Alumno", "Rúbrica", "Categoría", "Score", "Máximo", "Fecha", "Estado"];

/**
 * Mapea los items visibles del historial a CSV (con BOM UTF-8 vía downloadCsv).
 * Pura y sin imports server-side para poder testearla en Jest.
 */
export function historyToCsv(items: HistoryCsvRow[]): string {
  const rows = items.map((item) => [
    item.studentName ?? "",
    item.rubricTitle ?? "",
    item.category ?? "",
    String(item.totalScore ?? 0),
    String(item.maxScore ?? 0),
    item.date ? new Date(item.date).toLocaleDateString("es-AR") : "",
    item.status ?? "",
  ]);
  return buildCsv(HEADERS, rows);
}