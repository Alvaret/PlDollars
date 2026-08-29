import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react(), {
      name: 'local-expenses-proxy',
      configureServer(server) {
        if (!env.EXPENSES_API_URL) return
        server.middlewares.use('/api/expenses', async (_request, response) => {
          try {
            const upstream = await fetch(env.EXPENSES_API_URL)
            response.statusCode = upstream.status
            response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
            response.end(await upstream.text())
          } catch {
            response.statusCode = 502
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'No se pudo conectar con el origen de gastos.' }))
          }
        })
      },
    }],
    // Para desarrollo local, reproduce el proxy de la función de Vercel.
  }
})
