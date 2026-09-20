import Link from "next/link"

export default function DashboardPage() {
  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Área privada del usuario autenticado.</p>
      <Link href="/" className="text-sm underline">Salir</Link>
    </main>
  )
}
