"use client";

import type { BlockFormProps } from "./types";
import { Field, ItemListEditor, asArray, asString } from "./fields";

export function FeaturesGridForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <ItemListEditor
        label="Features"
        items={asArray(config.features)}
        emptyItem={{ icon: "", title: "", description: "" }}
        fields={[
          { key: "icon", label: "Icono", type: "text", placeholder: "Ej: 🚀 o nombre lucide" },
          { key: "title", label: "Título", type: "text" },
          { key: "description", label: "Descripción", type: "textarea" },
        ]}
        onChange={(features) => onChange({ ...config, features })}
      />
    </div>
  );
}
