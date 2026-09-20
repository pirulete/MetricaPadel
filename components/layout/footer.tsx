import Link from "next/link"

import type { NavigationData } from "@/lib/marketing/types"

/** Footer público server-driven: copyright + footerLinks desde settings. */
export function MarketingFooter({ navigation }: { navigation: NavigationData }) {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row lg:px-8">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} {navigation.siteName || "Skeleton"}
        </p>
        {navigation.footerLinks.length > 0 && (
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center gap-6">
              {navigation.footerLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </footer>
  )
}
