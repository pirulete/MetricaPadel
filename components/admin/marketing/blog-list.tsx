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

type PostRow = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  publishedAt: string | Date | null;
  updatedAt: string | Date;
};

export function BlogList() {
  const { data, loading, reload } = useAdminFetch<{ posts: PostRow[] }>("/api/admin/marketing/blog");
  const posts = data?.posts ?? null;
  const [deleteTarget, setDeleteTarget] = useState<PostRow | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleStatus = async (post: PostRow) => {
    const next = post.status === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch(`/api/admin/marketing/blog/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success(next === 'published' ? "Post publicado" : "Post despublicado");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar estado");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing/blog/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success("Post eliminado");
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
        <h1 className="text-2xl font-semibold">Blog</h1>
        <Button asChild>
          <Link href="/admin/marketing/blog/new"><Plus className="h-4 w-4" /> Nuevo post</Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!posts || posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Sin posts todavía.</TableCell>
              </TableRow>
            ) : (
              posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium">{post.title}</TableCell>
                  <TableCell className="font-mono text-sm">{post.slug}</TableCell>
                  <TableCell>
                    <Badge variant={post.status === 'published' ? 'default' : 'secondary'}>{post.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/marketing/blog/${post.id}`} aria-label={`Editar ${post.title}`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(post)}>
                        {post.status === 'published' ? 'Despublicar' : 'Publicar'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(post)} aria-label={`Eliminar ${post.title}`}>
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
            <AlertDialogTitle>¿Eliminar post?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará «{deleteTarget?.title}». Esta acción no se puede deshacer.</AlertDialogDescription>
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
