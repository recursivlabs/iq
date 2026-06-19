import Home from '../../IqApp';

export default function BlogArticlePage({ params }: { params: { slug: string } }) {
  return <Home initialView="blog" initialBlogSlug={params.slug} />;
}
