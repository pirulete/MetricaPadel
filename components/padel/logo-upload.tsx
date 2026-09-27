"use client"

import * as React from "react"
import { toast } from "sonner"
import { UploadIcon, Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AcademyDetail } from "@/hooks/use-academies"

/**
 * Upload de logo (SPEC-EPIC-01 Fase E). POST /api/academies/[id]/logo con
 * multipart/form-data. PNG/SVG ≤2MB, dims ≤1024×1024 (validado server-side).
 */
export function LogoUpload({
  academy,
  onUploaded,
}: {
  academy: AcademyDetail
  onUploaded?: (academy: AcademyDetail) => void
}) {
  const [loading, setLoading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/academies/${academy.id}/logo`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo subir el logo")
        return
      }
      toast.success("Logo actualizado")
      onUploaded?.(data.academy)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex items-center gap-4">
      {academy.logoUrl ? (
        <img
          src={academy.logoUrl}
          alt={`Logo de ${academy.name}`}
          className="size-16 rounded-full border border-border object-cover"
        />
      ) : (
        <span
          className="flex size-16 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{ backgroundColor: academy.primaryColor }}
          aria-hidden
        >
          {academy.name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="academy-logo" className="text-sm font-medium">
          Logo institucional
        </Label>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id="academy-logo"
            type="file"
            accept="image/png,image/svg+xml"
            className="max-w-56"
            onChange={(e) => void handleFile(e)}
            disabled={loading}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            aria-label="Subir logo"
          >
            {loading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">PNG o SVG · máx 2MB · 1024×1024px.</p>
      </div>
    </div>
  )
}