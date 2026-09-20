import Image from "next/image"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCachedProducts } from "@/lib/marketing/cache"
import { Section } from "@/components/ui/section"

export const dynamic = "force-dynamic"
import { Badge } from "@/components/ui/badge"
import { formatPrice } from "@/lib/marketing/format"

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const product = (await getCachedProducts()).find((p) => p.slug === slug)
  if (!product) return {}
  return {
    title: product.name,
    description: product.description ?? undefined,
  }
}

export default async function ShopProductPage({ params }: Params) {
  const { slug } = await params
  const product = (await getCachedProducts()).find((p) => p.slug === slug)

  if (!product) {
    notFound()
  }

  const images = Array.isArray(product.images) ? (product.images as string[]) : []
  const coverImage = images[0] ?? null

  return (
    <Section>
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
        {coverImage ? (
          <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/40">
            <Image
              src={coverImage}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 512px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
            [ sin imagen ]
          </div>
        )}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{product.name}</h1>
            {product.categoryName && <Badge variant="secondary">{product.categoryName}</Badge>}
          </div>
          <p className="text-3xl font-bold text-foreground">{formatPrice(product.price)}</p>
          {product.description && (
            <p className="text-muted-foreground">{product.description}</p>
          )}
        </div>
      </div>
    </Section>
  )
}
