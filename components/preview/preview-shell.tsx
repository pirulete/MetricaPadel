"use client";

import { useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PreviewScreen = {
  id: string;
  label: string;
  node: ReactNode;
};

/**
 * PreviewShell — contenedor de mockups efímeros (components/preview).
 * - Navegación entre pantallas del mockup (chips).
 * - Toggle dark/light: redefine las CSS variables del design system
 *   (mismas variables, valores oscuros derivados de la paleta oklch).
 * - Toolbar opcional (p. ej. selector de estado default/loading/empty).
 * Se elimina junto con los mockups al implementarse la feature.
 */
export function PreviewShell({
  title,
  screens,
  toolbar,
}: {
  title: string;
  screens: PreviewScreen[];
  toolbar?: ReactNode;
}) {
  const [active, setActive] = useState(screens[0]?.id ?? "");
  const [dark, setDark] = useState(false);
  const activeScreen = screens.find((s) => s.id === active) ?? screens[0];

  return (
    <div className={cn("min-h-screen bg-background text-foreground", dark && "preview-dark")}>
      <style>{`
        .preview-dark {
          --background: oklch(0.16 0 0);
          --foreground: oklch(0.95 0 0);
          --card: oklch(0.2 0 0);
          --card-foreground: oklch(0.95 0 0);
          --popover: oklch(0.2 0 0);
          --popover-foreground: oklch(0.95 0 0);
          --secondary: oklch(0.25 0 0);
          --secondary-foreground: oklch(0.95 0 0);
          --muted: oklch(0.24 0 0);
          --muted-foreground: oklch(0.7 0 0);
          --accent: oklch(0.28 0.03 145);
          --accent-foreground: oklch(0.95 0 0);
          --border: oklch(0.3 0 0);
          --input: oklch(0.3 0 0);
          --sidebar: oklch(0.18 0 0);
        }
      `}</style>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-3 py-4 sm:px-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground">
              Mockup efímero · components/preview · se elimina al implementar
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDark((d) => !d)}
            aria-label="Alternar modo oscuro"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {dark ? "Light" : "Dark"}
          </Button>
        </header>

        <nav className="mb-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Pantallas del mockup">
          {screens.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                s.id === active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={s.id === active}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {toolbar ? <div className="mb-4">{toolbar}</div> : null}

        <main className="flex-1">{activeScreen?.node}</main>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Prototipo navegable — Etapa 1 · Core Evaluativo
        </footer>
      </div>
    </div>
  );
}