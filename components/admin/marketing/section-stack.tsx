"use client";

/**
 * Canvas de secciones de una página: DnD nativo HTML5 + botones up/down
 * (fallback accesible) + editar/eliminar. Toda mutación va por la API admin.
 */
import { useState } from "react";
import { toast } from "sonner";
import { GripVertical, ChevronUp, ChevronDown, Pencil, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { apiError } from "@/lib/marketing/api-error";
import { SectionEditorDialog, type SectionDraft } from "./section-editor";
import { BLOCK_TYPE_LABELS } from "./section-type-forms";

export type SectionRow = {
  id: string;
  blockType: string;
  config: Record<string, unknown>;
  sortOrder: number;
};

export function SectionStack({
  pageId,
  pageSlug,
  sections,
  onSectionsChange,
}: {
  pageId: string;
  pageSlug: string;
  sections: SectionRow[];
  onSectionsChange: (next: SectionRow[]) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SectionDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const saveSection = async (draft: SectionDraft) => {
    setBusy(true);
    try {
      if (draft.id) {
        const res = await fetch(`/api/admin/marketing/pages/${pageId}/sections/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockType: draft.blockType, config: draft.config }),
        });
        if (!res.ok) throw new Error(await apiError(res));
        const data = await res.json();
        onSectionsChange(
          sections.map((s) => (s.id === data.section.id ? data.section : s))
        );
        toast.success("Sección actualizada");
      } else {
        const res = await fetch(`/api/admin/marketing/pages/${pageId}/sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockType: draft.blockType, config: draft.config }),
        });
        if (!res.ok) throw new Error(await apiError(res));
        const data = await res.json();
        onSectionsChange([...sections, data.section]);
        toast.success("Sección agregada");
      }
      setEditorOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar sección");
    } finally {
      setBusy(false);
    }
  };

  const reorder = async (ordered: SectionRow[]) => {
    onSectionsChange(ordered); // optimistic
    try {
      const res = await fetch(`/api/admin/marketing/pages/${pageId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds: ordered.map((s) => s.id) }),
      });
      if (!res.ok) {
        onSectionsChange(sections);
        throw new Error(await apiError(res));
      }
      const data = await res.json();
      onSectionsChange(data.sections);
      toast.success("Orden guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al reordenar");
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    void reorder(next);
  };

  const remove = async (section: SectionRow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing/pages/${pageId}/sections/${section.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await apiError(res));
      onSectionsChange(sections.filter((s) => s.id !== section.id));
      setDeleteTarget(null);
      toast.success("Sección eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Secciones ({sections.length})</h3>
        <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }}>
          <Plus className="h-4 w-4" /> Agregar sección
        </Button>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
          Esta página no tiene secciones. Agrega un hero para empezar.
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map((section, index) => (
            <Card
              key={section.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex === null || dragIndex === index) return;
                const next = [...sections];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(index, 0, moved);
                setDragIndex(null);
                void reorder(next);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={dragIndex === index ? "opacity-50" : ""}
            >
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                  <span className="truncate text-sm font-medium">
                    {BLOCK_TYPE_LABELS[section.blockType as keyof typeof BLOCK_TYPE_LABELS] ?? section.blockType}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs">#{index + 1}</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label="Mover arriba" onClick={() => move(index, -1)} disabled={index === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Mover abajo" onClick={() => move(index, 1)} disabled={index === sections.length - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" aria-label="Editar sección"
                    onClick={() => { setEditing({ id: section.id, blockType: section.blockType, config: section.config }); setEditorOpen(true); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Eliminar sección" onClick={() => setDeleteTarget(section)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SectionEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing}
        onSave={saveSection}
        saving={busy}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sección?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará esta sección de «{pageSlug}». Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && void remove(deleteTarget)} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
