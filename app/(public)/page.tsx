import Link from "next/link"

import { getCachedPage } from "@/lib/marketing/cache"
import { BlockRenderer } from "@/components/marketing/block-renderer"

export const dynamic = "force-dynamic"

/**
 * Home data-driven: renderiza la página publicada con slug "home" desde la DB.
 * Si no existe → fallback al hero estático (retrocompatibilidad).
 */
export default async function HomePage() {
  let data = null
  try {
    data = await getCachedPage("home")
  } catch {
    // DB unreachable — render static fallback
  }

  if (!data) {
    return <StaticFallback />
  }

  return (
    <div>
      {data.sections.map((section) => (
        <BlockRenderer key={section.id} blockType={section.blockType} config={section.config} />
      ))}
    </div>
  )
}

function StaticFallback() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold">Página Pública</h1>
      <p className="max-w-md text-muted-foreground">
        Esta es la parte pública del proyecto. Áreas autenticadas viven en /dashboard y el
        back-office en /admin.
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium"
        >
          Registrarse
        </Link>
      </div>
    </main>
  )
}
