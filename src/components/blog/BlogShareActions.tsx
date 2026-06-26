import { BlogShareButton } from './BlogShareModal';

interface BlogShareActionsProps {
  slug: string;
  title?: string;
  className?: string;
}

export default function BlogShareActions({ slug, title, className = '' }: BlogShareActionsProps) {
  return <BlogShareButton slug={slug} title={title} className={className} />;
}

export { BlogShareButton };
