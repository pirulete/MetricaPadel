import { MarketingNav } from "@/components/admin/marketing/marketing-nav";

/**
 * Layout del back-office de Marketing.
 * Hereda `validateAdmin` del layout admin raíz (app/admin/layout.tsx).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:px-6">
      <MarketingNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
