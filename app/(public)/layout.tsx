import { MarketingHeader } from "@/components/layout/header"
import { MarketingFooter } from "@/components/layout/footer"
import { getCachedNavigation } from "@/lib/marketing/cache"
import { DEFAULT_NAVIGATION } from "@/lib/marketing/types"

export const dynamic = "force-dynamic"

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  let navigation = DEFAULT_NAVIGATION
  try {
    navigation = await getCachedNavigation()
  } catch {
    // DB unreachable — use defaults so the app can render mock screens
  }

  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader navigation={navigation} />
      <main className="flex-1">{children}</main>
      <MarketingFooter navigation={navigation} />
    </div>
  )
}
