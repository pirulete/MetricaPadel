"use client"

import { NotificationBadge } from "@/components/notifications/notification-badge"

/**
 * Header del área privada (client wrapper): título + badge de notificaciones.
 * El layout (server) lo renderiza para poder montar el badge client-side.
 */
export function HeaderWithNotifications() {
  return (
    <header className="border-b border-border px-6 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Área privada</p>
        <NotificationBadge />
      </div>
    </header>
  )
}