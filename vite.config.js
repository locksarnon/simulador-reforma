import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    allowedHosts: ['simulador.clarityib.com.br', '.clarityib.com.br'],
    // Bind mounts do Docker Desktop no Windows não entregam eventos de
    // inotify de forma confiável — sem polling, o Vite não percebe edições
    // no host e continua servindo o módulo antigo até o container reiniciar.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  // Produção serve o build (vite preview), não o servidor de desenvolvimento:
  // um arquivo otimizado em vez de ~100 módulos por visita, sem código-fonte exposto.
  preview: {
    host: true,
    port: 5175,
    strictPort: true,
    allowedHosts: ['simulador.clarityib.com.br', '.clarityib.com.br'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
  ]
});
