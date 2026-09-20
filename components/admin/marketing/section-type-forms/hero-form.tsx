"use client";

import type { BlockFormProps } from "./types";
import { Field, ItemListEditor, asArray, asString } from "./fields";

export function HeroForm({ config, onChange }: BlockFormProps) {
  return (
    <div className="space-y-4">
      <Field spec={{ key: "title", label: "Título", type: "text" }} value={config.title} onChange={(v) => onChange({ ...config, title: v })} />
      <Field spec={{ key: "subtitle", label: "Subtítulo", type: "textarea" }} value={config.subtitle} onChange={(v) => onChange({ ...config, subtitle: v })} />
      <Field spec={{ key: "image", label: "Imagen (URL http(s))", type: "text", placeholder: "https://…" }} value={config.image} onChange={(v) => onChange({ ...config, image: v })} />
      <ItemListEditor
        label="Botones (CTAs)"
        items={asArray(config.ctas)}
        emptyItem={{ label: "", href: "", variant: "default" }}
        fields={[
          { key: "label", label: "Label", type: "text" },
          { key: "href", label: "Href", type: "text", placeholder: "/ruta" },
          {
            key: "variant",
            label: "Variant",
            type: "select",
            options: ["default", "outline", "secondary", "ghost", "link"].map((v) => ({ value: v, label: v })),
          },
        ]}
        onChange={(ctas) => onChange({ ...config, ctas })}
      />
    </div>
  );
}
