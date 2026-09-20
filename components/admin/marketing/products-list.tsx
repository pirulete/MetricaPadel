"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { parseAdminError, useAdminFetch } from "@/hooks/use-admin-fetch";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price: string;
  status: 'draft' | 'published';
  categoryName: string | null;
};

export function ProductsList() {
  const { data, loading, reload } = useAdminFetch<{ products: ProductRow[] }>("/api/admin/marketing/products");
  const products = data?.products ?? null;
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleStatus = async (product: ProductRow) => {
    const next = product.status === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch(`/api/admin/marketing/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success(next === 'published' ? "Producto publicado" : "Producto despublicado");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar estado");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing/products/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success("Producto eliminado");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}
    </div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button asChild>
          <Link href="/admin/marketing/products/new"><Plus className="h-4 w-4" /> Nuevo producto</Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!products || products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sin productos todavía.</TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-sm">{product.slug}</TableCell>
                  <TableCell>${product.price}</TableCell>
                  <TableCell>{product.categoryName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={product.status === 'published' ? 'default' : 'secondary'}>{product.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/marketing/products/${product.id}`} aria-label={`Editar ${product.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(product)}>
                        {product.status === 'published' ? 'Despublicar' : 'Publicar'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(product)} aria-label={`Eliminar ${product.name}`}>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará «{deleteTarget?.name}». Esta acción no se puede deshacer.</AlertDialogDescription>
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
