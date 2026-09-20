"use client";

import type { BlockFormProps } from "./types";
import { Field } from "./fields";

export function ProductGridForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <Field spec={{ key: "categoryFilter", label: "Filtrar por categoría (slug)", type: "text" }} value={config.categoryFilter} onChange={(v) => onChange({ ...config, categoryFilter: v })} />
      <Field spec={{ key: "limit", label: "Límite", type: "number" }} value={config.limit} onChange={(v) => onChange({ ...config, limit: v })} />
      <Field spec={{ key: "columns", label: "Columnas", type: "number" }} value={config.columns} onChange={(v) => onChange({ ...config, columns: v })} />
    </div>
  );
}
