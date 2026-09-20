"use client"

import { BellIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useNotifications } from "@/hooks/use-notifications"
import { NotificationDropdown } from "./notification-dropdown"

/**
 * Badge del header: icono Bell + contador de no leídas (poll 30s vía hook).
 * Sin no leídas → solo icono, sin badge. Click abre el dropdown.
 */
export function NotificationBadge() {
  const notifications = useNotifications()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <BellIcon className="size-5" />
          {notifications.unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
              {notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <NotificationDropdown {...notifications} />
      </PopoverContent>
    </Popover>
  )
}