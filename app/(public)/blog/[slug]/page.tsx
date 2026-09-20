import Image from "next/image"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCachedPosts } from "@/lib/marketing/cache"
import { postContentSchema } from "@/lib/marketing/schemas"

export const dynamic = "force-dynamic"
import { Section } from "@/components/ui/section"
import { Badge } from "@/components/ui/badge"
import { PostContent } from "@/components/marketing/post-content"
import { formatDate } from "@/lib/marketing/format"

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const post = (await getCachedPosts(100)).find((p) => p.slug === slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
  }
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params
  const post = (await getCachedPosts(100)).find((p) => p.slug === slug)

  if (!post) {
    notFound()
  }

  // jsonb de pg → validado con Zod (render defensivo: contenido legacy inválido → vacío)
  const parsedContent = postContentSchema.safeParse(post.content)
  const content = parsedContent.success ? parsedContent.data : []

  return (
    <Section className="mx-auto max-w-3xl">
      <article className="space-y-6">
        <header className="space-y-3">
          {post.publishedAt && <Badge variant="outline">{formatDate(post.publishedAt)}</Badge>}
          <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">
            {post.title}
          </h1>
          {post.excerpt && <p className="text-lg text-muted-foreground">{post.excerpt}</p>}
        </header>
        {post.coverImage && (
          <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-muted/40">
            <Image
              src={post.coverImage}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        )}
        <PostContent content={content} />
      </article>
    </Section>
  )
}
