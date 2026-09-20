"use client"

import * as React from "react"
import { CheckCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/ui/section"
import { EmptyState } from "@/components/notifications/empty-state"
import {
  NotificationFilters,
  type NotificationFilterValue,
} from "@/components/notifications/notification-filters"
import { NotificationItem } from "@/components/notifications/notification-item"
import { useNotifications } from "@/hooks/use-notifications"

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState<NotificationFilterValue>("all")
  const {
    notifications,
    loading,
    error,
    hasMore,
    fetchNotifications,
    markAllAsRead,
    markAsRead,
    deleteNotification,
  } = useNotifications()
  const hasUnread = notifications.some((n) => n.read === 0)

  const applyFilter = (value: NotificationFilterValue) => {
    setFilter(value)
    void fetchNotifications({ reset: true, unread: value === "unread" })
  }

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
          {hasUnread && (
            <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
              <CheckCheckIcon className="size-4" />
              Marcar todo como leído
            </Button>
          )}
        </div>

        <NotificationFilters value={filter} onChange={applyFilter} />

        <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
          {loading && notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : notifications.length === 0 ? (
            <EmptyState />
          ) : (
            notifications.map((item) => (
              <NotificationItem
                key={item.id}
                notification={item}
                onMarkRead={() => markAsRead([item.id])}
                onHide={() => deleteNotification(item.id)}
              />
            ))
          )}
        </div>

        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

        {hasMore && (
          <div className="mt-6 text-center">
            <Button variant="outline" onClick={() => fetchNotifications()} disabled={loading}>
              {loading ? "Cargando…" : "Cargar más"}
            </Button>
          </div>
        )}
      </div>
    </Section>
  )
}