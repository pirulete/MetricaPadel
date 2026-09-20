"use client";

/**
 * Editor de blog post: metadatos + bloques tipográficos del contenido
 * (heading / paragraph / list — sin HTML libre, alineado al schema anti-XSS).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save } from "lucide-react";
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

export type PostContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export type PostEditorProps = {
  post?: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    coverImage: string | null;
    status: "draft" | "published";
    publishedAt: string | Date | null;
    content: PostContentBlock[];
  };
};

export function PostEditor({ post }: PostEditorProps) {
  const router = useRouter();
  const isEditing = Boolean(post);
  const [form, setForm] = useState({
    slug: post?.slug ?? "",
    title: post?.title ?? "",
    excerpt: post?.excerpt ?? "",
    coverImage: post?.coverImage ?? "",
    status: (post?.status ?? "draft") as "draft" | "published",
    publishedAt: post?.publishedAt ? String(post.publishedAt).slice(0, 16) : "",
  });
  const [content, setContent] = useState<PostContentBlock[]>(post?.content ?? []);
  const [busy, setBusy] = useState(false);

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const updateBlock = (i: number, block: PostContentBlock) =>
    setContent((blocks) => blocks.map((b, j) => (j === i ? block : b)));

  const save = async () => {
    setBusy(true);
    const url = isEditing ? `/api/admin/marketing/blog/${post!.id}` : "/api/admin/marketing/blog";
    const method = isEditing ? "PATCH" : "POST";
    try {
      const body: Record<string, unknown> = {
        slug: form.slug,
        title: form.title,
        excerpt: form.excerpt || undefined,
        coverImage: form.coverImage || undefined,
        status: form.status,
        publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,
        content,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await apiError(res));
      const data = await res.json();
      toast.success(isEditing ? "Post actualizado" : "Post creado");
      router.push(`/admin/marketing/blog/${data.post.id}`);
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
            <Link href="/admin/marketing/blog"><ArrowLeft className="h-4 w-4" /> Volver</Link>
          </Button>
          <h1 className="text-2xl font-semibold">{isEditing ? "Editar post" : "Nuevo post"}</h1>
          <Badge variant={form.status === "published" ? "default" : "secondary"}>{form.status}</Badge>
        </div>
        <Button onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Metadatos</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="post-title">Título</Label>
            <Input id="post-title" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-slug">Slug</Label>
            <Input id="post-slug" value={form.slug} onChange={(e) => patch({ slug: e.target.value.toLowerCase() })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="post-excerpt">Extracto</Label>
            <Textarea id="post-excerpt" rows={2} value={form.excerpt} onChange={(e) => patch({ excerpt: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-cover">Imagen de portada (URL http(s))</Label>
            <Input id="post-cover" value={form.coverImage} onChange={(e) => patch({ coverImage: e.target.value })} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-date">Publicado el</Label>
            <Input id="post-date" type="datetime-local" value={form.publishedAt} onChange={(e) => patch({ publishedAt: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-status">Estado</Label>
            <Select value={form.status} onValueChange={(v) => patch({ status: v as "draft" | "published" })}>
              <SelectTrigger id="post-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="published">published</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contenido</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setContent([...content, { type: "paragraph", text: "" }])}>
              <Plus className="h-4 w-4" /> Agregar bloque
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {content.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Sin bloques de contenido todavía.</p>
          ) : (
            content.map((block, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" aria-label="Mover arriba" disabled={i === 0} onClick={() => setContent((b) => { const next = [...b]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next; })}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Mover abajo" disabled={i === content.length - 1} onClick={() => setContent((b) => { const next = [...b]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; return next; })}>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Select
                    value={block.type}
                    onValueChange={(t) => {
                      if (t === "list") updateBlock(i, { type: "list", items: [] });
                      else updateBlock(i, { type: t as "heading" | "paragraph", text: block.type === "list" ? "" : block.text });
                    }}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="heading">Heading</SelectItem>
                      <SelectItem value="paragraph">Paragraph</SelectItem>
                      <SelectItem value="list">Lista</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" aria-label="Eliminar bloque" onClick={() => setContent((b) => b.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {block.type === "list" ? (
                  <div className="space-y-1.5">
                    {block.items.map((item, j) => (
                      <div key={j} className="flex gap-1">
                        <Input value={item} onChange={(e) => updateBlock(i, { ...block, items: block.items.map((it, k) => (k === j ? e.target.value : it)) })} placeholder="Ítem de la lista" />
                        <Button variant="ghost" size="icon" aria-label="Quitar ítem" onClick={() => updateBlock(i, { ...block, items: block.items.filter((_, k) => k !== j) })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => updateBlock(i, { ...block, items: [...block.items, ""] })}>
                      <Plus className="h-4 w-4" /> Agregar ítem
                    </Button>
                  </div>
                ) : (
                  <Textarea
                    rows={block.type === "heading" ? 1 : 4}
                    value={block.text}
                    placeholder={block.type === "heading" ? "Encabezado" : "Párrafo"}
                    onChange={(e) => updateBlock(i, { ...block, text: e.target.value })}
                  />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
