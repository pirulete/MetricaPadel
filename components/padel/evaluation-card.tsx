"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type StudentEvaluationListItem = {
  id: string
  rubricTitle: string
  category: "reglas" | "tecnica_basica" | "tecnica_especifica" | "tactica" | "fisica" | "actitud_equipo"
  version: number | null
  totalScore: number | null
  maxScore: number | null
  publishedAt: string | null
  readAt: string | null
}

const CATEGORY_LABELS: Record<StudentEvaluationListItem["category"], string> = {
  reglas: "Reglas",
  tecnica_basica: "Técnica Básica",
  tecnica_especifica: "Técnica Específica",
  tactica: "Táctica",
  fisica: "Física",
  actitud_equipo: "Actitud y Trabajo en Equipo",
}

/** Card de evaluación para la lista del alumno (A03). */
export function EvaluationCard({ evaluation }: { evaluation: StudentEvaluationListItem }) {
  const isRead = Boolean(evaluation.readAt)
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{evaluation.rubricTitle}</CardTitle>
          <div className="flex items-center gap-1.5">
            {evaluation.version && evaluation.version > 1 && (
              <Badge variant="outline" className="text-[10px]">v{evaluation.version}</Badge>
            )}
            <Badge variant={isRead ? "outline" : "secondary"}>
              {isRead ? "Leída" : "Nueva"}
            </Badge>
          </div>
        </div>
        <Badge variant="outline" className="w-fit">
          {CATEGORY_LABELS[evaluation.category]}
        </Badge>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {evaluation.publishedAt
            ? new Date(evaluation.publishedAt).toLocaleDateString("es-ES")
            : "—"}
        </span>
        <span className="font-semibold">
          {evaluation.totalScore ?? "—"}
          <span className="font-normal text-muted-foreground">
            {" "}
            / {evaluation.maxScore ?? "—"}
          </span>
        </span>
      </CardContent>
      <CardContent className="pt-0">
        <Link
          href={`/evaluaciones/${evaluation.id}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver detalle
        </Link>
      </CardContent>
    </Card>
  )
}