import { useEffect, useState } from 'react'
import { FileDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../shared/Modal'
import { hoy } from './utils/tiempos'
import { exportarFichaCosteoPDF } from './utils/fichaCosteoPDF'
import { calcularCostosEquipo } from './utils/equipoCosto'

// Botón + diálogo para descargar la ficha de costeo como documento controlado. Se puede volver a
// descargar la versión vigente o emitir una versión nueva (queda en costeo_fichas_versiones con
// su descripción y el costo de ese momento, y sale en el control de cambios del PDF).
export default function DescargarPDF({ ficha, onFichaCambio }) {
  const { perfil } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [versiones, setVersiones] = useState([])
  const [modo, setModo] = useState('nueva') // 'nueva' | 'vigente'
  const [f, setF] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto) return
    setError('')
    supabase
      .from('costeo_fichas_versiones')
      .select('*')
      .eq('ficha_id', ficha.id)
      .order('version')
      .then(({ data }) => {
        const vs = data || []
        setVersiones(vs)
        setModo(vs.length ? 'vigente' : 'nueva')
        setF({
          codigo: ficha.doc_codigo || `FC-${ficha.tipo === 'pieza' ? 'PZ' : 'MQ'}-`,
          referencia: ficha.referencia || '',
          descripcion: vs.length ? '' : 'Emisión inicial',
          elaboro: perfil?.nombre || '',
          reviso: ficha.doc_reviso || '',
          aprobo: ficha.doc_aprobo || '',
        })
      })
  }, [abierto, ficha, perfil])

  const vigente = versiones[versiones.length - 1]
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function generar(e) {
    e.preventDefault()
    setError('')
    const codigo = f.codigo.trim()
    if (!codigo || codigo.endsWith('-')) {
      setError('Ponle un código al documento (ej. FC-MQ-001).')
      return
    }
    if (modo === 'nueva' && !f.descripcion.trim()) {
      setError('Describe qué cambió en esta versión.')
      return
    }
    setGenerando(true)
    try {
      const { error: e1 } = await supabase
        .from('costeo_fichas')
        .update({ doc_codigo: codigo, referencia: f.referencia.trim() || null, doc_reviso: f.reviso.trim() || null, doc_aprobo: f.aprobo.trim() || null })
        .eq('id', ficha.id)
      if (e1) throw e1

      const datos = await cargarDatos(ficha.id)
      let lista = versiones
      let docVersion
      if (modo === 'nueva') {
        const fila = {
          ficha_id: ficha.id,
          version: (vigente?.version || 0) + 1,
          fecha: hoy(),
          descripcion: f.descripcion.trim(),
          costo_total: datos.resumen?.costo_total ?? 0,
          elaboro: f.elaboro.trim() || null,
          reviso: f.reviso.trim() || null,
          aprobo: f.aprobo.trim() || null,
        }
        const { error: e2 } = await supabase.from('costeo_fichas_versiones').insert(fila)
        if (e2) throw e2
        lista = [...versiones, fila]
        docVersion = fila
      } else {
        docVersion = vigente
      }

      exportarFichaCosteoPDF({
        ...datos,
        ficha: { ...datos.ficha, referencia: f.referencia.trim() },
        versiones: lista,
        doc: {
          codigo,
          version: docVersion.version,
          fecha: modo === 'nueva' ? hoy() : docVersion.fecha,
          elaboro: f.elaboro.trim(),
          reviso: f.reviso.trim(),
          aprobo: f.aprobo.trim(),
        },
      })
      onFichaCambio?.()
      setAbierto(false)
    } catch (err) {
      setError('No se pudo generar: ' + (err.message || err))
    } finally {
      setGenerando(false)
    }
  }

  const campo = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm outline-none focus:border-feisen-azul bg-white'

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 border border-feisen-borde bg-white text-sm text-feisen-texto rounded-lg px-3 py-2 hover:border-feisen-azul"
      >
        <FileDown size={16} className="text-feisen-texto-2" /> Descargar PDF
      </button>
      {abierto && f && (
        <Modal titulo="Ficha de costeo en PDF" onCerrar={() => setAbierto(false)}>
          <form onSubmit={generar} className="space-y-4">
            {versiones.length > 0 && (
              <div className="space-y-2 text-sm">
                <label className="flex items-start gap-2">
                  <input type="radio" checked={modo === 'vigente'} onChange={() => setModo('vigente')} className="mt-1" />
                  <span>
                    Volver a descargar la versión vigente (v{vigente.version} del {vigente.fecha})
                    <span className="block text-xs text-feisen-texto-2">Con los costos de hoy, mismo número de versión.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" checked={modo === 'nueva'} onChange={() => setModo('nueva')} className="mt-1" />
                  <span>
                    Emitir versión nueva (v{vigente.version + 1})
                    <span className="block text-xs text-feisen-texto-2">Queda registrada en el control de cambios.</span>
                  </span>
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-feisen-texto-2 mb-1">Código del documento</label>
                <input value={f.codigo} onChange={set('codigo')} placeholder="FC-MQ-001" className={campo} />
              </div>
              <div>
                <label className="block text-xs text-feisen-texto-2 mb-1">Referencia / modelo</label>
                <input value={f.referencia} onChange={set('referencia')} placeholder="MZ-350" className={campo} />
              </div>
            </div>
            {modo === 'nueva' && (
              <div>
                <label className="block text-xs text-feisen-texto-2 mb-1">Descripción del cambio</label>
                <input value={f.descripcion} onChange={set('descripcion')} placeholder="Actualización de tiempos de soldadura" className={campo} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-feisen-texto-2 mb-1">Elaboró</label>
                <input value={f.elaboro} onChange={set('elaboro')} className={campo} />
              </div>
              <div>
                <label className="block text-xs text-feisen-texto-2 mb-1">Revisó</label>
                <input value={f.reviso} onChange={set('reviso')} className={campo} />
              </div>
              <div>
                <label className="block text-xs text-feisen-texto-2 mb-1">Aprobó</label>
                <input value={f.aprobo} onChange={set('aprobo')} className={campo} />
              </div>
            </div>
            {error && <p className="text-feisen-rojo text-xs">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAbierto(false)} className="text-sm text-feisen-texto-2 hover:underline">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={generando}
                className="bg-feisen-azul text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-feisen-azul-claro disabled:opacity-60"
              >
                {generando ? 'Generando…' : 'Descargar PDF'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

// Todo lo que lleva el PDF, leído en el momento de generarlo (precios y tiempos al día).
async function cargarDatos(fichaId) {
  const [fi, rs, pr, cr, mt, tr, fp, fe] = await Promise.all([
    supabase.from('costeo_fichas').select('*').eq('id', fichaId).maybeSingle(),
    supabase.from('costeo_resumen').select('*').eq('ficha_id', fichaId).maybeSingle(),
    supabase.from('costeo_procesos').select('*').eq('ficha_id', fichaId).order('orden').order('created_at'),
    supabase.from('costeo_procesos_resumen').select('*').eq('ficha_id', fichaId),
    supabase
      .from('costeo_materiales')
      .select('id, proceso_id, item_id, item_nombre_libre, cantidad, rendimiento, created_at, items(nombre, precio_costo, unidad_medida)')
      .eq('ficha_id', fichaId)
      .order('created_at'),
    supabase.from('costeo_tiempos_reales').select('*').eq('ficha_id', fichaId).order('fecha').order('created_at'),
    supabase.from('costeo_ficha_piezas').select('pieza_id, cantidad').eq('contenedor_id', fichaId),
    supabase.from('costeo_ficha_equipos').select('equipo_id, horas').eq('ficha_id', fichaId),
  ])
  for (const r of [fi, rs, pr, cr, mt, tr, fp, fe]) if (r.error) throw r.error

  const agrupar = (filas) =>
    (filas || []).reduce((acc, x) => {
      if (x.proceso_id) (acc[x.proceso_id] ||= []).push(x)
      return acc
    }, {})
  const costos = Object.fromEntries((cr.data || []).map((c) => [c.proceso_id, c]))

  let piezas = []
  if (fp.data?.length) {
    const { data } = await supabase
      .from('costeo_resumen')
      .select('ficha_id, nombre, costo_total')
      .in('ficha_id', fp.data.map((x) => x.pieza_id))
    const porId = Object.fromEntries((data || []).map((x) => [x.ficha_id, x]))
    piezas = fp.data.map((x) => ({
      nombre: porId[x.pieza_id]?.nombre || 'Pieza',
      cantidad: Number(x.cantidad),
      costo_unitario: Number(porId[x.pieza_id]?.costo_total || 0),
    }))
  }

  let equipos = []
  if (fe.data?.length) {
    const { data } = await supabase.from('costeo_equipos_planta').select('*').in('id', fe.data.map((x) => x.equipo_id))
    const porId = Object.fromEntries((data || []).map((x) => [x.id, x]))
    equipos = fe.data.map((x) => {
      const eq = porId[x.equipo_id]
      return { nombre: eq?.nombre || 'Equipo', horas: Number(x.horas), valor_hora: Number(calcularCostosEquipo(eq).valorHora || 0) }
    })
  }

  return {
    ficha: fi.data,
    resumen: rs.data,
    procesos: (pr.data || []).map((p) => ({ ...p, costo: costos[p.id] })),
    materiales: agrupar(mt.data),
    tiempos: agrupar(tr.data),
    piezas,
    equipos,
  }
}
