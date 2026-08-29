import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function pick(row, names) {
  const key = Object.keys(row).find((item) => names.includes(item.toLowerCase().replaceAll(' ', '').replaceAll('_', '')))
  return key ? row[key] : undefined
}

function number(value) {
  if (typeof value === 'number') return value
  const normalized = String(value ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  return Number(normalized) || 0
}

function normalize(data) {
  const records = Array.isArray(data) ? data : data?.data ?? data?.gastos ?? data?.expenses ?? data?.values ?? []
  if (!Array.isArray(records) || !records.length) return []
  const rows = Array.isArray(records[0])
    ? records.slice(1).map((row) => Object.fromEntries(records[0].map((header, index) => [header, row[index]])))
    : records
  return rows.map((row, index) => ({
    id: pick(row, ['id']) ?? index,
    date: new Date(pick(row, ['fecha', 'date', 'createdat', 'timestamp']) ?? Date.now()),
    concept: pick(row, ['concepto', 'descripcion', 'descripción', 'nombre', 'concept', 'description']) ?? 'Sin concepto',
    category: pick(row, ['categoria', 'categoría', 'category', 'tipo']) ?? 'Otros',
    amount: Math.abs(number(pick(row, ['importe', 'monto', 'cantidad', 'amount', 'valor', 'gasto']))),
  })).filter((item) => !Number.isNaN(item.date.getTime()))
}

function App() {
  const [expenses, setExpenses] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [category, setCategory] = useState('Todas')
  const [query, setQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')

  const load = async () => {
    setStatus('loading'); setError('')
    try {
      const res = await fetch('/api/expenses')
      if (!res.ok) throw new Error('El servidor respondió con un error.')
      const raw = await res.json()
      const normalized = normalize(raw)
      const latest = normalized.reduce((newest, item) => !newest || item.date > newest.date ? item : newest, null)
      setExpenses(normalized)
      setSelectedMonth((current) => current && normalized.some((item) => monthKey(item.date) === current)
        ? current : latest ? monthKey(latest.date) : '')
      setStatus('ready')
    } catch (err) {
      setError(err.message || 'No se han podido cargar los gastos.'); setStatus('error')
    }
  }
  useEffect(() => { load() }, [])

  const months = useMemo(() => [...new Map(expenses.map((item) => [monthKey(item.date), item.date])).entries()]
    .sort(([, a], [, b]) => b - a), [expenses])
  const selectedIndex = months.findIndex(([key]) => key === selectedMonth)
  const monthExpenses = useMemo(() => selectedMonth === 'all'
    ? expenses : expenses.filter((item) => monthKey(item.date) === selectedMonth), [expenses, selectedMonth])
  const categories = useMemo(() => ['Todas', ...new Set(monthExpenses.map((item) => item.category))], [monthExpenses])
  const visible = useMemo(() => monthExpenses.filter((item) =>
    (category === 'Todas' || item.category === category) && item.concept.toLowerCase().includes(query.toLowerCase())
  ).sort((a, b) => b.date - a.date), [monthExpenses, category, query])
  const total = useMemo(() => visible.reduce((sum, item) => sum + item.amount, 0), [visible])
  const monthTotal = useMemo(() => monthExpenses.reduce((sum, item) => sum + item.amount, 0), [monthExpenses])
  const average = monthExpenses.length ? monthTotal / monthExpenses.length : 0
  const changeMonth = (index) => {
    if (!months[index]) return
    setSelectedMonth(months[index][0]); setCategory('Todas'); setQuery('')
  }

  return <main className="shell">
    <header>
      <div><p className="eyebrow">FINANZAS PERSONALES</p><h1>Control de gastos</h1><p className="subtitle">Tu actividad financiera, clara y al día.</p></div>
      <button className="refresh" onClick={load} disabled={status === 'loading'} aria-label="Actualizar gastos">↻ <span>Actualizar</span></button>
    </header>

    <section className="summary" aria-label="Resumen">
      <article className="card highlight"><span>Gasto mostrado</span><strong>{money.format(total)}</strong><small>{visible.length} movimientos</small></article>
      <article className="card"><span>Total del mes</span><strong>{money.format(monthTotal)}</strong><small>{monthExpenses.length} gastos registrados</small></article>
      <article className="card"><span>Media por gasto</span><strong>{money.format(average)}</strong><small>En el mes seleccionado</small></article>
    </section>

    <section className="panel">
      <div className="toolbar">
        <div><h2>Movimientos</h2><p>{status === 'ready' ? 'Datos sincronizados' : 'Conectando con tus datos…'}</p></div>
        <div className="toolbar-actions">
          <div className="month-picker" aria-label="Seleccionar mes"><button onClick={() => changeMonth(selectedIndex + 1)} disabled={selectedIndex === -1 || selectedIndex === months.length - 1} aria-label="Mes anterior">‹</button><strong>{selectedMonth === 'all' ? 'Todos los meses' : months[selectedIndex] ? monthFormat.format(months[selectedIndex][1]) : 'Sin datos'}</strong><button onClick={() => changeMonth(selectedIndex - 1)} disabled={selectedIndex <= 0} aria-label="Mes siguiente">›</button><button className={selectedMonth === 'all' ? 'all-months active' : 'all-months'} onClick={() => { setSelectedMonth(selectedMonth === 'all' ? months[0]?.[0] ?? '' : 'all'); setCategory('Todas'); setQuery('') }}>{selectedMonth === 'all' ? 'Mes actual' : 'Todos'}</button></div>
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar concepto" /></label>
        </div>
      </div>
      <div className="filters" aria-label="Filtrar por categoría">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? 'selected' : ''}>{item}</button>)}</div>

      {status === 'loading' && <div className="state">Cargando gastos…</div>}
      {status === 'error' && <div className="state error"><strong>No se pudieron cargar los datos.</strong><span>{error}</span><button onClick={load}>Reintentar</button></div>}
      {status === 'ready' && <div className="table-wrap"><table><thead><tr><th>Concepto</th><th>Categoría</th><th>Fecha</th><th>Importe</th></tr></thead><tbody>
        {visible.map((item) => <tr key={item.id}><td className="concept">{item.concept}</td><td><span className="tag">{item.category}</span></td><td>{dateFormat.format(item.date)}</td><td className="amount">{money.format(item.amount)}</td></tr>)}
        {!visible.length && <tr><td colSpan="4" className="empty">No hay gastos que coincidan con este filtro.</td></tr>}
      </tbody></table></div>}
    </section>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
