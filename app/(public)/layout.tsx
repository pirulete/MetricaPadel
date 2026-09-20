import { MarketingHeader } from "@/components/layout/header"
import { MarketingFooter } from "@/components/layout/footer"
import { getCachedNavigation } from "@/lib/marketing/cache"

export const dynamic = "force-dynamic"

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const navigation = await getCachedNavigation()

  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader navigation={navigation} />
      <main className="flex-1">{children}</main>
      <MarketingFooter navigation={navigation} />
    </div>
  )
}
