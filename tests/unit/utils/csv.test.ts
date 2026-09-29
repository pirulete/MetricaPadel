/**
 * Unit tests de la exportación CSV del historial (G2).
 * Cubre: historyToCsv (mapeo de campos, nulls, formato de fecha, escaping).
 * @jest-environment node
 */
import { historyToCsv, type HistoryCsvRow } from "@/lib/padel/history-csv";

const base: HistoryCsvRow = {
  studentName: "Ana Pérez",
  rubricTitle: "Saque",
  category: "tecnica_basica",
  totalScore: 4,
  maxScore: 4,
  date: new Date("2026-09-20T10:00:00Z"),
  status: "published",
};

describe("historyToCsv", () => {
  it("genera headers + una fila por item con los campos mapeados", () => {
    const csv = historyToCsv([base]);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Alumno,Rúbrica,Categoría,Score,Máximo,Fecha,Estado");
    expect(lines[1]).toContain("Ana Pérez");
    expect(lines[1]).toContain("Saque");
    expect(lines[1]).toContain("tecnica_basica");
    expect(lines[1]).toContain("4");
    expect(lines[1]).toContain("published");
  });

  it("formatea la fecha con locale es-AR (DD/MM/YYYY)", () => {
    const csv = historyToCsv([base]);
    const fecha = csv.split("\n")[1].split(",")[5];
    expect(fecha).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });

  it("maneja nulls: categoría vacía, fecha vacía, scores a 0", () => {
    const csv = historyToCsv([
      { ...base, category: null, date: null, totalScore: null, maxScore: null },
    ]);
    const cells = csv.split("\n")[1].split(",");

    expect(cells[2]).toBe("");
    expect(cells[3]).toBe("0");
    expect(cells[4]).toBe("0");
    expect(cells[5]).toBe("");
  });

  it("escapa campos con comas o comillas (escapeCsvField)", () => {
    const csv = historyToCsv([
      { ...base, studentName: 'Pérez, Juan "El Gordo"' },
    ]);
    const row = csv.split("\n")[1];
    expect(row).toContain('"Pérez, Juan ""El Gordo"""');
  });

  it("retorna solo headers cuando no hay items", () => {
    expect(historyToCsv([])).toBe("Alumno,Rúbrica,Categoría,Score,Máximo,Fecha,Estado");
  });
});