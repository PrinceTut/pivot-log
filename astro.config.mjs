// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages project-site config (spec §2.2). Placeholder values —
// swap 'USERNAME' and 'REPO_NAME' for the real GitHub username and repo
// once we push this for real, and revisit if/when a custom domain is
// attached (base goes back to '/', site becomes the custom domain).
export default defineConfig({
  site: 'https://USERNAME.github.io',
  base: '/REPO_NAME',
});
