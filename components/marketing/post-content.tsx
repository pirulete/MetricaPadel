import type { z } from "zod"

import type { postContentSchema } from "@/lib/marketing/schemas"

type PostContentValue = z.infer<typeof postContentSchema>

/**
 * Render del contenido tipográfico de un post (heading/paragraph/list).
 * Sin HTML libre: cada bloque es tipado por Zod → sin riesgo XSS.
 */
export function PostContent({ content }: { content: PostContentValue }) {
  return (
    <div className="space-y-4">
      {content.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <h2 key={index} className="text-2xl font-bold tracking-tight text-foreground">
                {block.text}
              </h2>
            )
          case "paragraph":
            return (
              <p key={index} className="leading-relaxed text-muted-foreground">
                {block.text}
              </p>
            )
          case "list":
            return (
              <ul key={index} className="list-disc space-y-1 pl-5 text-muted-foreground">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
