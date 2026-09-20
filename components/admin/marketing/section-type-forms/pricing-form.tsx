"use client";

import type { BlockFormProps } from "./types";
import { Field, ItemListEditor, asArray } from "./fields";

export function PricingForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <ItemListEditor
        label="Planes"
        items={asArray(config.plans)}
        emptyItem={{ name: "", price: "", period: "", description: "", features: [], ctaLabel: "", ctaHref: "", highlighted: false }}
        fields={[
          { key: "name", label: "Nombre", type: "text" },
          { key: "price", label: "Precio", type: "text", placeholder: "29.99" },
          { key: "period", label: "Periodo", type: "text", placeholder: "mes" },
          { key: "description", label: "Descripción", type: "textarea" },
          { key: "features", label: "Características", type: "lines", placeholder: "Una por línea" },
          { key: "ctaLabel", label: "Label CTA", type: "text" },
          { key: "ctaHref", label: "Href CTA", type: "text", placeholder: "/ruta" },
          { key: "highlighted", label: "Destacado", type: "switch" },
        ]}
        onChange={(plans) => onChange({ ...config, plans })}
      />
    </div>
  );
}
