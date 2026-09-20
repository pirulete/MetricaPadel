import { cn } from "@/lib/utils"

/** Estado vacío compartido por los 10 blocks (mockup: EmptyState). */
export function EmptyState({
  title,
  hint,
  className,
}: {
  title: string
  hint: string
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70">{hint}</p>
    </div>
  )
}

/** Skeleton de carga para Suspense (mockup: LoadingSkeleton). */
export function BlockSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse space-y-4", className)}
      role="status"
      aria-label="Cargando contenido"
    >
      <div className="h-8 w-2/3 rounded-md bg-muted" />
      <div className="h-4 w-full rounded-md bg-muted" />
      <div className="h-4 w-4/5 rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-xl border border-border bg-muted/50" />
        ))}
      </div>
    </div>
  )
}
