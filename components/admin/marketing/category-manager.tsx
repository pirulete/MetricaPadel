"use client";

/**
 * Gestor CRUD de categorías: listado con productCount + form crear/editar + delete.
 * Al borrar, los productos quedan sin categoría (FK SET NULL server-side).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { parseAdminError, useAdminFetch } from "@/hooks/use-admin-fetch";

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  productCount: number;
};

const EMPTY_FORM = { slug: "", name: "", sortOrder: 0 };

export function CategoryManager() {
  const { data, loading, reload } = useAdminFetch<{ categories: CategoryRow[] }>("/api/admin/marketing/categories");
  const categories = data?.categories ?? null;
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const save = async () => {
    setBusy(true);
    const isEdit = Boolean(editing);
    const url = isEdit ? `/api/admin/marketing/categories/${editing!.id}` : "/api/admin/marketing/categories";
    try {
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success(isEdit ? "Categoría actualizada" : "Categoría creada");
      setEditing(null);
      setForm(EMPTY_FORM);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing/categories/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success("Categoría eliminada (productos quedan sin categoría)");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        <Button onClick={() => { setEditing(null); setForm(EMPTY_FORM); }}>
          <Plus className="h-4 w-4" /> Nueva categoría
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            className="grid gap-4 md:grid-cols-4"
            onSubmit={(e) => { e.preventDefault(); void save(); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nombre</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input id="cat-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-order">Orden</Label>
              <Input id="cat-order" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busy || !form.name || !form.slug}>
                <Save className="h-4 w-4" /> {editing ? "Actualizar" : "Crear"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!categories || categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sin categorías.</TableCell>
                </TableRow>
              ) : (
                categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="font-mono text-sm">{category.slug}</TableCell>
                    <TableCell>{category.sortOrder}</TableCell>
                    <TableCell><Badge variant="secondary">{category.productCount}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="sm" aria-label={`Editar ${category.name}`}
                          onClick={() => { setEditing(category); setForm({ slug: category.slug, name: category.name, sortOrder: category.sortOrder }); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={`Eliminar ${category.name}`} onClick={() => setDeleteTarget(category)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.name}». Los productos de esta categoría quedarán sin categoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
              {busy ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
