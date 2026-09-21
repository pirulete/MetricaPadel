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
  category: "tecnica" | "tactica" | "fisica" | "actitud"
  totalScore: number | null
  maxScore: number | null
  publishedAt: string | null
  readAt: string | null
}

const CATEGORY_LABELS: Record<StudentEvaluationListItem["category"], string> = {
  tecnica: "Técnica",
  tactica: "Táctica",
  fisica: "Física",
  actitud: "Actitud",
}

/** Card de evaluación para la lista del alumno (A03). */
export function EvaluationCard({ evaluation }: { evaluation: StudentEvaluationListItem }) {
  const isRead = Boolean(evaluation.readAt)
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{evaluation.rubricTitle}</CardTitle>
          <Badge variant={isRead ? "outline" : "secondary"}>
            {isRead ? "Leída" : "Nueva"}
          </Badge>
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