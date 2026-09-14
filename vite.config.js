import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const BASE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwDPjzcNhjT8dfAf6CN3Oai2CUPx1iOo3z69UweD43fzsVgJoq_MUf1_mc4LBNIOghb/exec'
const LEGACY_EXPENSES_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzzH23MGdZn6Re01YKDMfnvvmJA-ITld7Hl8ksgild_ersSk9t4ypzHF9AhjSBkDEiS/exec'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const routes = {
    expenses: env.EXPENSES_API_URL || LEGACY_EXPENSES_ENDPOINT,
    financings: env.FINANCINGS_API_URL || `${BASE_ENDPOINT}?accion=financiaciones`,
    gastosr2: `${BASE_ENDPOINT}?accion=gastosr2`,
    gastosplani2: `${BASE_ENDPOINT}?accion=gastosplani2`,
    ingresos2: `${BASE_ENDPOINT}?accion=ingresos2`,
    ahorra2: `${BASE_ENDPOINT}?accion=ahorra2`,
    ajustesahorra2: `${BASE_ENDPOINT}?accion=ajustesahorra2`,
  }

  return {
    plugins: [react(), {
      name: 'local-data-proxy',
      configureServer(server) {
        Object.entries(routes).forEach(([route, url]) => {
          server.middlewares.use(`/api/${route}`, async (_request, response) => {
            try {
              const upstream = await fetch(url)
              response.statusCode = upstream.status
              response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
              response.end(await upstream.text())
            } catch {
              response.statusCode = 502
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: `No se pudo conectar con el origen de ${route}.` }))
            }
          })
        })
      },
    }],
  }
})
