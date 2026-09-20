"use client"

import { cn } from "@/lib/utils"

export type NotificationFilterValue = "all" | "unread"

const FILTERS: { value: NotificationFilterValue; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "unread", label: "No leídas" },
]

export function NotificationFilters({
  value,
  onChange,
}: {
  value: NotificationFilterValue
  onChange: (value: NotificationFilterValue) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar notificaciones"
      className="flex w-fit gap-1 rounded-md border border-border bg-muted p-1"
    >
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          role="tab"
          aria-selected={value === filter.value}
          onClick={() => onChange(filter.value)}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            value === filter.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}