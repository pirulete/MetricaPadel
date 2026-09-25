"use client"

import * as React from "react"
import { HeaderWithNotifications } from "@/components/layout/header-with-notifications"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/padel/bottom-nav"

interface AppLayoutClientProps {
  role: "ADMIN" | "USER"
  children: React.ReactNode
}

export function AppLayoutClient({ role, children }: AppLayoutClientProps) {
  const [collapsed, setCollapsed] = React.useState(false)

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={role} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex flex-1 flex-col">
        <HeaderWithNotifications />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
      </div>
      <BottomNav role={role} />
    </div>
  )
}
