// One page per hash (#graphic, #mushroom, #page…), named by each .page's id. Without this script every
// page shows, one after another, and the sidebar links jump between them.
const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
// The script shows pages by hash itself, so the ids move to data-page: with no element to jump to, the
// browser leaves the scroll at the top, where the contents are.
for (const page of pages) {
  page.dataset.page = page.id;
  page.removeAttribute('id');
}
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.side a[href^="#"]'));
const side = document.querySelector<HTMLElement>('.side')!;
const toggle = document.querySelector<HTMLButtonElement>('.side-toggle')!;

// On a phone the contents fold away behind a button (manual.css hides it wider).
function setContentsOpen(open: boolean): void {
  side.classList.toggle('side--open', open);
  toggle.setAttribute('aria-expanded', String(open));
}
toggle.addEventListener('click', () => setContentsOpen(!side.classList.contains('side--open')));

function show(scrollToTop: boolean): void {
  const id = location.hash.slice(1);
  const current = pages.find((page) => page.dataset.page === id) ?? pages[0];

  for (const page of pages) page.hidden = page !== current;
  for (const link of links) {
    if (link.hash === `#${current.dataset.page}`) link.setAttribute('aria-current', 'page');
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
window.addEventListener('hashchange', () => {
  setContentsOpen(false);
  show(true);
});
