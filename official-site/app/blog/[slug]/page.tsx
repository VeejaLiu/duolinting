import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPost, blogPosts, blogPostPath } from "../../content/blog-posts";
import { localizedAlternates } from "../../content/site-url";
import { BlogPostView } from "../blog-post";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};

  const t = post.locales.zh;
  const path = blogPostPath(slug, "zh");

  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: localizedAlternates(path, "zh"),
    openGraph: {
      type: "article",
      locale: "zh_CN",
      siteName: "DuolinTing 多邻听",
      title: t.ogTitle,
      description: t.ogDescription,
      url: path,
      images: [{ url: post.ogImage, width: 1200, height: 630, alt: t.ogAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.ogTitle,
      description: t.ogDescription,
      images: [post.ogImage],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  return <BlogPostView post={post} locale="zh" />;
}
