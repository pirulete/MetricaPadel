"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Route } from "lucide-react"
import { HeaderWithNotifications } from "@/components/layout/header-with-notifications"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/padel/bottom-nav"
import { Button } from "@/components/ui/button"
import { canShowTransitionFab } from "@/lib/constants/navigation"
import { cn } from "@/lib/utils"

interface AppLayoutClientProps {
  role: "ADMIN" | "USER"
  children: React.ReactNode
}

/** D-13: editor a pantalla completa; la biblioteca `/transiciones` conserva el nav. */
const FOCUS_MODE_ROUTES = [/^\/transiciones\/nueva$/, /^\/transiciones\/[^/]+$/]

/** Punto de novedad del FAB (primera sesión), dismissible. */
const FAB_SEEN_KEY = "padel.transitionFab.seen"

/** Snapshot cliente: true mientras el usuario no haya visto el FAB. */
function getFabHintSnapshot(): boolean {
  try {
    return window.localStorage.getItem(FAB_SEEN_KEY) === null
  } catch {
    return false
  }
}

/** Snapshot servidor/hidratación: sin punto (evita mismatch). */
function getFabHintServerSnapshot(): boolean {
  return false
}

function subscribeFabHint(onChange: () => void) {
  window.addEventListener("storage", onChange)
  return () => window.removeEventListener("storage", onChange)
}

export function AppLayoutClient({ role, children }: AppLayoutClientProps) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [hintDismissed, setHintDismissed] = React.useState(false)
  const firstVisit = React.useSyncExternalStore(
    subscribeFabHint,
    getFabHintSnapshot,
    getFabHintServerSnapshot
  )
  const pathname = usePathname()
  const focusMode = FOCUS_MODE_ROUTES.some((re) => re.test(pathname))
  const showFab = !focusMode && canShowTransitionFab(role, pathname)
  const showFabHint = showFab && firstVisit && !hintDismissed

  const dismissFabHint = () => {
    setHintDismissed(true)
    try {
      window.localStorage.setItem(FAB_SEEN_KEY, "1")
    } catch {
      // storage no disponible: no-op
    }
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={role} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex flex-1 flex-col">
        <HeaderWithNotifications />
        <main className={cn("flex-1", focusMode ? "pb-0" : "pb-16 md:pb-0")}>{children}</main>
      </div>
      {!focusMode && <BottomNav role={role} />}
      {showFab && (
        <Button
          asChild
          size="icon"
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg shadow-primary/20 md:right-6 md:bottom-6 md:h-14 md:w-auto md:px-5"
        >
          <Link
            href="/transiciones/nueva"
            aria-label="Crear transición"
            title="Crear transición"
            onClick={dismissFabHint}
          >
            <Route className="size-6 md:size-5" aria-hidden="true" />
            <span className="hidden md:inline">Nueva transición</span>
            {showFabHint && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 size-2 rounded-full bg-destructive"
              />
            )}
          </Link>
        </Button>
      )}
    </div>
  )
}
