/**
 * Documento PDF de evaluación con branding institucional (SPEC-EPIC-01, RF-04).
 * Server-only: usa renderToBuffer de @react-pdf/renderer — NO importar desde
 * client components. El radar se computa en lib/padel/radar.ts (puro); el
 * renderer solo dibuja. Logo: data-URL PNG/http embebido; SVG data-URL cae a
 * fallback con iniciales (react-pdf no rasteriza SVG data-URL de forma fiable).
 */
import { Document, Page, Text, View, StyleSheet, Svg, Polygon, Image, renderToBuffer } from "@react-pdf/renderer";
import { computeRadarPoints, computeRadarPolygon, computeGridRing, RADAR_DIMENSIONS } from "./radar";

export type PdfScoreRow = {
  criteriaName: string;
  /** Una de RADAR_DIMENSIONS (reglas, tecnica_basica, ...). */
  category: string;
  score: number;
  maxScore: number;
  comment?: string;
};

export type PdfPerson = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export type PdfEvaluation = {
  id: string;
  status: string;
  totalScore: number | null;
  maxScore: number | null;
  globalComment: string | null;
  publishedAt: Date | string | null;
};

export type PdfRubric = {
  id: string;
  title: string;
  category: string;
};

export type PdfAcademy = {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
};

const LEVEL_MAX = 4; // escala fija: Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  brandBar: { height: 6, marginBottom: 16, borderRadius: 3 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  logo: { width: 48, height: 48, marginRight: 12 },
  logoFallback: {
    width: 48,
    height: 48,
    marginRight: 12,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { color: "#ffffff", fontSize: 20, fontWeight: "bold" },
  headerText: { flex: 1 },
  academyName: { fontSize: 14, fontWeight: "bold", color: "#0f172a" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4, color: "#0f172a" },
  subtitle: { fontSize: 10, color: "#64748b", marginBottom: 16 },
  section: { fontSize: 12, fontWeight: "bold", marginTop: 16, marginBottom: 8, color: "#0f172a" },
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { width: 90, color: "#64748b" },
  radarWrap: { alignItems: "center", marginVertical: 8 },
  radarLabel: { position: "absolute", fontSize: 7, color: "#475569" },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 4 },
  tableCellName: { flex: 3 },
  tableCellScore: { flex: 1, textAlign: "right" },
  tableCellComment: { flex: 4, color: "#64748b" },
  comment: { fontSize: 10, lineHeight: 1.5, marginTop: 4 },
  signature: { marginTop: 32, borderTopWidth: 0.5, borderTopColor: "#cbd5e1", paddingTop: 8 },
  signatureName: { fontWeight: "bold", fontSize: 11 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#94a3b8", textAlign: "center" },
});

/** Agrega scores por categoría: promedio de ratios (score/maxScore) × LEVEL_MAX. */
export function computeRadarScores(scores: PdfScoreRow[], maxScore: number): Record<string, number> {
  const sums: Record<string, { total: number; count: number }> = {};
  for (const s of scores) {
    const ratio = s.maxScore > 0 ? s.score / s.maxScore : 0;
    const acc = (sums[s.category] ??= { total: 0, count: 0 });
    acc.total += ratio;
    acc.count += 1;
  }
  const out: Record<string, number> = {};
  for (const dim of RADAR_DIMENSIONS) {
    const acc = sums[dim];
    out[dim] = acc && acc.count > 0 ? (acc.total / acc.count) * maxScore : 0;
  }
  return out;
}

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

function fullName(p: PdfPerson | undefined): string {
  if (!p) return "—";
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email;
}

/** Posiciones de las etiquetas del radar (reutiliza computeRadarPoints). */
function radarLabelPositions(cx: number, cy: number, radius: number): Array<{ x: number; y: number; label: string }> {
  const dummyScores: Record<string, number> = {};
  for (const dim of RADAR_DIMENSIONS) dummyScores[dim] = 1;
  return computeRadarPoints(dummyScores, 1).map((p, i) => ({
    x: cx + p.x * (radius + 16) - 18,
    y: cy + p.y * (radius + 16) - 4,
    label: RADAR_DIMENSIONS[i].replace(/_/g, " "),
  }));
}

function EvaluationPdfDocument(props: {
  evaluation: PdfEvaluation;
  rubric: PdfRubric;
  scores: PdfScoreRow[];
  academy?: PdfAcademy;
  student?: PdfPerson;
  teacher?: PdfPerson;
}) {
  const { evaluation, rubric, scores, academy, student, teacher } = props;
  const primaryColor = academy?.primaryColor ?? "#3b82f6";
  const radarScores = computeRadarScores(scores, LEVEL_MAX);
  const radarCx = 110;
  const radarCy = 110;
  const radarRadius = 80;
  const labels = radarLabelPositions(radarCx, radarCy, radarRadius);
  const logoUrl = academy?.logoUrl;
  const showLogo = logoUrl && !logoUrl.startsWith("data:image/svg+xml");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.brandBar, { backgroundColor: primaryColor }]} />

        <View style={styles.header}>
          {showLogo ? (
            <Image src={logoUrl} style={styles.logo} />
          ) : (
            <View style={[styles.logoFallback, { backgroundColor: primaryColor }]}>
              <Text style={styles.logoFallbackText}>{(academy?.name ?? "P").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.academyName}>{academy?.name ?? "Padel Evaluativo"}</Text>
            <Text style={styles.subtitle}>Informe de Evaluación · {formatDate(evaluation.publishedAt)}</Text>
          </View>
        </View>

        <Text style={styles.title}>{rubric.title}</Text>
        <Text style={styles.subtitle}>
          {rubric.category.replace(/_/g, " ")} · {evaluation.totalScore ?? 0}/{evaluation.maxScore ?? 0} puntos
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Alumno</Text>
          <Text>{fullName(student)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Profesor</Text>
          <Text>{fullName(teacher)}</Text>
        </View>

        <Text style={styles.section}>Radar de dimensiones</Text>
        <View style={styles.radarWrap}>
          <View style={{ width: 220, height: 220, position: "relative" }}>
            <Svg viewBox="0 0 220 220" style={{ width: 220, height: 220 }}>
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <Polygon
                  key={r}
                  points={computeGridRing(r, radarCx, radarCy, radarRadius)}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth={0.5}
                />
              ))}
              <Polygon
                points={computeRadarPolygon(radarScores, LEVEL_MAX, radarCx, radarCy, radarRadius)}
                fill={primaryColor}
                fillOpacity={0.25}
                stroke={primaryColor}
                strokeWidth={1.5}
              />
            </Svg>
            {labels.map((l) => (
              <Text key={l.label} style={[styles.radarLabel, { left: l.x, top: l.y }]}>
                {l.label}
              </Text>
            ))}
          </View>
        </View>

        <Text style={styles.section}>Detalle de scores</Text>
        {scores.map((s, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.tableCellName}>{s.criteriaName}</Text>
            <Text style={styles.tableCellScore}>
              {s.score}/{s.maxScore}
            </Text>
            <Text style={styles.tableCellComment}>{s.comment ?? ""}</Text>
          </View>
        ))}

        {evaluation.globalComment ? (
          <>
            <Text style={styles.section}>Comentario global</Text>
            <Text style={styles.comment}>{evaluation.globalComment}</Text>
          </>
        ) : null}

        <View style={styles.signature}>
          <Text style={styles.signatureName}>{fullName(teacher)}</Text>
          <Text style={styles.subtitle}>Firma del profesor · {formatDate(evaluation.publishedAt)}</Text>
        </View>

        <Text style={styles.footer}>Generado por Padel Evaluativo · {formatDate(new Date())}</Text>
      </Page>
    </Document>
  );
}

/**
 * Genera el PDF de una evaluación publicada con branding de academia.
 * Sin academia → branding neutro (color default, inicial "P").
 */
export async function generateEvaluationPdf(
  evaluation: PdfEvaluation,
  rubric: PdfRubric,
  scores: PdfScoreRow[],
  academy?: PdfAcademy,
  student?: PdfPerson,
  teacher?: PdfPerson
): Promise<Buffer> {
  return renderToBuffer(
    <EvaluationPdfDocument
      evaluation={evaluation}
      rubric={rubric}
      scores={scores}
      academy={academy}
      student={student}
      teacher={teacher}
    />
  );
}