"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
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
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { BlockSkeleton, EmptyState } from "@/components/marketing/block-states"
import { formatPrice } from "@/lib/marketing/format"
import type { productGridSchema } from "@/lib/marketing/schemas"

type ProductGridConfig = z.infer<typeof productGridSchema>

type ProductDto = {
  id: string
  slug: string
  name: string
  description: string | null
  price: string
  images: unknown
  categoryName: string | null
}

const COLUMN_CLASSES: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
}

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && typeof images[0] === "string" ? images[0] : null
}

/**
 * Grid de productos. Componente client: consume la API pública cacheada
 * (`GET /api/public/products`) para poder renderizarse también en el preview
 * admin (mismo renderer en público y admin). Estados: loading / empty / error.
 */
export function ProductGridBlock({
  config,
  className,
}: {
  config: ProductGridConfig
  className?: string
}) {
  const [products, setProducts] = React.useState<ProductDto[] | null>(null)
  const [hasError, setHasError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const params = config.categoryFilter
      ? `?category=${encodeURIComponent(config.categoryFilter)}`
      : ""
    fetch(`/api/public/products${params}`)
      .then((response) => {
        if (!response.ok) throw new Error("fetch failed")
        return response.json() as Promise<{ products: ProductDto[] }>
      })
      .then((body) => {
        if (!cancelled) setProducts(body.products ?? [])
      })
      .catch(() => {
        if (!cancelled) setHasError(true)
      })
    return () => {
      cancelled = true
    }
  }, [config.categoryFilter])

  if (products === null && !hasError) {
    return (
      <Section className={className}>
        <BlockSkeleton />
      </Section>
    )
  }

  const visible = (products ?? []).slice(0, config.limit)

  return (
    <Section className={className}>
      <SectionHeader title={config.title || "Catálogo"} subtitle={config.subtitle} centered />
      {hasError ? (
        <EmptyState
          title="No pudimos cargar los productos"
          hint="Intenta nuevamente en unos minutos."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Sin productos"
          hint="Agrega productos en el admin o configura el filtro por categoría."
        />
      ) : (
        <div className={`grid gap-4 ${COLUMN_CLASSES[config.columns] ?? COLUMN_CLASSES[3]}`}>
          {visible.map((product) => {
            const image = firstImage(product.images)
            return (
              <Card key={product.id} className="gap-3">
                {image && (
                  <AspectRatio
                    ratio={4 / 3}
                    className="relative mx-6 overflow-hidden rounded-md bg-muted/40"
                  >
                    <Image
                      src={image}
                      alt=""
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, 25vw"
                      className="object-cover"
                    />
                  </AspectRatio>
                )}
                <CardHeader className="gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{product.name}</CardTitle>
                    {product.categoryName && <Badge variant="secondary">{product.categoryName}</Badge>}
                  </div>
                  <p className="text-xl font-bold text-foreground">{formatPrice(product.price)}</p>
                </CardHeader>
                <CardContent>
                  {product.description && <CardDescription>{product.description}</CardDescription>}
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/shop/${product.slug}`}>Ver detalle</Link>
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </Section>
  )
}
