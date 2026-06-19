import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'serve-and-copy-music-folder',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/Music/')) {
              const decodedPath = decodeURIComponent(req.url);
              const filePath = path.join(process.cwd(), decodedPath);
              if (fs.existsSync(filePath)) {
                const ext = path.extname(filePath).toLowerCase();
                const contentType = ext === '.mp3' ? 'audio/mpeg' : 'application/octet-stream';
                res.setHeader('Content-Type', contentType);
                fs.createReadStream(filePath).pipe(res);
                return;
              }
            }
            next();
          });
        },
        closeBundle() {
          const srcDir = path.join(process.cwd(), 'Music');
          const destDir = path.join(process.cwd(), 'dist', 'Music');
          if (fs.existsSync(srcDir)) {
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            const files = fs.readdirSync(srcDir);
            for (const file of files) {
              fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
            }
            console.log(`Successfully copied Music files to output dist/Music/`);
          }
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
