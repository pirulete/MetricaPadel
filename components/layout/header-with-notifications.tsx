"use client"

import { signOut } from "next-auth/react"
import { LogOutIcon } from "lucide-react"
import { NotificationBadge } from "@/components/notifications/notification-badge"
import { Button } from "@/components/ui/button"

/**
 * Header del área privada (client wrapper): badge de notificaciones + logout.
 * El layout (server) lo renderiza para poder montar el badge client-side.
 */
export function HeaderWithNotifications() {
  return (
    <header className="border-b border-border px-6 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium md:hidden">Área privada</p>
        <div className="flex items-center gap-2">
          <NotificationBadge />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground md:hidden"
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Cerrar sesión"
          >
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
