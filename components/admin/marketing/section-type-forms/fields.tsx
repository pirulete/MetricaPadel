"use client";

/**
 * Primitivas de edición compartidas por los forms de block types del admin.
 * Cada campo muta la config (Record<string, unknown>) de la sección.
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type FieldSpec = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "switch" | "lines" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
};

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function asNumber(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

export function asArray<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function Field({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  switch (spec.type) {
    case "textarea":
      return (
        <div className="space-y-1.5">
          <Label>{spec.label}</Label>
          <Textarea
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={spec.placeholder}
            rows={3}
          />
        </div>
      );
    case "number":
      return (
        <div className="space-y-1.5">
          <Label>{spec.label}</Label>
          <Input
            type="number"
            value={asNumber(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder={spec.placeholder}
          />
        </div>
      );
    case "switch":
      return (
        <div className="flex items-center justify-between gap-2">
          <Label>{spec.label}</Label>
          <Switch checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      );
    case "lines":
      return (
        <div className="space-y-1.5">
          <Label>{spec.label}</Label>
          <div className="space-y-1.5">
            {asArray<string>(value).map((line, i) => (
              <div key={i} className="flex gap-1">
                <Input
                  value={line}
                  onChange={(e) => {
                    const next = [...asArray<string>(value)];
                    next[i] = e.target.value;
                    onChange(next);
                  }}
                  placeholder={spec.placeholder}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${spec.label} ${i + 1}`}
                  onClick={() => onChange(asArray<string>(value).filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...asArray<string>(value), ""])}
            >
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        </div>
      );
    case "select":
      return (
        <div className="space-y-1.5">
          <Label>{spec.label}</Label>
          <Select value={asString(value)} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={spec.placeholder ?? "Seleccionar"} />
            </SelectTrigger>
            <SelectContent>
              {(spec.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    default:
      return (
        <div className="space-y-1.5">
          <Label>{spec.label}</Label>
          <Input
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={spec.placeholder}
          />
        </div>
      );
  }
}

/**
 * Editor genérico de array de objetos (items de features, planes, FAQ, etc.).
 * Cada item se renderiza como Card con los fields indicados.
 */
export function ItemListEditor({
  label,
  items,
  emptyItem,
  fields,
  onChange,
}: {
  label: string;
  items: Record<string, unknown>[];
  emptyItem: Record<string, unknown>;
  fields: FieldSpec[];
  onChange: (next: Record<string, unknown>[]) => void;
}) {
  const updateItem = (index: number, patch: Record<string, unknown>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, { ...emptyItem }])}
        >
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Sin elementos.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="space-y-2 rounded-md bg-muted/40 p-3">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${label} ${i + 1}`}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              {fields.map((spec) => (
                <Field key={spec.key} spec={spec} value={item[spec.key]} onChange={(v) => updateItem(i, { [spec.key]: v })} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { Field };
