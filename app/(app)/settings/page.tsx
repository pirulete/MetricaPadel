import { auth } from "@/auth"
import { getUserById } from "@/lib/db/queries"
import { Section, SectionHeader } from "@/components/ui/section"
import { ProfileForm } from "@/components/padel/profile-form"
import { BottomNav } from "@/components/padel/bottom-nav"

/**
 * /settings — G5: perfil + cambio de contraseña.
 * Server component: el layout (app) ya valida sesión; aquí se lee el perfil
 * completo (incluye phone, que no viaja en la sesión JWT) y se pasa al form.
 */
export default async function SettingsPage() {
  const session = await auth()
  const role = session?.user?.role === "ADMIN" ? "ADMIN" : "USER"

  const user = await getUserById(session!.user.id as string)

  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-2xl pb-16 md:pb-0">
        <SectionHeader
          title="Perfil y configuración"
          subtitle="Actualiza tus datos personales o cambia tu contraseña"
        />
        <ProfileForm
          user={{
            firstName: user?.firstName ?? "",
            lastName: user?.lastName ?? "",
            phone: user?.phone ?? null,
            email: user?.email ?? session!.user.email ?? "",
          }}
        />
      </div>
      <BottomNav role={role} />
    </Section>
  )
}