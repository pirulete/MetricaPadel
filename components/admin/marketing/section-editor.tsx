"use client";

/**
 * Editor de una sección: selector de blockType + form dinámico por tipo.
 * Se usa tanto para crear (config default) como para editar (config existente).
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  BLOCK_TYPES, BLOCK_TYPE_LABELS, SectionTypeForm, defaultBlockConfig,
} from "./section-type-forms";

export type SectionDraft = {
  id?: string;
  blockType: string;
  config: Record<string, unknown>;
};

export function SectionEditorDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SectionDraft | null;
  onSave: (draft: SectionDraft) => void;
  saving?: boolean;
}) {
  const [blockType, setBlockType] = useState<string>("hero");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [prevInitial, setPrevInitial] = useState(initial);

  // Ajusta el estado cuando cambia el draft (abrir el dialog o editar otra sección).
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    if (open) {
      const bt = initial?.blockType ?? "hero";
      setBlockType(bt);
      setConfig(initial?.config ?? defaultBlockConfig(bt as Parameters<typeof defaultBlockConfig>[0]));
    }
  }

  const isEditing = Boolean(initial?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar sección" : "Nueva sección"}</DialogTitle>
          <DialogDescription>
            Configura el bloque. La validación final ocurre al guardar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="section-blocktype">Tipo de bloque</Label>
            <Select value={blockType} onValueChange={(v) => setBlockType(v)}>
              <SelectTrigger id="section-blocktype">
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_TYPES.map((bt) => (
                  <SelectItem key={bt} value={bt}>{BLOCK_TYPE_LABELS[bt]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SectionTypeForm
            blockType={blockType as Parameters<typeof defaultBlockConfig>[0]}
            config={config}
            onChange={setConfig}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={() => onSave({ id: initial?.id, blockType, config })} disabled={saving}>
            {saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Agregar sección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
