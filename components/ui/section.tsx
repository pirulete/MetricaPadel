import React from "react"
import { cn } from "@/lib/utils"

interface SectionProps {
  children: React.ReactNode
  className?: string
  id?: string
}

export function Section({ children, className, id }: SectionProps) {
  return (
    <section id={id} className={cn("py-8 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        {children}
      </div>
    </section>
  )
}

interface SectionHeaderProps {
  title: string
  subtitle?: string
  centered?: boolean
  className?: string
}

export function SectionHeader({ title, subtitle, centered = false, className }: SectionHeaderProps) {
  return (
    <div className={cn(
      "mb-6 md:mb-12",
      centered && "text-center",
      className
    )}>
      <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 md:mt-4 text-lg text-muted-foreground leading-relaxed max-w-3xl text-pretty">
          {subtitle}
        </p>
      )}
    </div>
  )
}
