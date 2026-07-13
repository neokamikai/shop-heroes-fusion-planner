import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const webRootDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRootDir = path.resolve(webRootDir, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRootDir, '');
  const appBasePath = process.env.VITE_APP_BASE_PATH
    || env.VITE_APP_BASE_PATH
    || (mode === 'development' ? '/' : '/shop-heroes-planner/');

  return {
    base: appBasePath,
    plugins: [react()]
  };
});
