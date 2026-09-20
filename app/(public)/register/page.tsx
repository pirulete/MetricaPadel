import Link from "next/link"

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Registrarse</h1>
      <p className="text-muted-foreground">Conecta este formulario con POST /api/auth/register.</p>
      <Link href="/" className="text-sm underline">Volver</Link>
    </main>
  )
}
