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

function normalizeFinancings(data) {
  return (data?.financiaciones ?? []).map((financing, index) => ({
    id: `${financing.nombre}-${index}`,
    name: financing.nombre || 'Financiación sin nombre',
    payments: (financing.pagos ?? []).map((payment, paymentIndex) => ({
      id: `${index}-${paymentIndex}`,
      year: Number(payment.anio),
      month: Number(payment.mes),
      amount: Math.abs(number(payment.importe)),
      paid: Boolean(payment.pagado),
    })),
  })).filter((financing) => financing.payments.some((payment) => !payment.paid && payment.amount > 0))
}

function financingTotals(financing) {
  return financing.payments.reduce((totals, payment) => {
    totals.total += payment.amount
    if (payment.paid) totals.paid += payment.amount
    else totals.remaining += payment.amount
    return totals
  }, { total: 0, paid: 0, remaining: 0 })
}

function paymentDate(payment) {
  return monthFormat.format(new Date(payment.year, payment.month - 1, 1))
}

function FinancingCard({ financing, onSelect }) {
  const totals = financingTotals(financing)
  const pending = financing.payments.filter((payment) => !payment.paid)
  const progress = totals.total ? Math.round((totals.paid / totals.total) * 100) : 0
  return <button className="financing-card" onClick={() => onSelect(financing)}>
    <span className="financing-card-top"><span className="financing-icon">€</span><span className="card-arrow">↗</span></span>
    <span className="financing-name">{financing.name}</span>
    <span className="financing-label">Queda por pagar</span>
    <strong className="financing-remaining">{money.format(totals.remaining)}</strong>
    <span className="progress-track"><span style={{ width: `${progress}%` }} /></span>
    <span className="financing-meta"><span>{pending.length} {pending.length === 1 ? 'pago pendiente' : 'pagos pendientes'}</span><span>{progress}% pagado</span></span>
  </button>
}

function FinancingList({ financings, onSelect, status, error, onRetry }) {
  const remaining = financings.reduce((sum, financing) => sum + financingTotals(financing).remaining, 0)
  return <>
    <section className="financing-overview">
      <div><p className="eyebrow">PLAN DE PAGOS</p><h1>Financiaciones</h1><p className="subtitle">Todo lo que tienes pendiente, en un solo vistazo.</p></div>
      <div className="financing-actions"><button className="refresh" onClick={onRetry} disabled={status === 'loading'} aria-label="Actualizar financiaciones">↻ <span>Actualizar</span></button><article className="remaining-total"><span>Total pendiente</span><strong>{money.format(remaining)}</strong><small>{financings.length} financiaciones activas</small></article></div>
    </section>
    {status === 'loading' && <div className="state">Cargando financiaciones…</div>}
    {status === 'error' && <div className="state error"><strong>No se pudieron cargar las financiaciones.</strong><span>{error}</span><button onClick={onRetry}>Reintentar</button></div>}
    {status === 'ready' && <section className="financing-grid" aria-label="Financiaciones activas">
      {financings.map((financing) => <FinancingCard key={financing.id} financing={financing} onSelect={onSelect} />)}
      {!financings.length && <div className="state">No tienes financiaciones pendientes.</div>}
    </section>}
  </>
}

function FinancingDetail({ financing, onBack }) {
  const totals = financingTotals(financing)
  const progress = totals.total ? Math.round((totals.paid / totals.total) * 100) : 0
  return <>
    <button className="back-button" onClick={onBack}>← <span>Volver a financiaciones</span></button>
    <section className="detail-heading"><div><p className="eyebrow">DETALLE DE FINANCIACIÓN</p><h1>{financing.name}</h1><p className="subtitle">Seguimiento de todos tus pagos.</p></div><div className="detail-total"><span>Pendiente</span><strong>{money.format(totals.remaining)}</strong></div></section>
    <section className="detail-summary">
      <article><span>Importe total</span><strong>{money.format(totals.total)}</strong></article>
      <article><span>Ya pagado</span><strong className="paid-value">{money.format(totals.paid)}</strong></article>
      <article><span>Progreso</span><strong>{progress}%</strong></article>
    </section>
    <section className="payments-panel"><div className="payments-heading"><div><h2>Calendario de pagos</h2><p>{financing.payments.length} cuotas en total</p></div><span className="status-pill">{progress === 100 ? 'Completada' : 'En curso'}</span></div><div className="payment-list">
      {financing.payments.map((payment) => <div className={`payment-row ${payment.paid ? 'is-paid' : ''}`} key={payment.id}><span className="payment-check">{payment.paid ? '✓' : '·'}</span><span className="payment-date">{paymentDate(payment)}</span><span className="payment-status">{payment.paid ? 'Pagado' : 'Pendiente'}</span><strong>{money.format(payment.amount)}</strong></div>)}
    </div></section>
  </>
}

function App() {
  const [expenses, setExpenses] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [category, setCategory] = useState('Todas')
  const [query, setQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [financings, setFinancings] = useState([])
  const [financingStatus, setFinancingStatus] = useState('loading')
  const [financingError, setFinancingError] = useState('')
  const [view, setView] = useState('expenses')
  const [selectedFinancing, setSelectedFinancing] = useState(null)

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

  const loadFinancings = async () => {
    setFinancingStatus('loading'); setFinancingError('')
    try {
      const res = await fetch('/api/financings')
      if (!res.ok) throw new Error('El servidor respondió con un error.')
      setFinancings(normalizeFinancings(await res.json()))
      setFinancingStatus('ready')
    } catch (err) {
      setFinancingError(err.message || 'No se han podido cargar las financiaciones.'); setFinancingStatus('error')
    }
  }
  useEffect(() => { loadFinancings() }, [])

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
    <nav className="main-nav" aria-label="Secciones"><span className="brand-mark">PL</span><div><button className={view === 'expenses' ? 'active' : ''} onClick={() => { setView('expenses'); setSelectedFinancing(null) }}>Gastos</button><button className={view === 'financings' ? 'active' : ''} onClick={() => { setView('financings'); setSelectedFinancing(null) }}>Financiaciones</button></div></nav>
    {view === 'financings' ? (selectedFinancing ? <FinancingDetail financing={selectedFinancing} onBack={() => setSelectedFinancing(null)} /> : <FinancingList financings={financings} onSelect={setSelectedFinancing} status={financingStatus} error={financingError} onRetry={loadFinancings} />) : <>
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
    </>}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
