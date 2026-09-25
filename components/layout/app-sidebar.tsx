"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { LogOutIcon, PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ADMIN_NAV_ITEMS, USER_NAV_ITEMS } from "@/lib/constants/navigation"

interface AppSidebarProps {
  role: "ADMIN" | "USER"
  collapsed?: boolean
  onToggle?: () => void
}

/** Sidebar de navegación para desktop (md+). Colapsable. */
export function AppSidebar({ role, collapsed = false, onToggle }: AppSidebarProps) {
  const pathname = usePathname()
  const items = role === "ADMIN" ? ADMIN_NAV_ITEMS : USER_NAV_ITEMS

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-background transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight">Métrica Pádel</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onToggle}
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {collapsed ? <PanelLeftIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const link = (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }
            return link
          })}
        </nav>

        <div className="border-t border-border px-2 py-3">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 w-full"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  aria-label="Cerrar sesión"
                >
                  <LogOutIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Cerrar sesión</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOutIcon className="size-4 shrink-0" />
              <span>Cerrar sesión</span>
            </Button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
