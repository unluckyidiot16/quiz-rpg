import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isCI = !!process.env.GITHUB_ACTIONS;
const basePrefix = isCI && repo ? `/${repo}/` : '/';

export default defineConfig({
    plugins: [react()],
    base: `${basePrefix}student/`,
    resolve: {
        preserveSymlinks: false,
        alias: {
            '@quiz-rpg/core': fileURLToPath(new URL('../../packages/core/index.js', import.meta.url)),
        },
    },
});
