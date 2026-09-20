"use client";

import type { BlockFormProps } from "./types";
import { Field, ItemListEditor, asArray } from "./fields";

export function StatsForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <ItemListEditor
        label="Estadísticas"
        items={asArray(config.items)}
        emptyItem={{ value: "", label: "" }}
        fields={[
          { key: "value", label: "Valor", type: "text", placeholder: "10k" },
          { key: "label", label: "Etiqueta", type: "text", placeholder: "Usuarios" },
        ]}
        onChange={(items) => onChange({ ...config, items })}
      />
    </div>
  );
}
