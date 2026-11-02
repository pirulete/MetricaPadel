"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { HeaderWithNotifications } from "@/components/layout/header-with-notifications"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/padel/bottom-nav"
import { cn } from "@/lib/utils"

interface AppLayoutClientProps {
  role: "ADMIN" | "USER"
  children: React.ReactNode
}

/** D-13: editor a pantalla completa; la biblioteca `/transiciones` conserva el nav. */
const FOCUS_MODE_ROUTES = [/^\/transiciones\/nueva$/, /^\/transiciones\/[^/]+$/]

export function AppLayoutClient({ role, children }: AppLayoutClientProps) {
  const [collapsed, setCollapsed] = React.useState(false)
  const pathname = usePathname()
  const focusMode = FOCUS_MODE_ROUTES.some((re) => re.test(pathname))

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={role} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex flex-1 flex-col">
        <HeaderWithNotifications />
        <main className={cn("flex-1", focusMode ? "pb-0" : "pb-16 md:pb-0")}>{children}</main>
      </div>
      {!focusMode && <BottomNav role={role} />}
    </div>
  )
}
