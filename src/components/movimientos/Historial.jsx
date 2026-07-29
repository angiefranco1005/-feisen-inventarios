import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import { Search, ArrowUpDown } from 'lucide-react'

const TIPO_CONFIG = {
  entrada: { label: 'Entrada', color: 'bg-green-100 text-green-700' },
  salida:  { label: 'Salida',  color: 'bg-red-100 text-red-700'   },
}

export default function Historial() {
  const { esAdmin } = useAuth()
  const [movimientos, setMovimientos] = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroTipo,  setFiltroTipo]  = useState('todos')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('movimientos')
      .select('*, items(nombre, unidad_medida), profiles(nombre), bodegas_origen:bodega_origen_id(nombre), bodegas_destino:bodega_destino_id(nombre)')
      .order('created_at', { ascending: false })
      .limit(200)
    setMovimientos(data || [])
    setCargando(false)
  }

  const filtrados = movimientos.filter(m => {
    const matchTipo    = filtroTipo === 'todos' || m.tipo === filtroTipo
    const matchBusqueda = m.items?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
                          m.referencia?.toLowerCase().includes(busqueda.toLowerCase()) ||
                          m.serial_motor?.toLowerCase().includes(busqueda.toLowerCase()) ||
                          m.numero_of?.toLowerCase().includes(busqueda.toLowerCase())
    return matchTipo && matchBusqueda
  })

  if (cargando) return <Spinner texto="Cargando historial..." />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-feisen-azul">Historial de movimientos</h1>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por producto, serial, OF, referencia..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white" />
        </div>
        <div className="flex gap-2">
          {['todos', 'entrada', 'salida'].map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors capitalize
                ${filtroTipo === t ? 'bg-feisen-azul text-white border-feisen-azul' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {t === 'todos' ? 'Todos' : TIPO_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ArrowUpDown size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay movimientos{busqueda ? ' que coincidan' : ''}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Producto</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500">Cantidad</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden md:table-cell">N° OF</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden md:table-cell">Serial</th>
                  {esAdmin && <th className="text-right px-4 py-3 font-semibold text-gray-500 hidden lg:table-cell">Valor</th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden lg:table-cell">Referencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map(m => {
                  const tc  = TIPO_CONFIG[m.tipo] || { label: m.tipo, color: 'bg-gray-100 text-gray-600' }
                  const bod = m.tipo === 'entrada' ? m.bodegas_destino?.nombre : m.bodegas_origen?.nombre
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString('es-CO')}<br />
                        <span className="text-gray-400">{new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${tc.color}`}>{tc.label}</span>
                        {bod && <p className="text-xs text-gray-400 mt-0.5">{bod}</p>}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{m.items?.nombre}</td>
                      <td className="px-4 py-3 text-right font-bold text-feisen-azul">
                        {m.cantidad} <span className="text-xs font-normal text-gray-400">{m.items?.unidad_medida}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell font-mono text-xs">{m.numero_of || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell font-mono text-xs">{m.serial_motor || '—'}</td>
                      {esAdmin && (
                        <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell text-xs">
                          {m.precio_costo_snapshot > 0
                            ? `$${Number(m.precio_costo_snapshot * m.cantidad).toLocaleString('es-CO')}`
                            : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">{m.referencia || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 text-right">Mostrando últimos 200 movimientos</p>
    </div>
  )
}
