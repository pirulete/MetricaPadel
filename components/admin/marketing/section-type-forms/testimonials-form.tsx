"use client";

import type { BlockFormProps } from "./types";
import { Field, ItemListEditor, asArray } from "./fields";

export function TestimonialsForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <ItemListEditor
        label="Testimonios"
        items={asArray(config.items)}
        emptyItem={{ quote: "", author: "", role: "", avatar: "" }}
        fields={[
          { key: "quote", label: "Cita", type: "textarea" },
          { key: "author", label: "Autor", type: "text" },
          { key: "role", label: "Rol", type: "text" },
          { key: "avatar", label: "Avatar (URL)", type: "text", placeholder: "https://…" },
        ]}
        onChange={(items) => onChange({ ...config, items })}
      />
    </div>
  );
}
