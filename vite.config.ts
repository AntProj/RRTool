import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed at https://antproj.github.io/RRTool/
export default defineConfig({
  plugins: [react()],
  base: '/RRTool/',
})
