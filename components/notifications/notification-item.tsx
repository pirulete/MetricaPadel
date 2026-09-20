"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  TYPE_ICONS,
  formatRelativeTime,
  getPriorityColor,
} from "@/lib/notifications/priority"
import { cn } from "@/lib/utils"
import type { NotificationItem as NotificationItemType } from "@/hooks/use-notifications"

/**
 * Una notificación del inbox: icono por tipo, título, body (2 líneas),
 * CTA opcional, botón hide (soft-delete) y time-ago.
 * No leída → fondo bg-accent; leída → normal.
 */
export function NotificationItem({
  notification,
  onMarkRead,
  onHide,
}: {
  notification: NotificationItemType
  onMarkRead?: () => void
  onHide?: () => void
}) {
  const Icon = TYPE_ICONS[notification.type as keyof typeof TYPE_ICONS] || Bell
  const unread = notification.read === 0

  return (
    <div
      className={cn(
        "flex gap-3 border-l-2 px-4 py-3 transition-colors",
        getPriorityColor(notification.priority),
        unread ? "bg-accent" : "bg-background"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          unread ? "text-foreground" : "text-muted-foreground"
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-sm",
              unread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
            )}
          >
            {notification.title}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{notification.body}</p>
        )}
        {notification.ctaUrl && (
          <Link
            href={notification.ctaUrl}
            onClick={unread ? onMarkRead : undefined}
            className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
          >
            {notification.ctaLabel || "Ver más"}
          </Link>
        )}
      </div>
      {onHide && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-1 -mt-1 shrink-0 text-muted-foreground"
          aria-label="Ocultar notificación"
          onClick={onHide}
        >
          <XIcon className="size-3.5" />
        </Button>
      )}
    </div>
  )
}