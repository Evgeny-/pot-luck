import { defineConfig, type Plugin } from 'vite';

/** Deployment waits for this exact revision to reach the public site. */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ id: process.env.GITHUB_SHA || new Date().toISOString() }),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [versionFile()],
  server: { port: 5190 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
});
