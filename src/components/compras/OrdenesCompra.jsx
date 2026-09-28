import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import Alerta from '../shared/Alerta'
import { exportarOrdenCompraPDF } from '../../utils/exportOrdenCompraPDF'
import { FileText, Search, Download, Ban, RotateCcw } from 'lucide-react'

function normalizar(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function OrdenesCompra() {
  const { esAdmin, esLogistica } = useAuth()
  const puedeAdministrar = esAdmin || esLogistica

  const [ordenes,  setOrdenes]  = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarAnuladas, setMostrarAnuladas] = useState(false)
  const [msg, setMsg] = useState(null)

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase
      .from('ordenes_compra')
      .select('*, proveedores(nombre, nit, contacto, telefono, direccion), profiles(nombre), pedidos(numero), orden_compra_items(*)')
      .order('created_at', { ascending: false })
    if (error) setMsg({ tipo: 'error', texto: 'Error al cargar: ' + error.message })
    setOrdenes(data || [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  async function toggleAnulada(oc) {
    const { error } = await supabase.from('ordenes_compra').update({ anulada: !oc.anulada }).eq('id', oc.id)
    if (error) { setMsg({ tipo: 'error', texto: 'Error: ' + error.message }); return }
    setOrdenes(prev => prev.map(o => o.id === oc.id ? { ...o, anulada: !oc.anulada } : o))
  }

  const filtradas = ordenes
    .filter(oc => mostrarAnuladas || !oc.anulada)
    .filter(oc => {
      if (!busqueda.trim()) return true
      const q = normalizar(busqueda)
      return normalizar(oc.numero).includes(q)
        || normalizar(oc.proveedores?.nombre).includes(q)
        || normalizar(oc.pedidos?.numero).includes(q)
    })

  if (cargando) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#064794' }}>
          <FileText className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Órdenes de compra</h1>
      </div>

      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por número, proveedor o pedido..."
            className="w-full border border-gray-300 rounded-xl pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
          <input type="checkbox" checked={mostrarAnuladas} onChange={e => setMostrarAnuladas(e.target.checked)}
            className="w-4 h-4 accent-feisen-azul rounded" />
          Mostrar anuladas
        </label>
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay órdenes de compra para mostrar.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtradas.map(oc => {
            const total = (oc.orden_compra_items || []).reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
            return (
              <div key={oc.id} className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex items-center justify-between gap-3 flex-wrap ${oc.anulada ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800">{oc.numero}</p>
                    {oc.anulada && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Anulada</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(`${oc.fecha}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {oc.pedidos?.numero && ` · Pedido ${oc.pedidos.numero}`}
                    {oc.profiles?.nombre && ` · Generada por ${oc.profiles.nombre}`}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {oc.proveedores?.nombre || 'Sin proveedor'}
                    <span className="text-gray-400"> · {(oc.orden_compra_items || []).length} producto{(oc.orden_compra_items || []).length !== 1 ? 's' : ''}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-feisen-azul">
                    ${total.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <button
                    onClick={() => exportarOrdenCompraPDF(oc, oc.proveedores, oc.orden_compra_items, oc.pedidos, oc.profiles?.nombre || '')}
                    title="Descargar PDF" className="p-2 text-feisen-azul hover:bg-blue-50 rounded-lg">
                    <Download size={16} />
                  </button>
                  {puedeAdministrar && (
                    <button onClick={() => toggleAnulada(oc)}
                      title={oc.anulada ? 'Reactivar orden' : 'Anular orden'}
                      className={`p-2 rounded-lg ${oc.anulada ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:text-feisen-rojo hover:bg-red-50'}`}>
                      {oc.anulada ? <RotateCcw size={16} /> : <Ban size={16} />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
