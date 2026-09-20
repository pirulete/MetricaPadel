"use client"

import Link from "next/link"
import { CheckCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { UseNotificationsReturn } from "@/hooks/use-notifications"
import { EmptyState } from "./empty-state"
import { NotificationItem } from "./notification-item"

/**
 * Dropdown del header: últimas 10 notificaciones, "marcar todo como leído",
 * "ver todas" → /notifications. Recibe el estado del hook desde el badge
 * (una sola fuente de polling, sin duplicar requests).
 */
export function NotificationDropdown(props: UseNotificationsReturn) {
  const { notifications, loading, markAllAsRead, markAsRead, deleteNotification } = props
  const items = notifications.slice(0, 10)
  const hasUnread = items.some((n) => n.read === 0)

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-semibold">Notificaciones</p>
        {hasUnread && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => markAllAsRead()}
          >
            <CheckCheckIcon className="size-3.5" />
            Marcar todo como leído
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onMarkRead={() => markAsRead([item.id])}
              onHide={() => deleteNotification(item.id)}
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-2">
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href="/notifications">Ver todas</Link>
        </Button>
      </div>
    </div>
  )
}