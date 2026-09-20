"use client";

import type { BlockFormProps } from "./types";
import { Field } from "./fields";

export function CtaBannerForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <Field spec={{ key: "buttonLabel", label: "Label del botón", type: "text" }} value={config.buttonLabel} onChange={(v) => onChange({ ...config, buttonLabel: v })} />
      <Field spec={{ key: "buttonHref", label: "Href del botón", type: "text", placeholder: "/ruta" }} value={config.buttonHref} onChange={(v) => onChange({ ...config, buttonHref: v })} />
    </div>
  );
}
