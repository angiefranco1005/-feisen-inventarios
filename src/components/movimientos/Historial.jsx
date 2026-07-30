import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Modal from '../shared/Modal'
import Alerta from '../shared/Alerta'
import { Search, ArrowUpDown, RotateCcw } from 'lucide-react'

const TIPO_CONFIG = {
  entrada: { label: 'Entrada', color: 'bg-green-100 text-green-700' },
  salida:  { label: 'Salida',  color: 'bg-red-100 text-red-700'   },
}

export default function Historial() {
  const { perfil, esAdmin } = useAuth()
  const [movimientos,  setMovimientos]  = useState([])
  const [items,        setItems]        = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('todos')
  const [filtroItem,   setFiltroItem]   = useState('')
  const [confirmRevert,setConfirmRevert]= useState(null)
  const [revirtiendo,  setRevirtiendo]  = useState(false)
  const [msg,          setMsg]          = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: movs }, { data: its }] = await Promise.all([
      supabase
        .from('movimientos')
        .select('*, items(nombre, unidad_medida), profiles(nombre), bodegas_origen:bodega_origen_id(nombre), bodegas_destino:bodega_destino_id(nombre), pedidos(numero)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('items').select('id, nombre').order('nombre'),
    ])
    setMovimientos(movs || [])
    setItems(its || [])
    setCargando(false)
  }

  async function generarNumero() {
    const { count } = await supabase.from('movimientos').select('*', { count: 'exact', head: true })
    return `MOV-${String((count || 0) + 1).padStart(4, '0')}`
  }

  async function revertir(m) {
    setRevirtiendo(true)
    setMsg(null)

    const numero = await generarNumero()

    // Crear movimiento contrario
    const contramov = {
      tipo:                  m.tipo === 'entrada' ? 'salida' : 'entrada',
      item_id:               m.item_id,
      bodega_origen_id:      m.tipo === 'entrada' ? m.bodega_destino_id : null,
      bodega_destino_id:     m.tipo === 'salida'  ? m.bodega_origen_id  : null,
      cantidad:              m.cantidad,
      precio_costo_snapshot: m.precio_costo_snapshot || 0,
      centro_costo:          m.centro_costo || '',
      usuario_id:            perfil.id,
      referencia:            `REVERSIÓN ${m.numero || m.id}`,
      revertido:             false,
      revertido_en:          new Date().toISOString(),
      numero,
    }

    const { error: e1 } = await supabase.from('movimientos').insert(contramov)
    if (e1) { setMsg({ tipo: 'error', texto: 'Error al crear reversión: ' + e1.message }); setRevirtiendo(false); return }

    // Marcar original como revertido
    const { error: e2 } = await supabase.from('movimientos').update({ revertido: true }).eq('id', m.id)
    if (e2) { setMsg({ tipo: 'error', texto: 'Error al marcar revertido: ' + e2.message }); setRevirtiendo(false); return }

    // El trigger fn_actualizar_stock ajusta el stock automáticamente al insertar el contramovimiento

    setRevirtiendo(false)
    setConfirmRevert(null)
    cargar()
  }

  const filtrados = movimientos.filter(m => {
    const matchTipo    = filtroTipo === 'todos' || m.tipo === filtroTipo
    const matchItem    = !filtroItem || m.item_id === filtroItem
    const matchBusqueda = !busqueda ||
      m.items?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.referencia?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.serial_motor?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.numero_of?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.numero?.toLowerCase().includes(busqueda.toLowerCase())
    return matchTipo && matchItem && matchBusqueda
  })

  if (cargando) return <Spinner texto="Cargando historial..." />

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-feisen-azul">Historial de movimientos</h1>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por N° mov, producto, serial, OF..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul bg-white" />
        </div>
        <select value={filtroItem} onChange={e => setFiltroItem(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul text-gray-600">
          <option value="">Todos los productos</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
        </select>
        <div className="flex gap-2">
          {['todos', 'entrada', 'salida'].map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors
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
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">N° Mov</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Fecha</th>
                  {esAdmin && <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Quién</th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500">Producto</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500">Cantidad</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden md:table-cell">N° OF</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden md:table-cell">Serial</th>
                  {esAdmin && <th className="text-right px-4 py-3 font-semibold text-gray-500 hidden lg:table-cell">Valor</th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden lg:table-cell">Ref / Proveedor</th>
                  {esAdmin && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map(m => {
                  const tc  = TIPO_CONFIG[m.tipo] || { label: m.tipo, color: 'bg-gray-100 text-gray-600' }
                  const bod = m.tipo === 'entrada' ? m.bodegas_destino?.nombre : m.bodegas_origen?.nombre
                  const esReversion = !!m.revertido_en
                  const estaRevertido = m.revertido

                  return (
                    <tr key={m.id} className={`hover:bg-gray-50 transition-colors ${estaRevertido ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {m.numero || '—'}
                        {esReversion && <span className="block text-feisen-rojo font-semibold text-xs">REVERSIÓN</span>}
                        {estaRevertido && <span className="block text-gray-400 text-xs">REVERTIDO</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString('es-CO')}<br />
                        <span className="text-gray-400">{new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      {esAdmin && (
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <p className="text-xs font-medium text-gray-700">{m.profiles?.nombre?.split(' ')[0]}</p>
                        </td>
                      )}
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
                      <td className="px-4 py-3 text-xs hidden lg:table-cell">
                        <p className="text-gray-400">{m.referencia || m.proveedor || '—'}</p>
                        {m.pedidos?.numero && <p className="text-feisen-azul font-medium">📋 {m.pedidos.numero}</p>}
                        {m.foto_remision_url && (
                          <a href={m.foto_remision_url} target="_blank" rel="noreferrer"
                            className="text-feisen-azul hover:underline flex items-center gap-1 mt-0.5">
                            🖼 Ver remisión
                          </a>
                        )}
                      </td>
                      {esAdmin && (
                        <td className="px-4 py-3 text-center">
                          {!estaRevertido && !esReversion && (
                            <button onClick={() => setConfirmRevert(m)}
                              className="p-1.5 text-gray-300 hover:text-feisen-rojo hover:bg-red-50 rounded-lg transition-colors"
                              title="Revertir movimiento">
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 text-right">Mostrando últimos 200 movimientos</p>

      {/* Modal confirmación reversión */}
      {confirmRevert && (
        <Modal titulo="Revertir movimiento" onCerrar={() => setConfirmRevert(null)}>
          <div className="space-y-4">
            <Alerta tipo="alerta" mensaje={
              `¿Revertir ${confirmRevert.numero || 'este movimiento'}? Se creará un movimiento contrario y se ajustará el stock de "${confirmRevert.items?.nombre}".`
            } />
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <p><span className="text-gray-500">Tipo:</span> <span className="font-medium capitalize">{confirmRevert.tipo}</span></p>
              <p><span className="text-gray-500">Producto:</span> <span className="font-medium">{confirmRevert.items?.nombre}</span></p>
              <p><span className="text-gray-500">Cantidad:</span> <span className="font-medium">{confirmRevert.cantidad} {confirmRevert.items?.unidad_medida}</span></p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRevert(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-600">
                Cancelar
              </button>
              <button onClick={() => revertir(confirmRevert)} disabled={revirtiendo}
                className="flex-1 bg-feisen-rojo text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60">
                {revirtiendo ? 'Revirtiendo...' : 'Sí, revertir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
