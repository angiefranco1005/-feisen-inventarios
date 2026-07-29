import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../shared/Spinner'
import { LogOut, Package } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function DashboardConsultor() {
  const { perfil, logout } = useAuth()
  const navigate = useNavigate()
  const [stock, setStock]       = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('stock')
        .select('cantidad_actual, items(nombre, unidad_medida, categorias(nombre)), bodegas!bodega_id(nombre)')
        .order('items(nombre)')
      setStock(data || [])
      setCargando(false)
    }
    cargar()
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  if (cargando) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
            <span className="text-white font-bold">F</span>
          </div>
          <div>
            <p className="font-bold text-feisen-azul leading-tight">Feisen Inventarios</p>
            <p className="text-xs text-gray-400">Vista de consulta</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:block">{perfil?.nombre}</span>
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-feisen-rojo text-sm font-medium hover:bg-red-50 px-3 py-2 rounded-xl transition-colors">
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      {/* Contenido */}
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-700 flex items-center gap-2">
          <Package size={22} className="text-feisen-azul" /> Stock actual — Bodega Motores
        </h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {stock.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay productos con stock registrado.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500">Producto</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 hidden sm:table-cell">Categoría</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-500">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stock.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{s.items?.nombre}</td>
                    <td className="px-5 py-3 text-gray-400 hidden sm:table-cell">{s.items?.categorias?.nombre || '—'}</td>
                    <td className="px-5 py-3 text-right font-bold text-feisen-azul">
                      {s.cantidad_actual} <span className="text-xs font-normal text-gray-400">{s.items?.unidad_medida}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
