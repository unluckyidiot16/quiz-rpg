import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isCI = !!process.env.GITHUB_ACTIONS;
const basePrefix = isCI && repo ? `/${repo}/` : '/';

export default defineConfig({
    plugins: [react()],
    base: `${basePrefix}admin/`,
    resolve: {
        // symlink 따라가며 node_modules/core 쪽으로 빠지는 걸 방지
        preserveSymlinks: false,
        alias: {
            '@quiz-rpg/core': fileURLToPath(new URL('../../packages/core/index.js', import.meta.url)),
        },
    },
});
