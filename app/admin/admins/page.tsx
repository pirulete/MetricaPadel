import { validateSuperAdmin } from "@/lib/auth/admin-guard";
import { AdminsList } from "@/components/admin/admins/admin-list";

export default async function AdminAdminsPage() {
  await validateSuperAdmin();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <AdminsList />
    </main>
  );
}