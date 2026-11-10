/**
 * AC-05 — `lib/motor-torneo/**` es un módulo PURO.
 *
 * Escaneo estático (el único `node:fs` del módulo vive aquí, en el test):
 * - prohibido importar `lib/db`, `next/*`, `server-only`, `react`, `@/auth`,
 *   `node:fs` (y cualquier `node:*`);
 * - `highs` solo en `solver.ts`; `zod` solo en `loader.ts`;
 * - cero `Date` (P-5/EC-17): los bloques son `dayLabel` + `startTime`;
 * - `synthetic.ts` (si existe) no se importa desde `app/`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MODULE_DIR = join(ROOT, "lib/motor-torneo");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

const FILES = tsFiles(MODULE_DIR).sort();
const SOURCES = new Map(
  FILES.map((file) => [file, readFileSync(file, "utf8")] as const),
);
const rel = (file: string) => relative(ROOT, file);

const FORBIDDEN = [
  /^(\.\.\/)+db(\/|$)/, // ../db/...
  /^@\/lib\/db(\/|$)/,
  /^lib\/db(\/|$)/,
  /^next(\/|$)/,
  /^server-only$/,
  /^react(\/|$)/,
  /^@\/auth(\/|$)/,
  /^node:/,
];

describe("pureza del módulo motor-torneo (AC-05)", () => {
  it("encuentra los archivos del módulo", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(5);
    expect(FILES.map(rel)).toEqual(
      expect.arrayContaining([join("lib/motor-torneo", "verify.ts")]),
    );
  });

  it("no importa capas server-side ni builtins de Node", () => {
    const offenders: string[] = [];
    for (const [file, source] of SOURCES) {
      for (const spec of importSpecifiers(source)) {
        if (FORBIDDEN.some((pattern) => pattern.test(spec))) {
          offenders.push(`${rel(file)} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("solo solver.ts importa highs", () => {
    const withHighs = [...SOURCES]
      .filter(([, source]) => importSpecifiers(source).some((spec) => spec === "highs"))
      .map(([file]) => rel(file));
    expect(withHighs).toEqual([join("lib/motor-torneo", "solver.ts")]);
  });

  it("solo loader.ts importa zod", () => {
    const withZod = [...SOURCES]
      .filter(([, source]) => importSpecifiers(source).some((spec) => spec === "zod"))
      .map(([file]) => rel(file));
    expect(withZod.every((file) => file.endsWith(join("lib/motor-torneo", "loader.ts")))).toBe(
      true,
    );
  });

  it("no usa Date (EC-17: bloques son dayLabel + startTime)", () => {
    const offenders = [...SOURCES]
      .filter(([, source]) => /\bnew Date\s*\(|\bDate\.now\s*\(/.test(source))
      .map(([file]) => rel(file));
    expect(offenders).toEqual([]);
  });

  it("verify.ts no importa model.ts ni objective.ts (verificador independiente)", () => {
    const verifySource = SOURCES.get(join(MODULE_DIR, "verify.ts")) ?? "";
    const specs = importSpecifiers(verifySource);
    expect(specs.some((spec) => /^(\.\/)(model|objective)$/.test(spec))).toBe(false);
  });

  it("synthetic.ts no se importa desde app/", () => {
    let appFiles: string[];
    try {
      appFiles = walk(join(ROOT, "app"));
    } catch {
      appFiles = [];
    }
    const offenders = appFiles.filter((file) =>
      /motor-torneo\/synthetic/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
