import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at the site root on workollab-02. Adjust `base` if hosted under a sub-path.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
