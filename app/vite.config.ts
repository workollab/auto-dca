import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at the site root by default. Set `base` if hosting under a sub-path.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
