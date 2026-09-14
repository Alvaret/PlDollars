const BASE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwDPjzcNhjT8dfAf6CN3Oai2CUPx1iOo3z69UweD43fzsVgJoq_MUf1_mc4LBNIOghb/exec'

const ACTIONS = {
  gastosr2: 'gastosr2',
  gastosplani2: 'gastosplani2',
  ingresos2: 'ingresos2',
  ahorra2: 'ahorra2',
  ajustesahorra2: 'ajustesahorra2',
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Método no permitido' })
  }

  const slug = request.query?.slug
  const action = ACTIONS[slug]
  if (!action) {
    return response.status(404).json({ error: 'Ruta no disponible' })
  }

  try {
    const upstream = await fetch(`${BASE_ENDPOINT}?accion=${action}`, {
      headers: { Accept: 'application/json' },
    })
    const body = await upstream.text()

    if (!upstream.ok) {
      return response.status(upstream.status).json({ error: `No se pudieron recuperar ${action}.` })
    }

    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    return response.status(200).send(body)
  } catch {
    return response.status(502).json({ error: `No se pudo conectar con el origen de ${action}.` })
  }
}
