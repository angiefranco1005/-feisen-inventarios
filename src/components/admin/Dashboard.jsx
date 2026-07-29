import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Package, ArrowUpDown, ShoppingCart, Plus } from 'lucide-react'
import Spinner from '../shared/Spinner'

export default function DashboardAdmin() {
  const { perfil } = useAuth()
  const [stats, setStats]       = useState({ productos: 0, movHoy: 0, pedidos: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const hoy = new Date(); hoy.setHours(0,0,0,0)
      const [{ count: productos }, { count: movHoy }, { count: pedidos }] = await Promise.all([
        supabase.from('items').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('movimientos').select('*', { count: 'exact', head: true }).gte('created_at', hoy.toISOString()),
        supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      ])
      setStats({ productos: productos || 0, movHoy: movHoy || 0, pedidos: pedidos || 0 })
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando) return <Spinner />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-feisen-azul">Hola, {perfil?.nombre?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Panel de administración</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Package size={20} className="text-feisen-azul" />
            </div>
            <p className="text-sm font-medium text-gray-500">Productos activos</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.productos}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <ArrowUpDown size={20} className="text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-500">Movimientos hoy</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.movHoy}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <ShoppingCart size={20} className="text-amber-500" />
            </div>
            <p className="text-sm font-medium text-gray-500">Pedidos pendientes</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.pedidos}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/movimientos/nuevo"
          className="bg-feisen-azul text-white rounded-2xl p-5 text-center font-bold hover:opacity-90 transition-opacity">
          <Plus size={28} className="mx-auto mb-2" />
          Nuevo movimiento
        </Link>
        <Link to="/productos"
          className="bg-feisen-rojo text-white rounded-2xl p-5 text-center font-bold hover:opacity-90 transition-opacity">
          <Package size={28} className="mx-auto mb-2" />
          Ver productos
        </Link>
      </div>
    </div>
  )
}
