import { HomeIcon, BookOpenIcon, ClipboardListIcon, HistoryIcon, TrendingUpIcon, User, Building2Icon, ShieldIcon, TrophyIcon } from "lucide-react"

export const ADMIN_NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: HomeIcon },
  { href: "/cursos", label: "Cursos", icon: BookOpenIcon },
  { href: "/academias", label: "Academias", icon: Building2Icon },
  { href: "/torneos", label: "Torneos", icon: TrophyIcon },
  { href: "/evaluar", label: "Evaluar", icon: ClipboardListIcon },
  { href: "/historial", label: "Historial", icon: HistoryIcon },
  { href: "/admin", label: "Admin", icon: ShieldIcon },
  { href: "/settings", label: "Perfil", icon: User },
]

export const USER_NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: HomeIcon },
  { href: "/cursos", label: "Cursos", icon: BookOpenIcon },
  { href: "/academias", label: "Academias", icon: Building2Icon },
  { href: "/evaluaciones", label: "Mis evaluaciones", icon: ClipboardListIcon },
  { href: "/evolucion", label: "Evolución", icon: TrendingUpIcon },
  { href: "/settings", label: "Perfil", icon: User },
]

export function getNavItems(role: "ADMIN" | "USER") {
  return role === "ADMIN" ? ADMIN_NAV_ITEMS : USER_NAV_ITEMS
}

/** Rutas donde el FAB de transiciones no aporta (biblioteca, modo foco, ajustes, back-office). */
const HIDDEN_TRANSITION_FAB_ROUTES = [/^\/transiciones(\/|$)/, /^\/settings(\/|$)/, /^\/admin(\/|$)/]

/** FAB "Crear transición": sólo coach y sólo en rutas de trabajo. Función pura (testeable). */
export function canShowTransitionFab(role: string, pathname: string): boolean {
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") return false
  return !HIDDEN_TRANSITION_FAB_ROUTES.some((re) => re.test(pathname))
}
