"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpenIcon, ClipboardListIcon, HomeIcon, HistoryIcon, TrendingUpIcon, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface BottomNavProps {
  role: "ADMIN" | "USER"
}

const ADMIN_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: HomeIcon },
  { href: "/cursos", label: "Cursos", icon: BookOpenIcon },
  { href: "/evaluar", label: "Evaluar", icon: ClipboardListIcon },
  { href: "/historial", label: "Historial", icon: HistoryIcon },
  { href: "/settings", label: "Perfil", icon: User },
]

const USER_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: HomeIcon },
  { href: "/cursos", label: "Cursos", icon: BookOpenIcon },
  { href: "/evaluaciones", label: "Mis evaluaciones", icon: ClipboardListIcon },
  { href: "/evolucion", label: "Evolución", icon: TrendingUpIcon },
  { href: "/settings", label: "Perfil", icon: User },
]

/** Navegación inferior compartida P01/A01 (mobile-first). */
export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname()
  const items = role === "ADMIN" ? ADMIN_ITEMS : USER_ITEMS

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}