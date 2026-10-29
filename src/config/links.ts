const MANUAL_URL = `${import.meta.env.BASE_URL}manual/`;

/** Pages in the manual's settings reference; each is a hash on the manual page. */
export type ManualPage = 'page' | 'paper' | 'ink' | 'layers';

export function manualUrl(page: ManualPage): string {
  return `${MANUAL_URL}#${page}`;
}
