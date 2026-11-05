import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The PDF viewer is loaded lazily; pre-bundling it avoids a dev-server reload the first time it opens.
  optimizeDeps: { include: ['pdfjs-dist'] },
});
