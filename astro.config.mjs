import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://www.heavensdoor1.top/',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: { cacheDir: `node_modules/.vite-brick-${process.env.NODE_ENV ?? 'development'}` },
});
