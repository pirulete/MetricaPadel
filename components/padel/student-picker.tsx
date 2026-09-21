"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export type Player = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  status: string
}

interface StudentPickerProps {
  value: string | null
  onChange: (studentId: string | null) => void
}

/** Selector de alumno P09: búsqueda sobre /api/admin/users (role USER). */
export function StudentPicker({ value, onChange }: StudentPickerProps) {
  const [search, setSearch] = React.useState("")
  const [players, setPlayers] = React.useState<Player[]>([])
  const [loading, setLoading] = React.useState(false)

  const searchPlayers = async (query: string) => {
    setLoading(true)
    try {
      const qs = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""
      const res = await fetch(`/api/admin/users${qs}`, { cache: "no-store" })
      if (!res.ok) throw new Error("No se pudieron cargar los alumnos")
      const body = await res.json()
      setPlayers(body.users)
    } catch {
      setPlayers([])
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void searchPlayers("")
  }, [])

  const selected = players.find((p) => p.id === value) ?? null

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void searchPlayers(search)
            }
          }}
          placeholder="Buscar alumno por nombre o email…"
          className="pl-9"
          aria-label="Buscar alumno"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      ) : players.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay alumnos. Créalos desde el panel de administración.
        </p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-1">
          {players.map((player) => (
            <Button
              key={player.id}
              type="button"
              variant={value === player.id ? "secondary" : "ghost"}
              className="w-full justify-start text-left"
              onClick={() => onChange(player.id)}
            >
              <span className="truncate">
                {player.firstName} {player.lastName}
              </span>
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {player.email}
              </span>
            </Button>
          ))}
        </div>
      )}

      {selected && (
        <p className="text-sm text-muted-foreground">
          Alumno seleccionado: {selected.firstName} {selected.lastName}
        </p>
      )}
    </div>
  )
}