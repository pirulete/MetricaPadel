"use client"

import Link from "next/link"
import { ArchiveIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type RubricListItem = {
  id: string
  title: string
  category: "tecnica" | "tactica" | "fisica" | "actitud"
  status: "draft" | "active" | "archived"
  criteriaCount: number
  levelCount: number
  createdAt: string
  updatedAt: string
}

const CATEGORY_LABELS: Record<RubricListItem["category"], string> = {
  tecnica: "Técnica",
  tactica: "Táctica",
  fisica: "Física",
  actitud: "Actitud",
}

const STATUS_LABELS: Record<RubricListItem["status"], string> = {
  draft: "Borrador",
  active: "Activa",
  archived: "Archivada",
}

interface RubricCardProps {
  rubric: RubricListItem
  onArchive: (id: string) => void
}

/** Card de rúbrica para la biblioteca P02. */
export function RubricCard({ rubric, onArchive }: RubricCardProps) {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{rubric.title}</CardTitle>
          <Badge variant={rubric.status === "archived" ? "outline" : "secondary"}>
            {STATUS_LABELS[rubric.status]}
          </Badge>
        </div>
        <Badge variant="outline" className="w-fit">
          {CATEGORY_LABELS[rubric.category]}
        </Badge>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {rubric.criteriaCount} criterios · {rubric.levelCount} niveles
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/rubricas/${rubric.id}`}>Editar</Link>
        </Button>
        {rubric.status !== "archived" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onArchive(rubric.id)}
            aria-label={`Archivar ${rubric.title}`}
          >
            <ArchiveIcon className="size-4" />
            Archivar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}