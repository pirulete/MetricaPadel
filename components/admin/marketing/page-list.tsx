"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAdminError, useAdminFetch } from "@/hooks/use-admin-fetch";

type PageRow = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  sectionCount: number;
  updatedAt: string | Date;
};

export function PageList() {
  const router = useRouter();
  const { data, loading, reload } = useAdminFetch<{ pages: PageRow[] }>("/api/admin/marketing/pages");
  const pages = data?.pages ?? null;
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", status: "draft" as 'draft' | 'published' });

  const handleCreate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      const data = await res.json();
      toast.success("Página creada");
      setCreateOpen(false);
      setForm({ slug: "", title: "", status: "draft" });
      router.push(`/admin/marketing/pages/${data.page.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (page: PageRow) => {
    const next = page.status === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch(`/api/admin/marketing/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success(next === 'published' ? "Página publicada" : "Página despublicada");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar estado");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing/pages/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success("Página eliminada");
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
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
      ))}
    </div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pages</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Nueva página
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Secciones</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!pages || pages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Sin páginas todavía. Crea la primera.
                </TableCell>
              </TableRow>
            ) : (
              pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-medium">{page.title}</TableCell>
                  <TableCell className="font-mono text-sm">{page.slug}</TableCell>
                  <TableCell>
                    <Badge variant={page.status === 'published' ? 'default' : 'secondary'}>
                      {page.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{page.sectionCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/marketing/pages/${page.id}`} aria-label={`Editar ${page.title}`}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(page)}>
                        {page.status === 'published' ? 'Despublicar' : 'Publicar'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(page)} aria-label={`Eliminar ${page.title}`}>
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva página</DialogTitle>
            <DialogDescription>Crea una página de marketing. Queda en borrador hasta publicarla.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pg-title">Título</Label>
              <Input id="pg-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej: Home" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pg-slug">Slug</Label>
              <Input id="pg-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="Ej: home" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={busy || !form.title || !form.slug}>
              {busy ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar página?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.title}» y todas sus secciones. Esta acción no se puede deshacer.
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
