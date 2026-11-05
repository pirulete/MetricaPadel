"use client"

import * as React from "react"
import { AlertTriangle, Loader2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TOURNAMENTS_UPDATED_EVENT } from "@/components/torneos/tournament-list"

/** Mismo techo que el route handler (`MAX_IMPORT_BYTES`). */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024

export type TournamentImportError = {
  code: string
  path: string
  message: string
}

/** Los `details` del API son `LoaderError[]` o issues Zod; ambos traen `path`. */
function normalizeErrors(details: unknown): TournamentImportError[] {
  if (!Array.isArray(details)) return []
  return details.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const item = entry as { code?: unknown; path?: unknown; message?: unknown }
    const path = Array.isArray(item.path)
      ? item.path.join(".")
      : typeof item.path === "string"
        ? item.path
        : ""
    return [
      {
        code: typeof item.code === "string" ? item.code : "invalid_instance",
        path,
        message: typeof item.message === "string" ? item.message : "Error de validación",
      },
    ]
  })
}

/**
 * Import de torneo desde el JSON canónico (§6). `POST /api/torneos`:
 * 201 éxito · 400 forma/reglas · 422 instancia no agendable · 413 payload.
 */
export function TournamentImportModal({
  triggerLabel = "Importar torneo",
}: {
  triggerLabel?: string
}) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [json, setJson] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [errors, setErrors] = React.useState<TournamentImportError[]>([])

  const reset = () => {
    setJson("")
    setFormError(null)
    setErrors([])
    if (fileRef.current) fileRef.current.value = ""
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFormError(null)
    setErrors([])
    if (file.size > MAX_IMPORT_BYTES) {
      setFormError("El archivo supera el máximo de 2 MB")
      return
    }
    try {
      const text = await file.text()
      JSON.parse(text)
      setJson(text)
    } catch {
      setFormError("El archivo no contiene JSON válido")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setErrors([])

    let payload: unknown
    try {
      payload = JSON.parse(json)
    } catch {
      setFormError("El JSON no es válido. Revisa la sintaxis.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/torneos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error ?? "No se pudo importar el torneo")
        setErrors(normalizeErrors(data.details))
        return
      }
      toast.success(`Torneo importado · ${data.counts?.matches ?? 0} partidos`)
      setOpen(false)
      reset()
      window.dispatchEvent(new Event(TOURNAMENTS_UPDATED_EVENT))
    } catch {
      setFormError("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next && !loading) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UploadIcon className="size-4" aria-hidden />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar torneo</DialogTitle>
          <DialogDescription>
            Pega el JSON canónico o carga un archivo .json. La importación es atómica: si
            hay errores no se guarda nada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="torneo-file">Archivo .json</Label>
            <Input
              ref={fileRef}
              id="torneo-file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleFile(e)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">Máximo 2 MB.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="torneo-json">JSON del torneo</Label>
            <Textarea
              id="torneo-json"
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='{ "meta": { "name": "..." }, "calendario": [], ... }'
              className="min-h-48 font-mono text-xs"
              spellCheck={false}
              aria-describedby={formError ? "torneo-import-error" : undefined}
              disabled={loading}
              required
            />
          </div>

          {(formError || errors.length > 0) && (
            <div
              id="torneo-import-error"
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3.5" aria-hidden />
                {formError ?? "El torneo no es válido"}
              </p>
              {errors.length > 0 && (
                <ul className="mt-1.5 space-y-1 text-xs text-destructive">
                  {errors.map((error, index) => (
                    <li key={`${error.path}-${error.code}-${index}`}>
                      {error.path && (
                        <code className="mr-1 rounded bg-background/60 px-1 font-mono">
                          {error.path}
                        </code>
                      )}
                      {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !json.trim()}>
              {loading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  Importando…
                </>
              ) : (
                "Importar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
