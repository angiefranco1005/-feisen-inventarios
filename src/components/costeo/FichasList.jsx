import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCOP, formatPct } from './utils/format'

const CATALOGOS = {
  maquina: {
    tituloLista: 'Tus máquinas',
    textoBoton: '+ Nueva máquina',
    labelNombre: 'Nombre de la máquina',
    placeholderNombre: 'ej. Mezcladora 350L',
    textoVacio: 'Todavía no has creado ninguna máquina.',
    pill: 'Mis máquinas',
  },
  pieza: {
    tituloLista: 'Catálogo de piezas',
    textoBoton: '+ Nueva pieza',
    labelNombre: 'Nombre de la pieza',
    placeholderNombre: 'ej. La olla, Chasis',
    textoVacio: 'Todavía no has creado ninguna pieza.',
    pill: 'Catálogo de piezas',
  },
}

export default function FichasList({ tipo, onCambiarCatalogo, onSelect }) {
  const [fichas, setFichas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cfg = CATALOGOS[tipo]

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('costeo_resumen')
      .select('*')
      .eq('tipo', tipo)
      .order('nombre', { ascending: true })
    if (!error) setFichas(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!nombreNuevo.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setGuardando(true)
    const { data, error } = await supabase
      .from('costeo_fichas')
      .insert({ nombre: nombreNuevo.trim(), tipo })
      .select()
      .single()
    setGuardando(false)
    if (error) {
      setError('No se pudo crear: ' + error.message)
      return
    }
    setNombreNuevo('')
    setMostrarForm(false)
    onSelect(data.id, data.nombre)
  }

  async function renombrar(id, nombreActual) {
    const nuevoNombre = window.prompt('Nuevo nombre:', nombreActual)
    if (nuevoNombre === null) return
    const trimmed = nuevoNombre.trim()
    if (!trimmed) return
    const { error } = await supabase
      .from('costeo_fichas')
      .update({ nombre: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      window.alert('No se pudo renombrar: ' + error.message)
      return
    }
    await cargar()
  }

  async function eliminar(id, nombre) {
    const confirmado = window.confirm(
      `¿Seguro que quieres eliminar "${nombre}"? Se borran también sus materiales, mano de obra y, si es una pieza usada dentro de otra ficha, se quita de ahí también. Esta acción no se puede deshacer.`
    )
    if (!confirmado) return
    const { error } = await supabase.from('costeo_fichas').delete().eq('id', id)
    if (error) {
      window.alert('No se pudo eliminar: ' + error.message)
      return
    }
    await cargar()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-feisen-azul">Costeo</h1>
      <div className="mt-4 flex gap-2">
        {Object.entries(CATALOGOS).map(([key, c]) => (
          <button
            key={key}
            onClick={() => onCambiarCatalogo(key)}
            className={`text-sm font-medium rounded-full px-4 py-1.5 border ${
              tipo === key
                ? 'bg-feisen-rojo text-white border-feisen-rojo'
                : 'bg-white text-feisen-texto-2 border-feisen-borde hover:border-feisen-rojo'
            }`}
          >
            {c.pill}
          </button>
        ))}
      </div>
      <main className="mt-6">
        {!mostrarForm ? (
          <button
            onClick={() => setMostrarForm(true)}
            className="bg-feisen-rojo text-white font-medium rounded-md px-4 py-2 mb-6 hover:opacity-90"
          >
            {cfg.textoBoton}
          </button>
        ) : (
          <form
            onSubmit={crear}
            className="bg-white border border-feisen-borde rounded-lg p-4 mb-6 flex gap-2 items-end max-w-md"
          >
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">{cfg.labelNombre}</label>
              <input
                autoFocus
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder={cfg.placeholderNombre}
                className="w-full border border-feisen-borde rounded-md px-3 py-2 outline-none focus:border-feisen-azul"
              />
            </div>
            <button
              type="submit"
              disabled={guardando}
              className="bg-feisen-azul text-white font-medium rounded-md px-4 py-2 hover:opacity-90 disabled:opacity-60"
            >
              {guardando ? 'Creando…' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarForm(false)
                setError('')
              }}
              className="text-sm text-feisen-texto-2 hover:underline px-2 py-2"
            >
              Cancelar
            </button>
          </form>
        )}
        {error && <p className="text-feisen-rojo text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm text-feisen-texto-2">Cargando…</p>
        ) : fichas.length === 0 ? (
          <p className="text-sm text-feisen-texto-2">{cfg.textoVacio}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {fichas.map((m) => {
              const margenPositivo = Number(m.margen) >= 0
              const tieneCosteo = Number(m.costo_total) > 0
              return (
                <div
                  key={m.ficha_id}
                  className="relative bg-white border border-feisen-borde rounded-lg p-4 hover:border-feisen-rojo transition-colors"
                >
                  <button
                    onClick={() => onSelect(m.ficha_id, m.nombre)}
                    className="text-left w-full pr-16"
                  >
                    <h2 className="font-semibold text-feisen-texto-2 mb-2">{m.nombre}</h2>
                    {tieneCosteo ? (
                      <>
                        <p className="text-sm text-feisen-texto-2">
                          Costo total: <span className="font-medium">{formatCOP(m.costo_total)}</span>
                        </p>
                        {tipo === 'maquina' && Number(m.precio_venta_actual) > 0 && (
                          <p
                            className={`text-sm font-medium ${
                              margenPositivo ? 'text-feisen-azul' : 'text-feisen-rojo'
                            }`}
                          >
                            Margen: {formatPct(m.margen_pct)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-feisen-texto-2">Todavía sin datos de costeo.</p>
                    )}
                  </button>
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button
                      onClick={() => renombrar(m.ficha_id, m.nombre)}
                      className="text-xs text-feisen-azul hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => eliminar(m.ficha_id, m.nombre)}
                      className="text-xs text-feisen-rojo hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
