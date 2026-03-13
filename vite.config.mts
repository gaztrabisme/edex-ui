import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin(), tsconfigPaths()],
  clearScreen: false,
  build: {
    target: 'esnext',
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('globe.gl') || id.includes('three-globe') || id.includes('node_modules/three/')) {
            return 'three-globe';
          }
          if (id.includes('@xterm/')) {
            return 'xterm';
          }
          if (id.includes('smoothie')) {
            return 'smoothie';
          }
        },
      },
    },
  },
  server: {
    port: 1874,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
