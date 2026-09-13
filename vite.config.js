import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const financingsEndpoint = env.FINANCINGS_API_URL || 'https://script.google.com/macros/s/AKfycbwxzxRo20cUqZ5Snh3G8bev07S7f5AFX36Sg0ozlROkHpjr8gU0rzRiw6wWABAFZHTu/exec?accion=financiaciones'
  return {
    plugins: [react(), {
      name: 'local-expenses-proxy',
      configureServer(server) {
        if (env.EXPENSES_API_URL) server.middlewares.use('/api/expenses', async (_request, response) => {
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
        server.middlewares.use('/api/financings', async (_request, response) => {
          try {
            const upstream = await fetch(financingsEndpoint)
            response.statusCode = upstream.status
            response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
            response.end(await upstream.text())
          } catch {
            response.statusCode = 502
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'No se pudo conectar con el origen de financiaciones.' }))
          }
        })
      },
    }],
    // Para desarrollo local, reproduce el proxy de la función de Vercel.
  }
})
