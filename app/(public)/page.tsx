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

/* ------------------------------------------------------------------ */
/*  Landing page — se renderiza cuando no hay datos CMS (fallback)     */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: "🎯",
    title: "Rúbricas personalizadas",
    desc: "Crea rúbricas con 6 dimensiones de evaluación: reglas, técnica, táctica, física y actitud. Cuatro niveles de desempeño por criterio.",
  },
  {
    icon: "📊",
    title: "Evolución del jugador",
    desc: "Sigue el progreso de cada alumno con gráficos de tendencia por categoría. Compara versiones de evaluación a lo largo del tiempo.",
  },
  {
    icon: "🏆",
    title: "Cursos con código de invitación",
    desc: "Crea cursos, comparte un código PAD-XXXX y que los alumnos se unan solos. Asigna rúbricas y evalúa desde el panel.",
  },
]

const steps = [
  {
    n: 1,
    title: "Crea tu rúbrica",
    desc: "Elige las categorías, define los criterios y asigna descriptores para cada nivel de desempeño.",
  },
  {
    n: 2,
    title: "Evalúa en cancha",
    desc: "Selecciona al alumno, asigna puntajes en vivo y publica la evaluación con un comentario global.",
  },
  {
    n: 3,
    title: "Sigue el progreso",
    desc: "El alumno ve sus evaluaciones, tendencias por categoría y evolución a lo largo de las semanas.",
  },
]

const stats = [
  { value: "6", label: "Dimensiones de evaluación" },
  { value: "4", label: "Niveles de desempeño" },
  { value: "85+", label: "Endpoints de API" },
  { value: "397+", label: "Tests automatizados" },
]

function StaticFallback() {
  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-24 text-center md:py-32">
        <span className="inline-block rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground">
          Gratuito para coaches y academias
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Evalúa el juego de tus alumnos con{" "}
          <span className="text-primary">datos reales</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Rúbricas de evaluación, evolución del jugador y gestión de cursos.
          Todo lo que necesitás para medir y mejorar el rendimiento en pádel.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Empieza gratis
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border px-8 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Ya tengo cuenta
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Todo lo que necesitás en un solo lugar</h2>
          <p className="mt-2 text-muted-foreground">
            Diseñado para coaches, entrenadores y academias de pádel.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 text-3xl">{f.icon}</div>
              <h3 className="mb-2 font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">¿Cómo funciona?</h2>
          <p className="mt-2 text-muted-foreground">
            Tres pasos simples para empezar a evaluar.
          </p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {s.n}
              </div>
              <h3 className="mb-2 font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-8 px-6 py-16 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-primary">{s.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <h2 className="mb-4 text-2xl font-bold sm:text-3xl">¿Listo para empezar?</h2>
        <p className="mb-8 max-w-md mx-auto text-muted-foreground">
          Crea tu cuenta en un minuto y comienza a evaluar a tus jugadores hoy mismo.
        </p>
        <Link
          href="/register"
          className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-10 text-base font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          Crear mi cuenta gratis
        </Link>
      </section>
    </main>
  )
}
