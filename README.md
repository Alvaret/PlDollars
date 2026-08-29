# Control de gastos

Panel React/Vite que recupera y presenta los gastos desde Google Apps Script.

## Ejecutarlo localmente

```bash
pnpm install
pnpm dev
```

La URL de origen está en `.env` como `EXPENSES_API_URL`. El servidor de desarrollo redirige `/api/expenses` a esa URL.

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. En **Settings → Environment Variables**, crea `EXPENSES_API_URL` con el mismo valor de `.env` para Production (y Preview si procede).
3. Despliega. Vercel detectará `pnpm-lock.yaml`, compilará Vite y publicará automáticamente la función `api/expenses.js`.

El navegador solo llama a `/api/expenses`; la función de Vercel hace el GET a Google desde el servidor. Esto evita problemas de CORS y no expone la URL configurada en el JavaScript del cliente.
