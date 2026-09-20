"use client";

/**
 * Editor de producto: slug, nombre, descripción, precio (string decimal),
 * imágenes (URLs separadas por coma), categoría, estado y orden.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiError } from "@/lib/marketing/api-error";

type CategoryOption = { id: string; name: string; slug: string };

export type ProductEditorProps = {
  product?: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    price: string;
    compareAtPrice: string | null;
    images: string[];
    categoryId: string | null;
    status: "draft" | "published";
    sortOrder: number;
  };
};

export function ProductEditor({ product }: ProductEditorProps) {
  const router = useRouter();
  const isEditing = Boolean(product);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [form, setForm] = useState({
    slug: product?.slug ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price ?? "",
    compareAtPrice: product?.compareAtPrice ?? "",
    images: (product?.images ?? []).join(", "),
    categoryId: product?.categoryId ?? "",
    status: (product?.status ?? "draft") as "draft" | "published",
    sortOrder: product?.sortOrder ?? 0,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/marketing/categories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const save = async () => {
    setBusy(true);
    const url = isEditing ? `/api/admin/marketing/products/${product!.id}` : "/api/admin/marketing/products";
    const method = isEditing ? "PATCH" : "POST";
    try {
      const body: Record<string, unknown> = {
        slug: form.slug,
        name: form.name,
        description: form.description || undefined,
        price: form.price,
        compareAtPrice: form.compareAtPrice || null,
        images: form.images.split(",").map((s) => s.trim()).filter(Boolean),
        categoryId: form.categoryId || null,
        status: form.status,
        sortOrder: form.sortOrder,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await apiError(res));
      const data = await res.json();
      toast.success(isEditing ? "Producto actualizado" : "Producto creado");
      router.push(`/admin/marketing/products/${data.product.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/marketing/products"><ArrowLeft className="h-4 w-4" /> Volver</Link>
          </Button>
          <h1 className="text-2xl font-semibold">{isEditing ? "Editar producto" : "Nuevo producto"}</h1>
          <Badge variant={form.status === "published" ? "default" : "secondary"}>{form.status}</Badge>
        </div>
        <Button onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Datos del producto</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="prod-name">Nombre</Label>
            <Input id="prod-name" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-slug">Slug</Label>
            <Input id="prod-slug" value={form.slug} onChange={(e) => patch({ slug: e.target.value.toLowerCase() })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="prod-desc">Descripción</Label>
            <Textarea id="prod-desc" rows={3} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-price">Precio</Label>
            <Input id="prod-price" inputMode="decimal" value={form.price} onChange={(e) => patch({ price: e.target.value })} placeholder="29.99" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-compare">Precio tachado (opcional)</Label>
            <Input id="prod-compare" inputMode="decimal" value={form.compareAtPrice} onChange={(e) => patch({ compareAtPrice: e.target.value })} placeholder="39.99" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="prod-images">Imágenes (URLs separadas por coma)</Label>
            <Textarea id="prod-images" rows={2} value={form.images} onChange={(e) => patch({ images: e.target.value })} placeholder="https://…, https://…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-cat">Categoría</Label>
            <Select value={form.categoryId} onValueChange={(v) => patch({ categoryId: v })}>
              <SelectTrigger id="prod-cat"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin categoría</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-status">Estado</Label>
            <Select value={form.status} onValueChange={(v) => patch({ status: v as "draft" | "published" })}>
              <SelectTrigger id="prod-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="published">published</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-order">Orden</Label>
            <Input id="prod-order" type="number" value={form.sortOrder} onChange={(e) => patch({ sortOrder: Number(e.target.value) })} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
