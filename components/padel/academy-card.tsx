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
import type { AcademyListItem } from "@/hooks/use-academies"

const ROLE_LABELS: Record<AcademyListItem["role"], string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  COACH: "Profesor",
}

/** Card de academia para la lista (SPEC-EPIC-01 Fase E). */
export function AcademyCard({ academy }: { academy: AcademyListItem }) {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            {academy.logoUrl ? (
              <img
                src={academy.logoUrl}
                alt={`Logo de ${academy.name}`}
                className="size-10 rounded-full object-cover"
              />
            ) : (
              <span
                className="flex size-10 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: academy.primaryColor }}
                aria-hidden
              >
                {academy.name.charAt(0).toUpperCase()}
              </span>
            )}
            <CardTitle className="text-base">{academy.name}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {ROLE_LABELS[academy.role]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <UsersIcon className="size-4" />
          {academy.memberCount} miembros
        </p>
        <p className="mt-1 font-mono text-xs">/{academy.slug}</p>
      </CardContent>
      <CardFooter>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={`/academias/${academy.id}`}>Ver detalle</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}