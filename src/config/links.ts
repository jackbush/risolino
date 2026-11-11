const MANUAL_URL = `${import.meta.env.BASE_URL}manual/`;

/** Pages of the manual; each is a hash on the manual page. */
export type ManualPage = 'start' | 'page' | 'paper' | 'ink' | 'layers';

export function manualUrl(page: ManualPage): string {
  return `${MANUAL_URL}#${page}`;
}
