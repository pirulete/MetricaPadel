"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAdminError } from "@/hooks/use-admin-fetch";
import type { AdminUserRow } from "./user-list";

export function EditUserForm({ user, onSuccess }: { user: AdminUserRow; onSuccess: () => void }) {
  const [form, setForm] = useState({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: user.phone ?? "",
  });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
        }),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success("Usuario actualizado");
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="eu-first">Nombre</Label>
          <Input id="eu-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eu-last">Apellido</Label>
          <Input id="eu-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="eu-phone">Teléfono</Label>
        <Input id="eu-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+34 600 000 000" />
      </div>
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={busy || (!form.firstName && !form.lastName && !form.phone)}
      >
        {busy ? "Guardando…" : "Guardar cambios"}
      </Button>
    </div>
  );
}