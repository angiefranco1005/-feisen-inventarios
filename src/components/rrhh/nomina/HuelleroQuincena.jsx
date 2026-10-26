import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import Alerta from '../../shared/Alerta'
import { Fingerprint, Upload, ExternalLink } from 'lucide-react'
import * as E from '../estilos'
import { BUCKET_RRHH, nombreCompleto, abrirArchivoRRHH, formatoFecha } from '../catalogosRRHH'
import { leerArchivoHuellero, calcularHuellero, emparejarAlias, HORARIO } from './nominaCalculo'
import { quincenaDeFecha, nombreQuincena } from './nominaQuincena'

const limpiarNombre = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
const fmtH = (h) => Number(h || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })

// Sugerencia que se guarda en la liquidación (no cambia lo que se paga)
const sugerencia = (r, archivo) => ({
  nombre_huellero: r.nombre, horas_extra: r.horas_extra, horas_recargo: r.horas_recargo,
  dias_trabajados: r.dias_trabajados, incompletos: r.incompletos, dias: r.dias, archivo, calculado_en: new Date().toISOString(),
})

// Carga del archivo del huellero de la quincena: calcula horas extra y días
// por persona y los deja como SUGERIDOS en cada liquidación.
export default function HuelleroQuincena({ periodo, liqs, empleados, cerrada, onActualizado, onMoverQuincena }) {
  const input = useRef(null)
  const [procesando, setProcesando] = useState(false)
  const [resultado,  setResultado]  = useState(null)   // { sinVincular[], fueraQuincena[], aplicadas, ilegibles, porAlias }
  const [msg,        setMsg]        = useState(null)
  const [otraFecha,  setOtraFecha]  = useState(null)   // { file, desde, hasta, destino } si el archivo es de otra quincena
  const [pendiente,  setPendiente]  = useState(null)   // archivo a procesar cuando la quincena cambie de fechas

  // Si se movió la quincena para que coincida con el archivo, se procesa solo
  useEffect(() => {
    if (pendiente) { const f = pendiente; setPendiente(null); procesar(f) }
  }, [periodo.fecha_inicio])

  function subir(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (file) procesar(file)
  }

  async function moverYCargar() {
    const { file, destino } = otraFecha
    setOtraFecha(null); setPendiente(file)
    await onMoverQuincena(destino, { desdeHuellero: true })
  }

  async function procesar(file) {
    setProcesando(true); setMsg(null); setResultado(null); setOtraFecha(null)
    try {
      const { marcas, ilegibles } = leerArchivoHuellero(new Uint8Array(await file.arrayBuffer()))
      if (!marcas.length) throw new Error('No se encontraron marcaciones. El archivo debe tener una columna "Nombre" y otra "Fecha/Hora".')
      const porPersona = calcularHuellero(marcas, periodo.fecha_inicio, periodo.fecha_fin)
      if (!porPersona.length) {
        // El archivo es de otras fechas: decir de cuáles y ofrecer mover la quincena
        const fechas = marcas.map(m => m.fecha).sort()
        const desde = fechas[0], hasta = fechas[fechas.length - 1]
        const q1 = quincenaDeFecha(desde), q2 = quincenaDeFecha(hasta)
        const misma = q1.anio === q2.anio && q1.mes === q2.mes && q1.quincena === q2.quincena
        setOtraFecha({ file, desde, hasta, destino: misma ? q1 : null })
        setProcesando(false)
        return
      }

      // Guardar el archivo como soporte de la quincena
      const path = `nomina/${periodo.id}/huellero-${Date.now()}-${limpiarNombre(file.name)}`
      const { error: errUp } = await supabase.storage.from(BUCKET_RRHH).upload(path, file)
      if (errUp) throw new Error(`No se pudo guardar el archivo: ${errUp.message}`)
      if (periodo.huellero_path) await supabase.storage.from(BUCKET_RRHH).remove([periodo.huellero_path])
      await supabase.from('nomina_periodos')
        .update({ huellero_path: path, huellero_nombre: file.name, huellero_cargado_en: new Date().toISOString() }).eq('id', periodo.id)

      const { data: alias } = await supabase.from('nomina_alias').select('alias, empleado_id')
      const mapa = new Map((alias || []).map(a => [a.alias, a.empleado_id]))
      const r = await aplicar(porPersona, mapa, file.name, true)
      setResultado({ ...r, ilegibles, porPersona })
      onActualizado()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message })
    }
    setProcesando(false)
  }

  // Guarda la sugerencia en la liquidación de cada persona reconocida
  async function aplicar(porPersona, mapa, archivo, limpiarResto) {
    const liqPorEmp = new Map(liqs.map(l => [l.empleado_id, l]))
    const sinVincular = [], fueraQuincena = []
    const usadas = new Set()
    let aplicadas = 0
    for (const r of porPersona) {
      const empId = emparejarAlias(r.alias, empleados, mapa)
      if (!empId) { sinVincular.push(r); continue }
      const liq = liqPorEmp.get(empId)
      if (!liq) { fueraQuincena.push({ ...r, empId }); continue }
      const { error } = await supabase.from('nomina_liquidaciones').update({ huellero: sugerencia(r, archivo) }).eq('id', liq.id)
      if (error) throw new Error(error.message)
      usadas.add(liq.id); aplicadas++
    }
    // Al cargar un archivo nuevo, se borra la sugerencia anterior de quien ya no aparece
    if (limpiarResto) {
      const viejas = liqs.filter(l => l.huellero && !usadas.has(l.id)).map(l => l.id)
      if (viejas.length) await supabase.from('nomina_liquidaciones').update({ huellero: null }).in('id', viejas)
    }
    return { sinVincular, fueraQuincena, aplicadas }
  }

  async function vincular(r, empleadoId) {
    if (!empleadoId) return
    setMsg(null)
    const { error } = await supabase.from('nomina_alias').upsert({ alias: r.alias, empleado_id: empleadoId })
    if (error) { setMsg({ tipo: 'error', texto: error.message }); return }
    const liq = liqs.find(l => l.empleado_id === empleadoId)
    if (liq) {
      const { error: e2 } = await supabase.from('nomina_liquidaciones')
        .update({ huellero: sugerencia(r, periodo.huellero_nombre) }).eq('id', liq.id)
      if (e2) { setMsg({ tipo: 'error', texto: e2.message }); return }
    }
    setResultado(res => ({
      ...res,
      sinVincular: res.sinVincular.filter(x => x.alias !== r.alias),
      fueraQuincena: liq ? res.fueraQuincena : [...res.fueraQuincena, { ...r, empId: empleadoId }],
      aplicadas: res.aplicadas + (liq ? 1 : 0),
    }))
    onActualizado()
  }

  const empPorId = new Map(empleados.map(e => [e.id, e]))
  const conSugerencia = liqs.filter(l => l.huellero).length

  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}><Fingerprint {...E.ICONO} className={E.iconoTitulo} /> Huellero</h2>
        {!cerrada && (
          <button onClick={() => input.current?.click()} disabled={procesando} className={`${E.btnTextoAzul} -mr-2`}>
            <Upload size={14} strokeWidth={1.8} /> {procesando ? 'Calculando…' : periodo.huellero_path ? 'Cargar otro archivo' : 'Subir archivo'}
          </button>
        )}
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={subir} />
      </div>
      <div className="px-5 py-3 space-y-3 text-sm">
        {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}
        {otraFecha && (
          <div className="border border-amber-200 bg-amber-50 text-amber-800 rounded-lg px-3 py-2.5 space-y-2">
            <p>
              El archivo tiene marcaciones del {formatoFecha(otraFecha.desde)} al {formatoFecha(otraFecha.hasta)}, y esta nómina es{' '}
              {nombreQuincena(periodo).toLowerCase()}.
            </p>
            {otraFecha.destino && onMoverQuincena ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={moverYCargar} className={E.btnPrimario}>Cambiar la nómina a {nombreQuincena(otraFecha.destino).toLowerCase()} y cargar</button>
                <button onClick={() => setOtraFecha(null)} className={E.btnSecundario}>Cancelar</button>
              </div>
            ) : (
              <p className="text-xs">Revisa que sea el archivo correcto o cambia las fechas de la nómina con "Cambiar fechas".</p>
            )}
          </div>
        )}
        {periodo.huellero_path ? (
          <p className="text-feisen-texto-2">
            <button onClick={() => abrirArchivoRRHH(periodo.huellero_path).catch(err => setMsg({ tipo: 'error', texto: err.message }))}
              className="inline-flex items-center gap-1 text-feisen-texto hover:text-feisen-azul hover:underline">
              {periodo.huellero_nombre} <ExternalLink size={12} strokeWidth={1.8} />
            </button>
            {' · '}{conSugerencia} persona{conSugerencia === 1 ? '' : 's'} con horas sugeridas
          </p>
        ) : (
          <p className="text-xs text-feisen-gris-medio">
            Sube el archivo del huellero de la quincena (Excel con "Nombre" y "Fecha/Hora"). Se calculan las horas adicionales
            (horas extra en planta, servicios adicionales en contratistas) como <strong>sugerencia</strong> en cada liquidación; tú verificas si estaban autorizadas y decides si se aplican.
          </p>
        )}
        <p className="text-[11px] text-feisen-gris-medio">
          Horario: lunes a jueves {Math.floor(HORARIO.entrada / 60)}:{String(HORARIO.entrada % 60).padStart(2, '0')} a 5:30 p. m., viernes hasta 4:00 p. m. ·
          Antes de la entrada y después de la salida cuenta como hora adicional (desde 15 min = ½ h, redondeado a la media hora) ·
          Sábado: normal · Domingo y festivo: valor doble.
        </p>

        {resultado && (
          <div className="space-y-3 border-t border-feisen-borde-suave pt-3">
            <p className="text-feisen-texto">
              {resultado.aplicadas} persona{resultado.aplicadas === 1 ? '' : 's'} con sugerencia guardada.
              {resultado.ilegibles > 0 && <span className="text-amber-600"> {resultado.ilegibles} fila{resultado.ilegibles === 1 ? '' : 's'} con fecha que no se pudo leer.</span>}
            </p>
            {resultado.sinVincular.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700 mb-1.5">Nombres del huellero sin ficha reconocida: dime quién es cada uno (queda guardado para próximas quincenas).</p>
                <div className="space-y-1.5">
                  {resultado.sinVincular.map(r => (
                    <div key={r.alias} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-feisen-texto">
                        {r.nombre} <span className="text-xs text-feisen-gris-medio">· {fmtH(r.horas_extra)} h adicionales · {r.dias.length} día{r.dias.length === 1 ? '' : 's'}</span>
                      </span>
                      <select defaultValue="" onChange={e => vincular(r, e.target.value)} className={`${E.input} w-48`}>
                        <option value="">Es…</option>
                        {empleados.filter(e => e.estado !== 'retirado').map(e => <option key={e.id} value={e.id}>{nombreCompleto(e)}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {resultado.fueraQuincena.length > 0 && (
              <p className="text-xs text-feisen-texto-2">
                En el huellero pero no en esta quincena: {resultado.fueraQuincena.map(r => nombreCompleto(empPorId.get(r.empId))).join(', ')}.
                Agrégalos abajo y vuelve a cargar el archivo si deben liquidarse.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
