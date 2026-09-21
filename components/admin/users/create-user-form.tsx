"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAdminError } from "@/hooks/use-admin-fetch";

export function CreateUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          ...(form.password ? { password: form.password } : {}),
        }),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      const data = await res.json();
      if (data.generatedPassword) {
        setGeneratedPassword(data.generatedPassword);
      } else {
        toast.success("Usuario creado");
        onSuccess();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear usuario");
    } finally {
      setBusy(false);
    }
  };

  if (generatedPassword) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
          <p className="font-medium">Usuario creado. Contraseña generada (se muestra una sola vez):</p>
          <p className="mt-2 font-mono text-base font-semibold break-all">{generatedPassword}</p>
          <p className="mt-2 text-muted-foreground">Guárdala antes de cerrar. No se puede recuperar.</p>
        </div>
        <Button className="w-full" onClick={onSuccess}>Entendido</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cu-email">Email</Label>
        <Input
          id="cu-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="jugador@ejemplo.com"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cu-first">Nombre</Label>
          <Input id="cu-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cu-last">Apellido</Label>
          <Input id="cu-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cu-password">Contraseña (opcional)</Label>
        <Input
          id="cu-password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Dejar vacío para auto-generar"
        />
      </div>
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={busy || !form.email || !form.firstName || !form.lastName}
      >
        {busy ? "Creando…" : "Crear usuario"}
      </Button>
    </div>
  );
}