"use client";

import type { BlockFormProps } from "./types";
import { Field } from "./fields";

export function ContactFormBlockForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <Field spec={{ key: "successMessage", label: "Mensaje de éxito", type: "text" }} value={config.successMessage} onChange={(v) => onChange({ ...config, successMessage: v })} />
    </div>
  );
}
