"use client"

import * as React from "react"
import Link from "next/link"
import type { z } from "zod"

import { Section, SectionHeader } from "@/components/ui/section"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BlockSkeleton, EmptyState } from "@/components/marketing/block-states"
import { formatDate } from "@/lib/marketing/format"
import type { blogListSchema } from "@/lib/marketing/schemas"

type BlogListConfig = z.infer<typeof blogListSchema>

type PostDto = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  publishedAt: string | null
}

const COLUMN_CLASSES: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "md:grid-cols-3",
}

/**
 * Listado de posts. Componente client: consume la API pública cacheada
 * (`GET /api/public/posts`) para poder renderizarse también en el preview
 * admin (mismo renderer en público y admin). Estados: loading / empty / error.
 */
export function BlogListBlock({
  config,
  className,
}: {
  config: BlogListConfig
  className?: string
}) {
  const [posts, setPosts] = React.useState<PostDto[] | null>(null)
  const [hasError, setHasError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetch(`/api/public/posts?limit=${config.limit}`)
      .then((response) => {
        if (!response.ok) throw new Error("fetch failed")
        return response.json() as Promise<{ posts: PostDto[] }>
      })
      .then((body) => {
        if (!cancelled) setPosts(body.posts ?? [])
      })
      .catch(() => {
        if (!cancelled) setHasError(true)
      })
    return () => {
      cancelled = true
    }
  }, [config.limit])

  if (posts === null && !hasError) {
    return (
      <Section className={className}>
        <BlockSkeleton />
      </Section>
    )
  }

  return (
    <Section className={className}>
      <SectionHeader title={config.title || "Blog"} subtitle={config.subtitle} centered />
      {hasError ? (
        <EmptyState
          title="No pudimos cargar los posts"
          hint="Intenta nuevamente en unos minutos."
        />
      ) : (posts ?? []).length === 0 ? (
        <EmptyState title="Sin posts" hint="Publica tu primer artículo desde el admin." />
      ) : (
        <div className={`grid gap-4 ${COLUMN_CLASSES[config.columns] ?? COLUMN_CLASSES[3]}`}>
          {posts!.map((post) => (
            <Card key={post.id} className="gap-3">
              <CardHeader className="gap-1">
                {post.publishedAt && (
                  <Badge variant="outline" className="w-fit">
                    {formatDate(post.publishedAt)}
                  </Badge>
                )}
                <CardTitle className="text-lg">{post.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {post.excerpt && <CardDescription>{post.excerpt}</CardDescription>}
              </CardContent>
              <CardFooter>
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link href={`/blog/${post.slug}`}>Leer más →</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </Section>
  )
}
