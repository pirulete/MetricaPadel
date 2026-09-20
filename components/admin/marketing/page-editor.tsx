"use client";

/**
 * Stack Builder del editor de página: Tabs Editar | Preview.
 * Editar: campos SEO de la página + SectionStack (DnD + config).
 * Preview: render con <BlockRenderer> del draft (showErrors en admin).
 */
import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlockRenderer } from "@/components/marketing/block-renderer";
import { apiError } from "@/lib/marketing/api-error";
import { SectionStack, type SectionRow } from "./section-stack";

export type PageEditorProps = {
  page: {
    id: string;
    slug: string;
    title: string;
    seoTitle: string | null;
    seoDescription: string | null;
    status: "draft" | "published";
  };
  sections: SectionRow[];
};

export function PageEditor({ page: initial, sections: initialSections }: PageEditorProps) {
  const router = useRouter();
  const [page, setPage] = useState(initial);
  const [sections, setSections] = useState<SectionRow[]>(initialSections);
  const [saving, setSaving] = useState(false);

  const savePage = async (status?: "draft" | "published") => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: page.title,
        slug: page.slug,
        seoTitle: page.seoTitle || undefined,
        seoDescription: page.seoDescription || undefined,
      };
      if (status) body.status = status;
      const res = await fetch(`/api/admin/marketing/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await apiError(res));
      const data = await res.json();
      setPage(data.page);
      if (status) {
        toast.success(status === "published" ? "Página publicada" : "Página despublicada");
        router.refresh();
      } else {
        toast.success("Cambios guardados");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/marketing/pages"><ArrowLeft className="h-4 w-4" /> Volver</Link>
          </Button>
          <h1 className="text-2xl font-semibold">Editar página</h1>
          <Badge variant={page.status === "published" ? "default" : "secondary"}>{page.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => savePage()} disabled={saving}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
          <Button
            size="sm"
            onClick={() => savePage(page.status === "published" ? "draft" : "published")}
            disabled={saving}
          >
            {page.status === "published" ? "Despublicar" : "Publicar"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Editar</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">SEO y metadatos</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pg-title">Título</Label>
                <Input id="pg-title" value={page.title} onChange={(e) => setPage({ ...page, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-slug">Slug</Label>
                <Input id="pg-slug" value={page.slug} onChange={(e) => setPage({ ...page, slug: e.target.value.toLowerCase() })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="pg-seo-title">SEO title</Label>
                <Input id="pg-seo-title" value={page.seoTitle ?? ""} onChange={(e) => setPage({ ...page, seoTitle: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="pg-seo-desc">SEO description</Label>
                <Textarea id="pg-seo-desc" rows={2} value={page.seoDescription ?? ""} onChange={(e) => setPage({ ...page, seoDescription: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <SectionStack pageId={page.id} pageSlug={page.slug} sections={sections} onSectionsChange={setSections} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Preview del borrador actual (los bloques inválidos muestran su error).
          </div>
          <div className="space-y-6">
            {sections.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                Sin secciones para previsualizar.
              </div>
            ) : (
              sections.map((section) => (
                <BlockRenderer
                  key={section.id}
                  blockType={section.blockType}
                  config={section.config}
                  showErrors
                  className="rounded-xl border border-border"
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
