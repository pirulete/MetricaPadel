"use client"

import * as React from "react"
import Link from "next/link"
import { MenuIcon, XIcon } from "lucide-react"
import { Drawer } from "vaul"

import { Button } from "@/components/ui/button"
import { NavMenu } from "./nav-menu"
import { cn } from "@/lib/utils"
import type { NavigationData } from "@/lib/marketing/types"

/**
 * Header público server-driven: logo, nav desktop (NavMenu) y drawer móvil (vaul).
 * Cuando el CMS está vacío renderiza fallback mínimo (sin links) para no
 * alterar el visual de login/register.
 */
export function MarketingHeader({
  navigation,
  className,
}: {
  navigation: NavigationData
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur",
        className
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
        <Link href="/" className="text-lg font-bold text-foreground" aria-label="Inicio">
          {navigation.siteName || "Inicio"}
        </Link>

        <NavMenu links={navigation.navLinks} />

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/register">Registrarse</Link>
          </Button>

          {navigation.navLinks.length > 0 && (
            <Drawer.Root open={open} onOpenChange={setOpen} direction="right">
              <Drawer.Trigger asChild>
                <Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Abrir menú">
                  <MenuIcon />
                </Button>
              </Drawer.Trigger>
              <Drawer.Content className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-border bg-background p-4 outline-none">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Menú</p>
                  <Drawer.Close asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Cerrar menú">
                      <XIcon />
                    </Button>
                  </Drawer.Close>
                </div>
                <nav aria-label="Principal móvil" className="mt-6 flex flex-col gap-1">
                  {navigation.navLinks.map((item) => (
                    <Drawer.Close key={item.href} asChild>
                      <Link
                        href={item.href}
                        className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {item.label}
                      </Link>
                    </Drawer.Close>
                  ))}
                </nav>
              </Drawer.Content>
            </Drawer.Root>
          )}
        </div>
      </div>
    </header>
  )
}
