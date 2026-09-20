import Link from "next/link"
import type { Metadata } from "next"

import { getCachedProducts } from "@/lib/marketing/cache"
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
import { formatPrice } from "@/lib/marketing/format"

export const metadata: Metadata = {
  title: "Tienda",
  description: "Catálogo de productos",
}

export default async function ShopPage() {
  const products = await getCachedProducts()

  return (
    <Section>
      <SectionHeader title="Tienda" subtitle="Nuestros productos y extensiones." centered />
      {products.length === 0 ? (
        <EmptyState title="Sin productos" hint="Agrega productos en el admin." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <Card key={product.id} className="gap-3">
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
          ))}
        </div>
      )}
    </Section>
  )
}
