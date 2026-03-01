import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page';
import { notFound, redirect } from 'next/navigation';
import { source } from '@/lib/source';
import defaultMdxComponents from 'fumadocs-ui/mdx';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;

  // /docs with no slug → redirect to introduction
  if (!slug || slug.length === 0) {
    redirect('/docs/guides/introduction');
  }

  const page = source.getPage(slug);
  if (!page) notFound();

  const pageData = page.data as typeof page.data & {
    body: React.ComponentType<{ components?: Record<string, unknown> }>;
    toc?: any;
    full?: boolean;
  };
  const MDX = pageData.body;

  return (
    <DocsPage toc={pageData.toc} full={pageData.full}>
      <DocsTitle>{pageData.title}</DocsTitle>
      <DocsDescription>{pageData.description}</DocsDescription>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return {
    title: `${page.data.title} — Mission Control Docs`,
    description: page.data.description,
  };
}
