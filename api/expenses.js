// Proxy del lado servidor: evita que el navegador dependa de CORS de Google Apps Script.
export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Método no permitido' })
  }

  const endpoint = process.env.EXPENSES_API_URL
  if (!endpoint) {
    return response.status(500).json({ error: 'Falta configurar EXPENSES_API_URL en Vercel.' })
  }

  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
    })
    const body = await upstream.text()

    if (!upstream.ok) {
      return response.status(upstream.status).json({ error: 'No se pudieron recuperar los gastos.' })
    }

    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    return response.status(200).send(body)
  } catch (error) {
    return response.status(502).json({ error: 'No se pudo conectar con el origen de gastos.' })
  }
}
