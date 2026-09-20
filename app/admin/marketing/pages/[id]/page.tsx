import { notFound } from "next/navigation";
import { getPageById } from "@/lib/db/queries/marketing";
import { listSectionsByPage } from "@/lib/db/queries/marketing";
import { PageEditor } from "@/components/admin/marketing/page-editor";

export default async function EditMarketingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getPageById(id);
  if (!page) notFound();

  const sections = await listSectionsByPage(id);

  return (
    <PageEditor
      page={{
        id: page.id,
        slug: page.slug,
        title: page.title,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        status: page.status,
      }}
      sections={sections.map((s) => ({
        id: s.id,
        blockType: s.blockType,
        config: s.config as Record<string, unknown>,
        sortOrder: s.sortOrder,
      }))}
    />
  );
}
