import { validateAdmin } from "@/lib/auth/admin-guard"

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await validateAdmin()

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3">
        <p className="text-sm font-medium">Back-office</p>
      </header>
      {children}
    </div>
  )
}
