import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Eye, EyeOff, LogIn, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPass, setMostrarPass] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [vista, setVista] = useState('login') // 'login' | 'recuperar'
  const [emailRecuperar, setEmailRecuperar] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login(email, password)
    } catch (err) {
      setError('Correo o contraseña incorrectos. Verifica tus datos.')
    } finally {
      setCargando(false)
    }
  }

  async function handleRecuperar(e) {
    e.preventDefault()
    setCargando(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(emailRecuperar, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    setCargando(false)
    if (err) { setError('No se pudo enviar el correo. Verifica el email.'); return }
    setEnviado(true)
  }

  return (
    <div className="min-h-screen bg-feisen-gris flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
          style={{ background: 'linear-gradient(135deg, #064794 0%, #B4271D 100%)' }}>
          <span className="text-white text-3xl font-bold">F</span>
        </div>
        <h1 className="text-2xl font-bold text-feisen-azul">Feisen Inventarios</h1>
        <p className="text-feisen-gris-oscuro text-sm mt-1">Construequipos Franco S.A.S.</p>
      </div>

      {vista === 'login' ? (
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
          <h2 className="text-xl font-semibold text-feisen-gris-oscuro mb-6 text-center">Ingresa a tu cuenta</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-feisen-gris-oscuro mb-1">Correo electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                placeholder="tu@correo.com" autoComplete="email" />
            </div>
            <div>
              <label className="block text-sm font-medium text-feisen-gris-oscuro mb-1">Contraseña</label>
              <div className="relative">
                <input type={mostrarPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul pr-12"
                  placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setMostrarPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio">
                  {mostrarPass ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-feisen-rojo rounded-xl p-3">
                <AlertCircle size={18} className="text-feisen-rojo mt-0.5 flex-shrink-0" />
                <p className="text-feisen-rojo text-sm">{error}</p>
              </div>
            )}
            <button type="submit" disabled={cargando}
              className="w-full flex items-center justify-center gap-2 bg-feisen-azul hover:bg-feisen-azul-claro text-white font-semibold rounded-xl py-3 text-base transition-colors disabled:opacity-60">
              {cargando ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" /> : <LogIn size={20} />}
              {cargando ? 'Ingresando...' : 'Ingresar'}
            </button>
            <button type="button" onClick={() => { setVista('recuperar'); setError('') }}
              className="w-full text-center text-sm text-feisen-azul hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
          <button onClick={() => { setVista('login'); setEnviado(false); setError('') }}
            className="flex items-center gap-1 text-sm text-feisen-gris-medio hover:text-feisen-azul mb-5">
            <ArrowLeft size={16} /> Volver
          </button>
          <h2 className="text-xl font-semibold text-feisen-gris-oscuro mb-2">Restablecer contraseña</h2>
          <p className="text-sm text-feisen-gris-medio mb-6">Te enviaremos un enlace para crear una nueva contraseña.</p>
          {enviado ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle size={48} className="text-emerald-500" />
              <p className="text-center text-feisen-gris-oscuro font-medium">Correo enviado</p>
              <p className="text-center text-sm text-feisen-gris-medio">Revisa tu bandeja de entrada y sigue el enlace.</p>
            </div>
          ) : (
            <form onSubmit={handleRecuperar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-feisen-gris-oscuro mb-1">Correo electrónico</label>
                <input type="email" value={emailRecuperar} onChange={e => setEmailRecuperar(e.target.value)} required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-feisen-azul"
                  placeholder="tu@correo.com" />
              </div>
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-feisen-rojo rounded-xl p-3">
                  <AlertCircle size={18} className="text-feisen-rojo mt-0.5 flex-shrink-0" />
                  <p className="text-feisen-rojo text-sm">{error}</p>
                </div>
              )}
              <button type="submit" disabled={cargando}
                className="w-full bg-feisen-azul text-white font-semibold rounded-xl py-3 text-base hover:bg-feisen-azul-claro transition-colors disabled:opacity-60">
                {cargando ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
          )}
        </div>
      )}

      <p className="text-feisen-gris-medio text-xs mt-8 text-center">
        ¿Problemas para ingresar? Contacta al administrador del sistema.
      </p>
    </div>
  )
}
