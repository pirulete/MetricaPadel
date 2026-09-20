import { notFound } from "next/navigation";
import { getPostById } from "@/lib/db/queries/marketing";
import { PostEditor, type PostContentBlock } from "@/components/admin/marketing/post-editor";

export default async function EditMarketingPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  return (
    <PostEditor
      post={{
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        coverImage: post.coverImage,
        status: post.status,
        publishedAt: post.publishedAt,
        content: (post.content as unknown as PostContentBlock[]) ?? [],
      }}
    />
  );
}
