"use client";

import type { BlockFormProps } from "./types";
import { Field, ItemListEditor, asArray } from "./fields";

export function FaqForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <ItemListEditor
        label="Preguntas"
        items={asArray(config.items)}
        emptyItem={{ question: "", answer: "" }}
        fields={[
          { key: "question", label: "Pregunta", type: "text" },
          { key: "answer", label: "Respuesta", type: "textarea" },
        ]}
        onChange={(items) => onChange({ ...config, items })}
      />
    </div>
  );
}
