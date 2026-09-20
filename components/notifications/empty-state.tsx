import { BellOffIcon } from "lucide-react"

export function EmptyState({ title = "Sin notificaciones" }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <BellOffIcon className="size-8 text-muted-foreground/50" aria-hidden />
      <p className="text-sm text-muted-foreground">{title}</p>
    </div>
  )
}