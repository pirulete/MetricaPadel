"use client"

import Link from "next/link"

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import type { NavLink } from "@/lib/marketing/types"

/** Navegación desktop con navigation-menu (Radix). Oculta si no hay links. */
export function NavMenu({ links }: { links: NavLink[] }) {
  if (links.length === 0) return null

  return (
    <NavigationMenu className="hidden lg:block">
      <NavigationMenuList>
        {links.map((item) => (
          <NavigationMenuItem key={item.href}>
            <Link href={item.href} legacyBehavior passHref>
              <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                {item.label}
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
