import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const PLAN_TABS = [
  { id: 'financings', label: 'Financiaciones', key: 'financiaciones', endpoint: '/api/financings' },
  { id: 'gastosr2', label: 'Gastos R2', key: 'gastosr2', endpoint: '/api/gastosr2' },
  { id: 'gastosplani2', label: 'Gastos planificados', key: 'gastosplani2', endpoint: '/api/gastosplani2' },
  { id: 'ingresos2', label: 'Ingresos', key: 'ingresos2', endpoint: '/api/ingresos2' },
  { id: 'ahorra2', label: 'Ahorro', key: 'ahorra2', endpoint: '/api/ahorra2', secondaryKey: 'ajustesahorra2' },
]

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

function normalizePlanCollection(data, key) {
  return (data?.[key] ?? []).map((entry, index) => ({
    id: `${entry?.nombre ?? key}-${index}`,
    name: entry?.nombre || 'Sin nombre',
    payments: (entry?.pagos ?? []).map((payment, paymentIndex) => ({
      id: `${index}-${paymentIndex}`,
      year: Number(payment.anio),
      month: Number(payment.mes),
      amount: Math.abs(number(payment.importe)),
      signedAmount: number(payment.importe),
      paid: Boolean(payment.pagado),
    })),
  })).filter((entry) => entry.payments.length)
}

function normalizeSavings(data) {
  const savings = normalizePlanCollection(data, 'ahorra2').map((item) => ({
    ...item,
    payments: item.payments.map((payment) => ({ ...payment, id: `saving-${payment.id}`, source: 'saving' })),
  }))
  const adjustments = normalizePlanCollection(data, 'ajustesahorra2').map((item) => ({
    ...item,
    payments: item.payments.map((payment) => ({ ...payment, id: `adjustment-${payment.id}`, source: 'adjustment' })),
  }))
  const merged = new Map()

  savings.forEach((item) => merged.set(item.name, { ...item, payments: [...item.payments] }))
  adjustments.forEach((item) => {
    const target = merged.get(item.name) ?? { id: `${item.name}-adjustment`, name: item.name, payments: [] }
    target.payments = [...target.payments, ...item.payments]
    merged.set(item.name, target)
  })

  return [...merged.values()]
}

function planTotals(plan) {
  return plan.payments.reduce((totals, payment) => {
    totals.total += payment.amount
    if (payment.paid) totals.paid += payment.amount
    else totals.remaining += payment.amount
    return totals
  }, { total: 0, paid: 0, remaining: 0 })
}

function savingsStats(plan) {
  return plan.payments.reduce((stats, payment) => {
    if (payment.source === 'adjustment') {
      stats.accumulated += payment.signedAmount
    } else {
      stats.total += payment.amount
      if (payment.paid) {
        stats.paid += payment.amount
        stats.accumulated += payment.amount
      } else {
        stats.remaining += payment.amount
      }
    }
    return stats
  }, { total: 0, paid: 0, remaining: 0, accumulated: 0 })
}

function savingsProjection(plan) {
  const currentKey = monthKey(new Date())
  const baseline = savingsStats(plan).accumulated
  const months = new Map()

  plan.payments.forEach((payment) => {
    const key = `${payment.year}-${String(payment.month).padStart(2, '0')}`
    if (payment.source !== 'saving' || payment.paid || key < currentKey) return
    const month = months.get(key) ?? {
      key,
      label: paymentDate(payment),
      amount: 0,
    }
    month.amount += payment.amount
    months.set(key, month)
  })

  let projected = baseline
  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key)).map((month) => ({
    ...month,
    projected: projected += month.amount,
  }))
}

function paymentDate(payment) {
  return monthFormat.format(new Date(payment.year, payment.month - 1, 1))
}

function buildMonthlySummary(planData, expenses) {
  const buckets = new Map()
  const currentDate = new Date()
  const currentKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
  buckets.set(currentKey, {
    key: currentKey,
    label: monthFormat.format(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)),
    income: 0,
    outgoing: 0,
    paid: 0,
    pending: 0,
    saving: 0,
    expenses: [],
    expenseTotal: 0,
    items: [],
  })

  const addEntry = (year, month, entry) => {
    const key = `${year}-${String(month).padStart(2, '0')}`
    const current = buckets.get(key) ?? {
      key,
      label: monthFormat.format(new Date(year, month - 1, 1)),
      income: 0,
      outgoing: 0,
      paid: 0,
      pending: 0,
      saving: 0,
      expenses: [],
      expenseTotal: 0,
      items: [],
    }

    if (entry.income) current.income += entry.amount
    else if (entry.saving) {
      if (entry.adjustment || entry.paid) current.saving += entry.amount
      if (!entry.adjustment) {
        current.items.push(entry)
        current.outgoing += entry.amount
        if (entry.paid) current.paid += entry.amount
        else current.pending += entry.amount
      }
    } else {
      current.items.push(entry)
      current.outgoing += entry.amount
      if (entry.paid) current.paid += entry.amount
      else current.pending += entry.amount
    }
    buckets.set(key, current)
  }

  expenses.forEach((expense) => {
    const date = expense.date
    const key = monthKey(date)
    const current = buckets.get(key) ?? {
      key,
      label: monthFormat.format(new Date(date.getFullYear(), date.getMonth(), 1)),
      income: 0,
      outgoing: 0,
      paid: 0,
      pending: 0,
      saving: 0,
      expenses: [],
      expenseTotal: 0,
      items: [],
    }
    current.expenses.push(expense)
    current.expenseTotal += expense.amount
    current.outgoing += expense.amount
    current.paid += expense.amount
    buckets.set(key, current)
  })

  const datasets = [
    { key: 'financings', type: 'Financiación', income: false },
    { key: 'gastosr2', type: 'Gasto', income: false },
    { key: 'gastosplani2', type: 'Gasto planificado', income: false },
  ]

  datasets.forEach(({ key, type, income }) => {
    const items = planData[key] ?? []
    items.forEach((plan) => {
      plan.payments.forEach((payment) => {
        addEntry(payment.year, payment.month, {
          name: plan.name,
          type,
          amount: payment.amount,
          paid: Boolean(payment.paid),
          income,
        })
      })
    })
  })

  ;(planData.ahorra2 ?? []).forEach((plan) => {
    plan.payments.forEach((payment) => addEntry(payment.year, payment.month, {
      name: plan.name,
      type: 'Ahorro',
      amount: payment.source === 'adjustment' ? payment.signedAmount : payment.amount,
      paid: Boolean(payment.paid),
      saving: true,
      adjustment: payment.source === 'adjustment',
    }))
  })

  ;(planData.ingresos2 ?? []).forEach((plan) => {
    plan.payments.forEach((payment) => addEntry(payment.year, payment.month, {
      amount: payment.amount,
      income: true,
    }))
  })

  let saved = 0
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((month) => ({
    ...month,
    net: month.income - month.outgoing,
    saving: saved += month.saving,
    expenses: month.expenses.sort((a, b) => b.date - a.date),
    items: month.items.sort((a, b) => b.amount - a.amount),
  }))
}

function MonthlyOverview({ planData, expenses = [], onRefresh, refreshing }) {
  const months = useMemo(() => buildMonthlySummary(planData, expenses), [planData, expenses])
  const currentKey = monthKey(new Date())
  const [selectedKey, setSelectedKey] = useState(currentKey)
  const selectedMonth = months.find((month) => month.key === selectedKey) ?? months.find((month) => month.key === currentKey) ?? months[0]

  useEffect(() => {
    if (selectedMonth && selectedMonth.key !== selectedKey) setSelectedKey(selectedMonth.key)
  }, [selectedKey, selectedMonth])

  if (!selectedMonth) return <div className="state">No hay datos mensuales disponibles.</div>

  return <>
    <section className="financing-overview">
      <div><p className="eyebrow">RESUMEN MENSUAL</p><h1>Flujo del mes</h1><p className="subtitle">Revisa los pagos de un mes y lo que queda después.</p></div>
      <div className="monthly-controls"><button className="refresh" onClick={onRefresh} disabled={refreshing} aria-label="Actualizar todos los datos">↻ <span>{refreshing ? 'Actualizando…' : 'Actualizar'}</span></button><label className="monthly-selector"><span>Seleccionar mes</span><select value={selectedMonth.key} onChange={(event) => setSelectedKey(event.target.value)}>{months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select></label></div>
    </section>

    <section className="monthly-view" aria-label={`Resumen de ${selectedMonth.label}`}>
      <div className="monthly-heading"><div><p className="eyebrow">MES SELECCIONADO</p><h2>{selectedMonth.label}</h2></div><span className={`month-net ${selectedMonth.net >= 0 ? 'positive' : 'negative'}`}>Después de pagos {money.format(selectedMonth.net)}</span></div>
      <div className="monthly-summary">
        <article><span>Pagos del mes</span><strong>{money.format(selectedMonth.outgoing)}</strong><small>Todo lo previsto</small></article>
        <article><span>Ya pagado</span><strong className="paid-value">{money.format(selectedMonth.paid)}</strong><small>Cuotas liquidadas</small></article>
        <article><span>Te queda por pagar</span><strong>{money.format(selectedMonth.pending)}</strong><small>Cuotas pendientes</small></article>
        <article><span>Ahorro acumulado</span><strong>{money.format(selectedMonth.saving)}</strong><small>Después de ajustes</small></article>
      </div>
      <section className="monthly-expenses" aria-label={`Gastos de ${selectedMonth.label}`}>
        <div className="monthly-expenses-heading"><div><h3>Gastos del mes</h3><p>Gastos reales registrados fuera de los movimientos planificados.</p></div><strong>{money.format(selectedMonth.expenseTotal)}</strong></div>
        <div className="expense-list">
          {selectedMonth.expenses.map((expense) => <div className="expense-item" key={expense.id}><div><strong>{expense.concept}</strong><span>{expense.category} · {dateFormat.format(expense.date)}</span></div><strong>{money.format(expense.amount)}</strong></div>)}
          {!selectedMonth.expenses.length && <div className="empty">No hay gastos registrados este mes.</div>}
        </div>
      </section>
        <div className="month-card">
        <div className="month-card-top">
          <div><h3>Movimientos del mes</h3><p>{selectedMonth.items.length} conceptos registrados</p></div>
          <span className="monthly-income">Ingresos {money.format(selectedMonth.income)}</span>
        </div>
        <div className="month-list">
          {selectedMonth.items.map((item, index) => (
            <div key={`${selectedMonth.key}-${item.name}-${item.type}-${index}`} className="month-item">
              <div className="month-item-copy"><strong>{item.name}</strong><span>{item.type}</span></div>
              <div className="month-item-side">
                <strong>{money.format(item.amount)}</strong>
                <span className={`status-pill ${item.paid ? 'ok' : 'pending'}`}>{item.paid ? 'Pagado' : 'Pendiente'}</span>
              </div>
            </div>
          ))}
          {!selectedMonth.items.length && <div className="empty">No hay pagos ni movimientos previstos para este mes.</div>}
        </div>
      </div>
    </section>
  </>
}

function PlanCard({ plan, onSelect, title }) {
  const isSavings = title === 'Ahorro'
  const totals = isSavings ? savingsStats(plan) : planTotals(plan)
  const pending = plan.payments.filter((payment) => !payment.paid && payment.source !== 'adjustment')
  const progress = totals.total ? Math.round((totals.paid / totals.total) * 100) : 0

  return <button className="financing-card" onClick={() => onSelect(plan)}>
    <span className="financing-card-top"><span className="financing-icon">€</span><span className="card-arrow">↗</span></span>
    <span className="financing-name">{plan.name}</span>
    <span className="financing-label">{isSavings ? 'Ahorrado después del ajuste' : 'Queda por pagar'}</span>
    <strong className="financing-remaining">{money.format(isSavings ? totals.accumulated : totals.remaining)}</strong>
    <span className="progress-track"><span style={{ width: `${progress}%` }} /></span>
    <span className="financing-meta"><span>{pending.length} {pending.length === 1 ? 'pago pendiente' : 'pagos pendientes'}</span><span>{progress}% pagado</span></span>
  </button>
}

function PlanList({ title, items, onSelect, status, error, onRetry }) {
  const isSavings = title === 'Ahorro'
  const remaining = items.reduce((sum, plan) => sum + (isSavings ? savingsStats(plan).accumulated : planTotals(plan).remaining), 0)
  return <>
    <section className="financing-overview">
      <div><p className="eyebrow">PLAN DE PAGOS</p><h1>{title}</h1><p className="subtitle">Todo lo que tienes pendiente, en un solo vistazo.</p></div>
      <div className="financing-actions"><button className="refresh" onClick={onRetry} disabled={status === 'loading'} aria-label={`Actualizar ${title.toLowerCase()}`}>↻ <span>Actualizar</span></button><article className="remaining-total"><span>{isSavings ? 'Total ahorrado' : 'Total pendiente'}</span><strong>{money.format(remaining)}</strong><small>{items.length} elementos activos</small></article></div>
    </section>
    {status === 'loading' && <div className="state">Cargando {title.toLowerCase()}…</div>}
    {status === 'error' && <div className="state error"><strong>No se pudieron cargar los datos.</strong><span>{error}</span><button onClick={onRetry}>Reintentar</button></div>}
    {status === 'ready' && <section className="financing-grid" aria-label={`${title} activa`}>
      {items.map((plan) => <PlanCard key={plan.id} plan={plan} onSelect={onSelect} title={title} />)}
      {!items.length && <div className="state">No tienes elementos pendientes.</div>}
    </section>}
  </>
}

function PlanDetail({ title, plan, onBack }) {
  const isSavings = title === 'Ahorro'
  const totals = isSavings ? savingsStats(plan) : planTotals(plan)
  const progress = totals.total ? Math.round((totals.paid / totals.total) * 100) : 0
  const projection = isSavings ? savingsProjection(plan) : []
  return <>
    <button className="back-button" onClick={onBack}>← <span>Volver a {title.toLowerCase()}</span></button>
    <section className="detail-heading"><div><p className="eyebrow">DETALLE DE {title.toUpperCase()}</p><h1>{plan.name}</h1><p className="subtitle">{isSavings ? 'Ahorro acumulado y proyección si mantienes tus aportaciones.' : 'Seguimiento de todos tus pagos.'}</p></div><div className="detail-total"><span>{isSavings ? 'Ahorrado tras ajuste' : 'Pendiente'}</span><strong>{money.format(isSavings ? totals.accumulated : totals.remaining)}</strong></div></section>
    <section className="detail-summary">
      {isSavings ? <><article><span>Ahorrado real</span><strong className="paid-value">{money.format(totals.accumulated)}</strong></article><article><span>Próxima aportación</span><strong>{money.format(projection[0]?.amount ?? 0)}</strong></article><article><span>Meses proyectados</span><strong>{projection.length}</strong></article></> : <><article><span>Importe total</span><strong>{money.format(totals.total)}</strong></article><article><span>Ya pagado</span><strong className="paid-value">{money.format(totals.paid)}</strong></article><article><span>Progreso</span><strong>{progress}%</strong></article></>}
    </section>
    {isSavings && <section className="projection-panel"><div className="payments-heading"><div><h2>Proyección</h2><p>Cuánto tendrías acumulado si cumples cada aportación.</p></div><span className="status-pill ok">Tras ajustes</span></div><div className="projection-list">{projection.map((month) => <div className="projection-row" key={month.key}><span>{month.label}</span><strong>+{money.format(month.amount)}</strong><b>{money.format(month.projected)}</b></div>)}{!projection.length && <div className="empty">No hay aportaciones futuras configuradas.</div>}</div></section>}
    <section className="payments-panel"><div className="payments-heading"><div><h2>Calendario de pagos</h2><p>{plan.payments.length} cuotas en total</p></div><span className="status-pill">{progress === 100 ? 'Completada' : 'En curso'}</span></div><div className="payment-list">
      {plan.payments.map((payment) => { const adjustment = payment.source === 'adjustment'; const value = adjustment ? payment.signedAmount : payment.amount; return <div className={`payment-row ${payment.paid ? 'is-paid' : ''} ${adjustment ? 'is-adjustment' : ''}`} key={payment.id}><span className="payment-check">{adjustment ? '↔' : payment.paid ? '✓' : '·'}</span><span className="payment-date">{paymentDate(payment)}</span><span className="payment-status">{adjustment ? 'Ajuste aplicado' : payment.paid ? 'Pagado' : 'Pendiente'}</span><strong>{money.format(value)}</strong></div> })}
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
  const [planData, setPlanData] = useState({})
  const [planStatus, setPlanStatus] = useState({})
  const [planError, setPlanError] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState('monthly')
  const [selectedPlan, setSelectedPlan] = useState(null)

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

  const loadPlan = async (tabId) => {
    const tab = PLAN_TABS.find((item) => item.id === tabId)
    if (!tab) return
    setPlanStatus((current) => ({ ...current, [tabId]: 'loading' }))
    setPlanError((current) => ({ ...current, [tabId]: '' }))
    try {
      const responses = await Promise.all([
        fetch(tab.endpoint),
        ...(tab.secondaryKey ? [fetch(`/api/${tab.secondaryKey}`)] : []),
      ])
      if (responses.some((res) => !res.ok)) throw new Error('El servidor respondió con un error.')
      const payloads = await Promise.all(responses.map((res) => res.json()))
      const items = tab.secondaryKey
        ? normalizeSavings({ [tab.key]: payloads[0]?.[tab.key] ?? [], [tab.secondaryKey]: payloads[1]?.[tab.secondaryKey] ?? [] })
        : normalizePlanCollection(payloads[0], tab.key)
      setPlanData((current) => ({ ...current, [tabId]: items }))
      setPlanStatus((current) => ({ ...current, [tabId]: 'ready' }))
    } catch (err) {
      setPlanError((current) => ({ ...current, [tabId]: err.message || 'No se han podido cargar los datos.' }))
      setPlanStatus((current) => ({ ...current, [tabId]: 'error' }))
    }
  }

  const refreshAll = async () => {
    setRefreshing(true)
    await Promise.all([load(), ...PLAN_TABS.map((tab) => loadPlan(tab.id))])
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    PLAN_TABS.forEach((tab) => loadPlan(tab.id))
  }, [])

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

  const activeTab = PLAN_TABS.find((tab) => tab.id === view) ?? PLAN_TABS[0]
  const selectedPlans = planData[view] ?? []
  const currentPlanStatus = planStatus[view] ?? 'loading'
  const currentPlanError = planError[view] ?? ''

  return <main className="shell">
    <nav className="main-nav" aria-label="Secciones"><span className="brand-mark">PL</span><div className="desktop-nav">
      <button className={view === 'expenses' ? 'active' : ''} onClick={() => { setView('expenses'); setSelectedPlan(null) }}>Gastos</button>
      {PLAN_TABS.map((tab) => <button key={tab.id} className={view === tab.id ? 'active' : ''} onClick={() => { setView(tab.id); setSelectedPlan(null) }}>{tab.label}</button>)}
      <button className={view === 'monthly' ? 'active' : ''} onClick={() => { setView('monthly'); setSelectedPlan(null) }}>Mensual</button>
    </div><label className="mobile-nav"><span>Sección actual</span><select value={view} onChange={(event) => { setView(event.target.value); setSelectedPlan(null) }}><option value="expenses">Gastos</option>{PLAN_TABS.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}<option value="monthly">Mensual</option></select></label></nav>

    {view === 'expenses' ? <>
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
    </> : view === 'monthly' ? <MonthlyOverview planData={planData} expenses={expenses} onRefresh={refreshAll} refreshing={refreshing} /> : (selectedPlan ? <PlanDetail title={activeTab.label} plan={selectedPlan} onBack={() => setSelectedPlan(null)} /> : <PlanList title={activeTab.label} items={selectedPlans} onSelect={setSelectedPlan} status={currentPlanStatus} error={currentPlanError} onRetry={() => loadPlan(view)} />)}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
