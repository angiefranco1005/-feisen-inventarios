import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Flame, ChevronDown, ChevronUp, Search, PlusCircle } from 'lucide-react'

function numFun(n) {
  return `FUN-${String(n).padStart(4, '0')}`
}

function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

function fmtHora(h) {
  if (!h) return '—'
  return h.slice(0, 5)
}

function fmtNum(v, unit) {
  if (v == null || v === '') return '—'
  return `${parseFloat(v).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`
}

const MATERIALES = [
  { key: 'peso_vaceadero',            label: 'Peso vaceadero',            unit: 'kg' },
  { key: 'hierro_colado',             label: 'Hierro colado',             unit: 'kg' },
  { key: 'hierro_colado_contaminado', label: 'Hierro colado contaminado', unit: 'kg' },
  { key: 'carbon',                    label: 'Carbón',                    unit: 'kg' },
  { key: 'caliza',                    label: 'Caliza',                    unit: 'kg' },
  { key: 'ferromolido',               label: 'Ferromolido',               unit: 'kg' },
  { key: 'exlac',                     label: 'Exlac',                     unit: 'kg' },
]

export default function ListaFundidas() {
  const navigate = useNavigate()

  const [fundidas,  setFundidas]  = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [busqueda,  setBusqueda]  = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('fundidas')
      .select('*')
      .order('created_at', { ascending: false })
    setFundidas(data || [])
    setCargando(false)
  }

  const filtradas = fundidas.filter(f => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return true
    return (
      numFun(f.numero).toLowerCase().includes(q) ||
      fmtFecha(f.fecha).includes(q) ||
      (f.horneros   || []).some(h => h.toLowerCase().includes(q)) ||
      (f.vaceadores || []).some(v => v.toLowerCase().includes(q)) ||
      (f.auxiliares || []).some(a => a.toLowerCase().includes(q)) ||
      (f.observaciones || '').toLowerCase().includes(q)
    )
  })

  function toggle(id) {
    setExpandido(prev => (prev === id ? null : id))
  }

  return (
    <div className="max-w-3xl mx-auto p-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-orange-100 p-2.5 rounded-xl">
            <Flame size={22} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Fundidas</h1>
            <p className="text-xs text-gray-500">
              {fundidas.length} registro{fundidas.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/fundidas/nueva')}
          className="flex items-center gap-2 bg-feisen-rojo text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <PlusCircle size={16} /> Nueva fundida
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por N°, fecha, hornero, vaceador…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="text-center text-gray-400 py-16">Cargando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-center text-gray-400 py-16">
          {busqueda ? 'Sin resultados.' : 'Aún no hay fundidas registradas.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtradas.map(f => (
            <div key={f.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

              {/* Fila resumen */}
              <button
                type="button"
                onClick={() => toggle(f.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="bg-orange-100 text-orange-700 font-bold text-sm px-3 py-1 rounded-lg font-mono shrink-0">
                    {numFun(f.numero)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{fmtFecha(f.fecha)}</p>
                    <p className="text-xs text-gray-500">
                      {fmtHora(f.hora_inicio)}
                      {f.hora_fin ? ` → ${fmtHora(f.hora_fin)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-3">
                  {f.observaciones && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                      Novedad
                    </span>
                  )}
                  <p className="text-xs text-gray-400 hidden md:block truncate max-w-32">
                    {(f.horneros || []).join(', ')}
                  </p>
                  {expandido === f.id
                    ? <ChevronUp  size={16} className="text-gray-400 shrink-0" />
                    : <ChevronDown size={16} className="text-gray-400 shrink-0" />
                  }
                </div>
              </button>

              {/* Detalle expandido */}
              {expandido === f.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 space-y-5">

                  {/* Personal */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Horneros',    vals: f.horneros },
                      { label: 'Vaceadores',  vals: f.vaceadores },
                      { label: 'Auxiliares',  vals: f.auxiliares },
                    ].map(({ label, vals }) => (
                      <div key={label}>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1.5">{label}</p>
                        {(vals || []).filter(Boolean).length > 0
                          ? (vals || []).filter(Boolean).map((v, i) => (
                              <p key={i} className="text-sm text-gray-800">{v}</p>
                            ))
                          : <p className="text-sm text-gray-400">—</p>
                        }
                      </div>
                    ))}
                  </div>

                  {/* Materiales */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase mb-3">Materiales</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                      {MATERIALES.map(({ key, label, unit }) => (
                        <div key={key} className="flex justify-between items-center text-sm border-b border-gray-100 pb-1.5">
                          <span className="text-gray-600">{label}</span>
                          <span className="font-semibold text-gray-800">{fmtNum(f[key], unit)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-1.5">
                        <span className="text-gray-600">Temperatura aprox.</span>
                        <span className="font-semibold text-gray-800">{fmtNum(f.temperatura, '°C')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Observaciones */}
                  {f.observaciones && (
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase mb-2">Observaciones</p>
                      <p className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 leading-relaxed">
                        {f.observaciones}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
