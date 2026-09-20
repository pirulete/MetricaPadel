"use client";

/**
 * Config global del sitio: siteName, logo y links de navegación (nav/footer).
 * Se persiste como marketing_settings (key → jsonb) vía la API admin.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAdminError, useAdminFetch } from "@/hooks/use-admin-fetch";

type NavLink = { label: string; href: string };

type SettingsFormState = {
  siteName: string;
  logo: string;
  navLinks: NavLink[];
  footerLinks: NavLink[];
};

const EMPTY: SettingsFormState = { siteName: "", logo: "", navLinks: [], footerLinks: [] };

export function SettingsForm() {
  const { data, loading, reload } = useAdminFetch<{ settings: Record<string, unknown> }>("/api/admin/marketing/settings");
  const [form, setForm] = useState<SettingsFormState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hidrata el form una sola vez cuando llegan los datos del servidor.
  if (!hydrated && data) {
    setHydrated(true);
    const s = data.settings ?? {};
    setForm({
      siteName: typeof s.siteName === "string" ? s.siteName : "",
      logo: typeof s.logo === "string" ? s.logo : "",
      navLinks: Array.isArray(s.navLinks) ? (s.navLinks as NavLink[]) : [],
      footerLinks: Array.isArray(s.footerLinks) ? (s.footerLinks as NavLink[]) : [],
    });
  }

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: form }),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success("Configuración guardada");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  const updateLink = (key: "navLinks" | "footerLinks", index: number, patch: Partial<NavLink>) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].map((link, i) => (i === index ? { ...link, ...patch } : link)),
    }));
  };

  if (loading) {
    return <div className="space-y-3" aria-busy="true">
      {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-md bg-muted" />)}
    </div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Button onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Identidad del sitio</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="set-name">Nombre del sitio</Label>
            <Input
              id="set-name"
              value={form.siteName}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-logo">Logo (URL http(s))</Label>
            <Input
              id="set-logo"
              value={form.logo}
              onChange={(e) => setForm({ ...form, logo: e.target.value })}
              placeholder="https://…"
            />
          </div>
        </CardContent>
      </Card>

      {(["navLinks", "footerLinks"] as const).map((key) => (
        <Card key={key}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{key === "navLinks" ? "Links de navegación" : "Links del footer"}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setForm({ ...form, [key]: [...form[key], { label: "", href: "" }] })}>
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {form[key].length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin links.</p>
            ) : (
              form[key].map((link, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={link.label}
                    placeholder="Label"
                    onChange={(e) => updateLink(key, i, { label: e.target.value })}
                    aria-label={`Label del link ${i + 1}`}
                  />
                  <Input
                    value={link.href}
                    placeholder="/ruta"
                    onChange={(e) => updateLink(key, i, { href: e.target.value })}
                    aria-label={`Href del link ${i + 1}`}
                  />
                  <Button
                    variant="ghost" size="icon" aria-label={`Quitar link ${i + 1}`}
                    onClick={() => setForm({ ...form, [key]: form[key].filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
