import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const isCI = !!process.env.GITHUB_ACTIONS
const basePrefix = isCI && repo ? `/${repo}/` : '/'

export default defineConfig({
    plugins: [react()],
    base: `${basePrefix}admin/`,
})