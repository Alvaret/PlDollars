const DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwxzxRo20cUqZ5Snh3G8bev07S7f5AFX36Sg0ozlROkHpjr8gU0rzRiw6wWABAFZHTu/exec?accion=financiaciones'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const upstream = await fetch(process.env.FINANCINGS_API_URL || DEFAULT_ENDPOINT, {
      headers: { Accept: 'application/json' },
    })
    const body = await upstream.text()
    if (!upstream.ok) return response.status(upstream.status).json({ error: 'No se pudieron recuperar las financiaciones.' })
    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    return response.status(200).send(body)
  } catch {
    return response.status(502).json({ error: 'No se pudo conectar con el origen de financiaciones.' })
  }
}