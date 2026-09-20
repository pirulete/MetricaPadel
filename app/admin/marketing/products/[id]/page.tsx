import { notFound } from "next/navigation";
import { getProductById } from "@/lib/db/queries/marketing";
import { ProductEditor } from "@/components/admin/marketing/product-editor";

export default async function EditMarketingProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

  return (
    <ProductEditor
      product={{
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        images: Array.isArray(product.images) ? product.images.map(String) : [],
        categoryId: product.categoryId,
        status: product.status,
        sortOrder: product.sortOrder,
      }}
    />
  );
}
