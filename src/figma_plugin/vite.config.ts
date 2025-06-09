// vite.config.ts
import { defineConfig, Plugin } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

function inlineUiAssets(): Plugin {
  return {
    name: 'inline-ui-assets',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      // 1️⃣  pick the emitted HTML file
      const htmlAsset = Object.values(bundle).find(
        (f: any) => f.type === 'asset' && f.fileName.endsWith('.html')
      ) as any;
      if (!htmlAsset) return;

      let html = String(htmlAsset.source);

      /* ---- inline <script … src="…"> ---- */
      html = html.replace(
        /<script\b([^>]*?)\bsrc="([^"]+)"[^>]*><\/script>/g,
        (_full, attrs, src) => {
          // normalise: strip leading “/” and any folders
          const fileName = src.replace(/^\/+/, '').split('/').pop()!;
          const chunk = Object.values(bundle).find(
            (f: any) => f.type === 'chunk' && f.fileName === fileName
          ) as any;

          if (chunk) {
            delete bundle[chunk.fileName]; // drop ui.js
            return `<script${attrs}>${chunk.code}</script>`;
          }
          return _full; // leave untouched if not found
        }
      );

      /* ---- inline <link rel="stylesheet" href="…"> ---- */
      html = html.replace(
        /<link\b[^>]*rel=["']stylesheet["'][^>]*href="([^"]+)"[^>]*>/g,
        (_full, href) => {
          const fileName = href.replace(/^\/+/, '').split('/').pop()!;
          const cssAsset = Object.values(bundle).find(
            (f: any) => f.type === 'asset' && f.fileName === fileName
          ) as any;

          if (cssAsset) {
            delete bundle[cssAsset.fileName];
            return `<style>${cssAsset.source}</style>`;
          }
          return _full;
        }
      );

      htmlAsset.source = html;
    },
  };
}

export default defineConfig({
  // everything we author lives in /src
  base: './',
  root: resolve(__dirname, 'src'),

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: '', // avoid /assets sub-dir
    target: 'es2017', // Figma runtime supports ES2017

    rollupOptions: {
      /** Two explicit entrypoints */
      input: {
        code: resolve(__dirname, 'src/code.ts'),
        ui: resolve(__dirname, 'src/ui.html'),
      },

      /** Stable filenames */
      output: {
        format: 'cjs', // Figma runtime = CommonJS
        entryFileNames: ({ name }) => (name === 'code' ? 'code.js' : 'ui.js'), // ui.js will be inlined & deleted
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
      treeshake: false, // disable treeshaking to keep all code
    },

    minify: false, // disable minification for easier debugging
  },

  plugins: [
    inlineUiAssets(),
    /* Copy manifest.json into dist/ as-is */
    viteStaticCopy({
      targets: [{ src: resolve(__dirname, 'src/manifest.json'), dest: '.' }],
    }),
  ],
});
