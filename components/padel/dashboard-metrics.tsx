"use client"

import { UsersIcon, ClipboardListIcon, TrendingUpIcon, CalendarIcon } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type TeacherMetrics = {
  students: number
  evaluations: number
  average: number | null
  classesToday: number
}

const METRICS: Array<{
  key: keyof TeacherMetrics
  label: string
  icon: typeof UsersIcon
  format: (v: number | null) => string
}> = [
  { key: "students", label: "Alumnos", icon: UsersIcon, format: (v) => String(v ?? 0) },
  { key: "evaluations", label: "Evaluaciones", icon: ClipboardListIcon, format: (v) => String(v ?? 0) },
  { key: "average", label: "Promedio", icon: TrendingUpIcon, format: (v) => (v === null ? "—" : v.toFixed(2)) },
  { key: "classesToday", label: "Clases hoy", icon: CalendarIcon, format: (v) => String(v ?? 0) },
]

/** Grid de métricas del coach (P01). */
export function DashboardMetrics({ metrics }: { metrics: TeacherMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {METRICS.map((m) => (
        <Card key={m.key}>
          <CardHeader className="gap-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <m.icon className="size-4" />
              {m.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{m.format(metrics[m.key])}</CardContent>
        </Card>
      ))}
    </div>
  )
}