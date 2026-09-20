import Link from "next/link"
import type { Metadata } from "next"

import { getCachedPosts } from "@/lib/marketing/cache"
import { Section, SectionHeader } from "@/components/ui/section"

export const dynamic = "force-dynamic"
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
import { EmptyState } from "@/components/marketing/block-states"
import { formatDate } from "@/lib/marketing/format"

export const metadata: Metadata = {
  title: "Blog",
  description: "Últimas publicaciones",
}

export default async function BlogPage() {
  let posts: Awaited<ReturnType<typeof getCachedPosts>> = []
  try {
    posts = await getCachedPosts(20)
  } catch {
    // DB unreachable — render empty state
  }

  return (
    <Section>
      <SectionHeader title="Blog" subtitle="Últimas publicaciones." centered />
      {posts.length === 0 ? (
        <EmptyState title="Sin posts" hint="Publica tu primer artículo desde el admin." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
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
