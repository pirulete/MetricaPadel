import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCachedPage } from "@/lib/marketing/cache"
import { isReservedSlug } from "@/lib/marketing/reserved-slugs"
import { BlockRenderer } from "@/components/marketing/block-renderer"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  if (isReservedSlug(slug)) return {}
  let data = null
  try {
    data = await getCachedPage(slug)
  } catch {
    // DB unreachable — return empty metadata
  }
  if (!data) return {}
  return {
    title: data.page.seoTitle || data.page.title,
    description: data.page.seoDescription ?? undefined,
  }
}

export default async function DynamicPage({ params }: Params) {
  const { slug } = await params

  if (isReservedSlug(slug)) {
    notFound()
  }

  let data = null
  try {
    data = await getCachedPage(slug)
  } catch {
    // DB unreachable — show notFound
  }
  if (!data) {
    notFound()
  }

  return (
    <div>
      {data.sections.map((section) => (
        <BlockRenderer key={section.id} blockType={section.blockType} config={section.config} />
      ))}
    </div>
  )
}
