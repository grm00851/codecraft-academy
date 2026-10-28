import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').at(-1)
const isUserOrOrgSite = repositoryName?.toLowerCase().endsWith('.github.io') ?? false
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName && !isUserOrOrgSite
  ? `/${repositoryName}/`
  : '/'

export default defineConfig({
  base,
  plugins: [react()],
})
