import { useCallback, useSyncExternalStore } from 'react';

/**
 * Narrow windows and portrait tablets: the preview sits above the controls
 * instead of beside them. The layout keys off the `app--mobile` class this
 * drives, so the query lives here and nowhere in the CSS.
 */
export const MOBILE_LAYOUT_QUERY = '(max-width: 720px), (orientation: portrait) and (max-width: 900px)';

/** Whether a CSS media query matches, kept live as the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
