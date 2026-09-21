"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/padel/empty-state"

export type StudentCourseInfo = {
  id: string
  name: string
  level: "iniciacion" | "intermedio" | "avanzado"
  schedule: string | null
  days: string[]
}

export type StudentRubricSummary = {
  id: string
  rubricId: string
  title: string
  category: "reglas" | "tecnica_basica" | "tecnica_especifica" | "tactica" | "fisica" | "actitud_equipo"
  assignedAt: string
}

export type StudentEvaluationSummary = {
  id: string
  rubricTitle: string | null
  category: StudentRubricSummary["category"] | null
  totalScore: number | null
  maxScore: number | null
  publishedAt: string | null
  readAt: string | null
  scores: Array<{
    criteriaId: string
    criterionName: string | null
    levelId: string
    levelName: string | null
    score: number
    comment: string | null
  }>
}

const LEVEL_LABELS: Record<StudentCourseInfo["level"], string> = {
  iniciacion: "Iniciación",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
}

const CATEGORY_LABELS: Record<StudentRubricSummary["category"], string> = {
  reglas: "Reglas",
  tecnica_basica: "Técnica básica",
  tecnica_especifica: "Técnica específica",
  tactica: "Táctica",
  fisica: "Física",
  actitud_equipo: "Actitud y equipo",
}

/** Detalle de curso del alumno (G8): header + rúbricas asignadas + mis evaluaciones. */
export function StudentCourseDetail({
  course,
  rubrics,
  evaluations,
}: {
  course: StudentCourseInfo
  rubrics: StudentRubricSummary[]
  evaluations: StudentEvaluationSummary[]
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{course.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{LEVEL_LABELS[course.level]}</Badge>
          {course.schedule && (
            <span className="text-sm text-muted-foreground">{course.schedule}</span>
          )}
          {course.days.length > 0 && (
            <span className="text-sm text-muted-foreground">{course.days.join(" · ")}</span>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Rúbricas asignadas</h2>
        {rubrics.length === 0 ? (
          <EmptyState
            title="Sin rúbricas asignadas"
            description="Tu coach todavía no asignó rúbricas a este curso."
          />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border">
              {rubrics.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5">
                  <p className="text-sm font-medium">{r.title}</p>
                  <Badge variant="outline">{CATEGORY_LABELS[r.category]}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mis evaluaciones</h2>
        {evaluations.length === 0 ? (
          <EmptyState
            title="Sin evaluaciones publicadas"
            description="Cuando tu coach publique una evaluación aparecerá aquí."
          />
        ) : (
          <div className="space-y-4">
            {evaluations.map((e) => (
              <Card key={e.id}>
                <CardHeader className="gap-1">
                  <CardTitle className="text-base">{e.rubricTitle ?? "Evaluación"}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {e.category && <Badge variant="outline">{CATEGORY_LABELS[e.category]}</Badge>}
                    {e.publishedAt && (
                      <span>{new Date(e.publishedAt).toLocaleDateString("es-ES")}</span>
                    )}
                    {e.totalScore != null && e.maxScore != null && (
                      <span className="font-medium">
                        {e.totalScore} / {e.maxScore}
                      </span>
                    )}
                    {e.readAt && <span>Leída</span>}
                  </div>
                </CardHeader>
                {e.scores.length > 0 && (
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Criterio</TableHead>
                          <TableHead>Nivel</TableHead>
                          <TableHead className="text-right">Puntos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {e.scores.map((s) => (
                          <TableRow key={s.criteriaId}>
                            <TableCell className="font-medium">{s.criterionName ?? "—"}</TableCell>
                            <TableCell>{s.levelName ?? "—"}</TableCell>
                            <TableCell className="text-right">{s.score}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}