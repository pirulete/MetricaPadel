"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** SCR-03 — Login real con Auth.js (credentials). */
export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    try {
      // Use fetch directly to avoid ClientFetchError from signIn() when
      // CSRF endpoint returns empty body in development (skipCSRFCheck).
      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: email.trim(),
          password,
          redirect: "false",
          callbackUrl: "/dashboard",
        }),
        redirect: "manual",
      })

      // redirect: "manual" — we handle navigation ourselves.
      // On success Auth.js sets the session cookie and returns 302 (redirect case)
      // or 200 JSON with { url } when redirect: "false" is respected.
      if (res.type === "opaqueredirect" || res.status >= 300 && res.status < 400) {
        toast.success("Sesión iniciada")
        router.push("/dashboard")
        router.refresh()
        return
      }

      // Auth.js returns 200 JSON when redirect: "false" — session cookie is set
      if (res.ok) {
        toast.success("Sesión iniciada")
        router.push("/dashboard")
        router.refresh()
        return
      }

      // If we got here, login failed (401/403 or CredentialsSignin redirect in body)
      toast.error("Credenciales inválidas o cuenta bloqueada")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Accede a tu cuenta de Padel Evaluation</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Regístrate
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}