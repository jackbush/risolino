import { manualUrl, ManualPage } from '../config/links';

interface ManualLinkProps {
  page: ManualPage;
  /** What the manual explains, e.g. "Paper settings"; names the link for screen readers. */
  topic: string;
}

/** A small (i) that opens one page of the settings manual in a new tab. */
export function ManualLink({ page, topic }: ManualLinkProps) {
  const label = `${topic} manual (opens in a new tab)`;
  return (
    <a
      className="manual-link"
      href={manualUrl(page)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 7.2v4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="4.6" r="1.15" fill="currentColor" />
      </svg>
    </a>
  );
}
