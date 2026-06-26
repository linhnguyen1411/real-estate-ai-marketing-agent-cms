import { Link } from 'react-router-dom';
import { SITE } from '../../seo/siteConfig';

interface SiteLogoProps {
  className?: string;
  imageClassName?: string;
  showName?: boolean;
  showTagline?: boolean;
  nameClassName?: string;
  taglineClassName?: string;
  linkTo?: string | false;
}

export default function SiteLogo({
  className = 'flex shrink-0 items-center gap-2',
  imageClassName = 'h-9 w-auto max-w-[140px] object-contain',
  showName = true,
  showTagline = false,
  nameClassName = 'text-sm font-extrabold tracking-wide text-invest-text',
  taglineClassName = 'text-[10px] font-medium italic leading-tight text-slate-500',
  linkTo = '/',
}: SiteLogoProps) {
  const content = (
    <>
      <img src={SITE.logo} alt={SITE.name} className={imageClassName} width={140} height={36} />
      {showName || showTagline ? (
        <span className="flex min-w-0 flex-col">
          {showName ? <span className={nameClassName}>{SITE.name}</span> : null}
          {showTagline ? <span className={taglineClassName}>{SITE.tagline}</span> : null}
        </span>
      ) : null}
    </>
  );

  if (linkTo === false) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link to={linkTo} className={className}>
      {content}
    </Link>
  );
}
