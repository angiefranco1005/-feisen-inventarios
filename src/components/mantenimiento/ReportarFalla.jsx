import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { coincideBusqueda } from '../../utils/busqueda'
import { PanelLateral, Segmentado } from '../shared/ui'
import { Camera, Search, X } from '../shared/iconos'
import { campo, etiquetaCampo } from './comun'

// Reportar una falla: cualquier rol con equipos visibles (la RLS solo deja reportar en
// los equipos de sus bodegas). Crea la orden correctiva; si el equipo quedó parado, el
// trigger lo marca como Parado y empieza a contar el tiempo.
export default function ReportarFalla({ equipos, equipoInicial, onCerrar, onGuardado }) {
  const { perfil } = useAuth()
  const [equipoId, setEquipoId] = useState(equipoInicial || '')
  const [busqueda, setBusqueda] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [parado, setParado] = useState('si')
  const [foto, setFoto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const equipo = equipos.find(e => e.id === equipoId)
  const opciones = useMemo(() => equipos
    .filter(e => coincideBusqueda(`${e.codigo} ${e.nombre} ${e.marca || ''} ${e.bodegas?.nombre || ''}`, busqueda))
    .slice(0, 50), [equipos, busqueda])

  const guardar = async () => {
    if (!equipoId) { setError('Elige el equipo.'); return }
    if (!descripcion.trim()) { setError('Cuenta qué pasó.'); return }
    setGuardando(true); setError('')
    try {
      let fotoUrl = null
      if (foto) {
        const ext = (foto.name.split('.').pop() || 'jpg').toLowerCase()
        const ruta = `fallas/${equipoId}/${Date.now()}.${ext}`
        const { error: errFoto } = await supabase.storage.from('mantenimiento').upload(ruta, foto)
        if (errFoto) throw new Error('No se pudo subir la foto: ' + errFoto.message)
        fotoUrl = supabase.storage.from('mantenimiento').getPublicUrl(ruta).data.publicUrl
      }
      const { data, error: err } = await supabase.from('mant_ordenes').insert({
        equipo_id: equipoId, tipo: 'correctiva', estado: 'reportada', descripcion: descripcion.trim(),
        equipo_parado: parado === 'si', foto_url: fotoUrl, reportado_por: perfil.id,
      }).select('numero').single()
      if (err) throw new Error(err.message)
      onGuardado(data.numero)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <PanelLateral etiqueta="Reportar falla" onCerrar={onCerrar}
      encabezado={<><p className="text-xs text-gray-400">Mantenimiento</p><h2 className="text-lg font-semibold text-feisen-texto">Reportar falla</h2></>}>
      <div>
        <label className={etiquetaCampo}>Equipo</label>
        {equipo ? (
          <div className="flex items-center gap-3 border border-feisen-borde rounded-lg px-3 py-2.5 bg-white">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-feisen-texto truncate">{equipo.nombre}</p>
              <p className="text-xs text-feisen-texto-2">{equipo.codigo} · {equipo.bodegas?.nombre || 'General'}</p>
            </div>
            <button type="button" onClick={() => setEquipoId('')} className="text-sm font-medium text-feisen-azul px-2 py-1">Cambiar</button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Busca por nombre o código"
                className={`${campo} pl-10`} />
            </div>
            <div className="mt-2 border border-feisen-borde rounded-lg divide-y divide-feisen-borde-suave max-h-64 overflow-y-auto bg-white">
              {opciones.length === 0 && <p className="px-3 py-3 text-sm text-feisen-texto-2">No hay equipos con ese nombre.</p>}
              {opciones.map(e => (
                <button key={e.id} type="button" onClick={() => { setEquipoId(e.id); setBusqueda('') }}
                  className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-feisen-fondo">
                  <p className="text-sm text-feisen-texto">{e.nombre}</p>
                  <p className="text-xs text-feisen-texto-2">{e.codigo} · {e.bodegas?.nombre || 'General'}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div>
        <label htmlFor="falla-desc" className={etiquetaCampo}>¿Qué pasó?</label>
        <textarea id="falla-desc" rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)}
          placeholder="Ej.: no calienta, suena raro, bota aceite…" className={campo} />
      </div>

      <div>
        <p className={etiquetaCampo}>Foto <span className="font-normal text-feisen-texto-2">(opcional)</span></p>
        {foto ? (
          <div className="flex items-center gap-3 border border-feisen-borde rounded-lg px-3 py-2.5 bg-white">
            <img src={URL.createObjectURL(foto)} alt="" className="w-12 h-12 rounded object-cover" />
            <span className="flex-1 text-sm text-feisen-texto truncate">{foto.name}</span>
            <button type="button" onClick={() => setFoto(null)} aria-label="Quitar foto" className="p-2 text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 min-h-[64px] border border-dashed border-feisen-borde rounded-lg bg-white text-sm text-feisen-texto-2 cursor-pointer hover:bg-feisen-fondo">
            <Camera size={20} /> Tomar o elegir foto
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => setFoto(e.target.files?.[0] || null)} />
          </label>
        )}
      </div>

      <div>
        <p className={etiquetaCampo}>¿El equipo quedó parado?</p>
        <Segmentado valor={parado} onCambiar={setParado}
          opciones={[{ valor: 'si', texto: 'Sí, está parado' }, { valor: 'no', texto: 'No, sigue funcionando' }]} />
      </div>

      {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}

      <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-white border-t border-feisen-borde-suave">
        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full min-h-[48px] rounded-lg bg-feisen-azul text-white font-semibold disabled:opacity-50">
          {guardando ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </div>
    </PanelLateral>
  )
}
