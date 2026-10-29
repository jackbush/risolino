// One page per hash (#graphic, #mushroom, #page…), named by each .page's id. Without this script every
// page shows, one after another, and the sidebar links jump between them.
const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.side a[href^="#"]'));

function show(scrollToTop: boolean): void {
  const id = location.hash.slice(1);
  const current = pages.find((page) => page.id === id) ?? pages[0];

  for (const page of pages) page.hidden = page !== current;
  for (const link of links) {
    if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${current.dataset.title} · Risolino manual`;
  if (scrollToTop) {
    window.scrollTo(0, 0);
    // Screen readers start reading from the new page's heading.
    current.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }
}

show(false);
window.addEventListener('hashchange', () => show(true));
