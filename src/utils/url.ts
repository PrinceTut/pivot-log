// Every internal link on the site must go through this helper. Astro's
// `base` config (astro.config.mjs, spec §2.2) only base-prefixes links it
// generates itself — any hand-written href="/..." string needs to be
// joined with the configured base manually, or it 404s the moment the
// site is deployed to a GitHub Pages subpath (works fine in `npm run dev`,
// which always serves at root, so this bug is invisible locally).
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL; // e.g. '/REPO_NAME/' or '/'
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}` || '/';
}
