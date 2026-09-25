import { HomeIcon, BookOpenIcon, ClipboardListIcon, HistoryIcon, TrendingUpIcon, User } from "lucide-react"

export const ADMIN_NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: HomeIcon },
  { href: "/cursos", label: "Cursos", icon: BookOpenIcon },
  { href: "/evaluar", label: "Evaluar", icon: ClipboardListIcon },
  { href: "/historial", label: "Historial", icon: HistoryIcon },
  { href: "/settings", label: "Perfil", icon: User },
]

export const USER_NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: HomeIcon },
  { href: "/cursos", label: "Cursos", icon: BookOpenIcon },
  { href: "/evaluaciones", label: "Mis evaluaciones", icon: ClipboardListIcon },
  { href: "/evolucion", label: "Evolución", icon: TrendingUpIcon },
  { href: "/settings", label: "Perfil", icon: User },
]

export function getNavItems(role: "ADMIN" | "USER") {
  return role === "ADMIN" ? ADMIN_NAV_ITEMS : USER_NAV_ITEMS
}
