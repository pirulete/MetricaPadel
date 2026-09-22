"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[public-error]", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="text-muted-foreground">Intentá nuevamente más tarde.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={reset}>Reintentar</Button>
        <Button asChild>
          <Link href="/">Inicio</Link>
        </Button>
      </div>
    </div>
  )
}
