import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)
  const [sesionValida, setSesionValida] = useState(false)

  useEffect(() => {
    // Supabase inyecta la sesión en la URL al volver del correo
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSesionValida(true)
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirmar) { setError('Las contraseñas no coinciden.'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    setCargando(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setCargando(false)
    if (err) { setError('No se pudo actualizar la contraseña. Intenta de nuevo.'); return }
    setListo(true)
    setTimeout(() => navigate('/login'), 3000)
  }

  return (
    <div className="min-h-screen bg-feisen-gris flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
          style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
          <span className="text-white text-3xl font-bold">F</span>
        </div>
        <h1 className="text-2xl font-bold text-feisen-azul">Feisen Inventarios</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        {listo ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={48} className="text-emerald-500" />
            <p className="text-center text-feisen-gris-oscuro font-medium">¡Contraseña actualizada!</p>
            <p className="text-center text-sm text-feisen-gris-medio">Redirigiendo al inicio de sesión...</p>
          </div>
        ) : !sesionValida ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertCircle size={40} className="text-amber-500" />
            <p className="text-feisen-gris-oscuro font-medium">Enlace inválido o expirado</p>
            <p className="text-sm text-feisen-gris-medio">Solicita un nuevo enlace desde la pantalla de inicio.</p>
            <button onClick={() => navigate('/login')}
              className="mt-2 text-feisen-azul text-sm hover:underline">
              Ir al inicio de sesión
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-feisen-gris-oscuro mb-2">Nueva contraseña</h2>
            <p className="text-sm text-feisen-gris-medio mb-6">Elige una contraseña segura de al menos 6 caracteres.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-feisen-gris-oscuro mb-1">Nueva contraseña</label>
                <div className="relative">
                  <input type={mostrar ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} required
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul pr-12"
                    placeholder="••••••••" />
                  <button type="button" onClick={() => setMostrar(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio">
                    {mostrar ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-feisen-gris-oscuro mb-1">Confirmar contraseña</label>
                <input type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)} required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="••••••••" />
              </div>
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-feisen-rojo rounded-xl p-3">
                  <AlertCircle size={18} className="text-feisen-rojo mt-0.5 flex-shrink-0" />
                  <p className="text-feisen-rojo text-sm">{error}</p>
                </div>
              )}
              <button type="submit" disabled={cargando}
                className="w-full bg-feisen-azul text-white font-semibold rounded-xl py-3 text-base hover:bg-feisen-azul-claro transition-colors disabled:opacity-60">
                {cargando ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
