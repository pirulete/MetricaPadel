import Link from "next/link"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Iniciar sesión</h1>
      <p className="text-muted-foreground">Conecta este formulario con Auth.js (next-auth/react signIn).</p>
      <Link href="/" className="text-sm underline">Volver</Link>
    </main>
  )
}
