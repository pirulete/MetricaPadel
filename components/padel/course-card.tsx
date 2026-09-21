"use client"

import Link from "next/link"
import { UsersIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type CourseListItem = {
  id: string
  name: string
  level: "iniciacion" | "intermedio" | "avanzado"
  schedule: string | null
  days: string[]
  inviteCode: string
  status: "active" | "archived"
  studentCount: number
}

const LEVEL_LABELS: Record<CourseListItem["level"], string> = {
  iniciacion: "Iniciación",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
}

/** Card de curso para la lista P05. */
export function CourseCard({ course }: { course: CourseListItem }) {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{course.name}</CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {course.inviteCode}
          </Badge>
        </div>
        <Badge variant="secondary" className="w-fit">
          {LEVEL_LABELS[course.level]}
        </Badge>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <UsersIcon className="size-4" />
          {course.studentCount} alumnos
        </p>
        {course.schedule && <p className="mt-1">{course.schedule}</p>}
        {course.days.length > 0 && <p className="mt-1">{course.days.join(" · ")}</p>}
      </CardContent>
      <CardFooter>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={`/cursos/${course.id}`}>Ver detalle</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}