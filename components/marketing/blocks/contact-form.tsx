"use client"

import * as React from "react"

import { Section, SectionHeader } from "@/components/ui/section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { contactSchema } from "@/lib/marketing/schemas"

type ContactFormConfig = {
  title?: string
  subtitle?: string
  successMessage?: string
}

type FormStatus = "idle" | "submitting" | "success" | "error"

export function ContactFormBlock({ config }: { config: ContactFormConfig }) {
  const [status, setStatus] = React.useState<FormStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)

  const successMessage = config.successMessage || "¡Mensaje enviado! Te contactaremos en menos de 24h."

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setStatus("submitting")

    const form = event.currentTarget
    const parsed = contactSchema.safeParse({
      name: new FormData(form).get("name"),
      email: new FormData(form).get("email"),
      message: new FormData(form).get("message"),
    })

    if (!parsed.success) {
      setStatus("error")
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos e inténtalo de nuevo")
      return
    }

    try {
      const response = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        setStatus("error")
        setError(body?.error ?? "No pudimos enviar el mensaje. Intenta más tarde.")
        return
      }
      setStatus("success")
      form.reset()
    } catch {
      setStatus("error")
      setError("No pudimos enviar el mensaje. Intenta más tarde.")
    }
  }

  return (
    <Section>
      <SectionHeader title={config.title || "Contacto"} subtitle={config.subtitle} centered />
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6">
        {status === "success" ? (
          <div className="py-8 text-center" role="status">
            <p className="text-foreground">{successMessage}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setStatus("idle")}
            >
              Enviar otro
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Nombre</Label>
                <Input id="contact-name" name="name" placeholder="Tu nombre" required maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  placeholder="tu@email.com"
                  required
                  maxLength={200}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-message">Mensaje</Label>
              <Textarea
                id="contact-message"
                name="message"
                placeholder="Cuéntanos tu proyecto"
                rows={4}
                required
                maxLength={2000}
              />
            </div>
            {status === "error" && error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full sm:w-auto" disabled={status === "submitting"}>
              {status === "submitting" ? "Enviando…" : "Enviar mensaje"}
            </Button>
          </form>
        )}
      </div>
    </Section>
  )
}
