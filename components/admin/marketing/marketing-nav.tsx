"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Newspaper, Package, Tags, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/marketing/pages", label: "Pages", icon: FileText },
  { href: "/admin/marketing/blog", label: "Blog", icon: Newspaper },
  { href: "/admin/marketing/products", label: "Products", icon: Package },
  { href: "/admin/marketing/categories", label: "Categories", icon: Tags },
  { href: "/admin/marketing/settings", label: "Settings", icon: Settings },
] as const;

export function MarketingNav() {
  const pathname = usePathname();

  return (
    <nav className="w-full shrink-0 md:w-52" aria-label="Marketing admin">
      <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
