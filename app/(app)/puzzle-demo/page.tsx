import { redirect } from "next/navigation"
import { validateUser } from "@/lib/auth/admin-guard"
import { Section } from "@/components/ui/section"
import { PuzzleDemo } from "@/components/court/PuzzleDemo"

/**
 * /puzzle-demo — Spike NO productivo (Konva + transición de puzzle). Borrable tras el go/no-go.
 *
 * Estados permitidos (AC-12): `ACTIVE` con cualquier rol (USER y ADMIN/SUPER_ADMIN).
 * `TEMPORARY` → `/dashboard`. `LOCKED` y sin sesión → `/login` (vía `validateUser`). Nunca `LOCKED`.
 *
 * Server Component a propósito: `CourtStage` (Konva) sólo entra por
 * `next/dynamic({ ssr: false })` dentro de `PuzzleDemo` (D-T3/D-T4).
 */
export default async function PuzzleDemoPage() {
  const session = await validateUser()
  if (session.user.status !== "ACTIVE") redirect("/dashboard")

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-3xl pb-16 md:pb-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Puzzle (spike)</h1>
          <p className="text-sm text-muted-foreground">
            Demo de validación técnica: cancha en canvas con transición entre pasos.
          </p>
        </div>
        <PuzzleDemo />
      </div>
    </Section>
  )
}
