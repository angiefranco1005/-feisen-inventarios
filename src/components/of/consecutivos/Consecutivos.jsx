import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Spinner from '../../shared/Spinner'
import Alerta from '../shared/Alerta'
import Modal from '../shared/Modal'
import { EncabezadoPagina, useAtajoBuscar } from '../../shared/ui'
import { fetchAllPages } from '../../../utils/fetchAllPages'
import { formatFecha } from '../shared/formatters'
import { RefreshCw, Upload, Download, Search, AlertTriangle } from '../../shared/iconos'
import { TIPOS_EQUIPO, TIPO_REVISAR, nombreTipo } from './tiposEquipo'
import { leerLibroConsecutivos } from './leerExcelConsecutivos'

// Ventas › Consecutivos de equipos (opción A que eligió Angie el 2026-11-26): una pestaña por tipo de
// equipo, como el Excel, pero se llena sola con lo que los asesores escriben en las notas de Odoo
// («REF 25768, 25769»). Lo más nuevo arriba; los números sin despacho se juntan en una fila ámbar.

const POR_PAGINA = 300
const INPUT = 'w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm bg-white text-feisen-texto placeholder:text-feisen-gris-medio focus:outline-none focus:ring-2 focus:ring-feisen-azul/25 focus:border-feisen-azul'
const BOTON = 'flex items-center gap-1.5 border border-feisen-borde bg-white hover:bg-feisen-fondo text-feisen-texto text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-60'

const fmtNum = n => Number(n).toLocaleString('es-CO')

function Empresa({ empresa }) {
  if (!empresa) return null
  return empresa === 'fc'
    ? <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-violet-50 text-violet-700">FC</span>
    : <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-feisen-azul-suave text-feisen-azul">Feisen</span>
}

export default function Consecutivos() {
  const { esAdmin } = useAuth()
  const [resumen, setResumen] = useState([])
  const [tipo, setTipo] = useState(() => { try { return localStorage.getItem('feisen-consecutivos-tipo') || 'mezcla' } catch { return 'mezcla' } })
  const [filas, setFilas] = useState([])
  const [avisos, setAvisos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargandoTipo, setCargandoTipo] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState(null) // búsqueda en todos los tipos
  const [empresa, setEmpresa] = useState('')
  const [pagina, setPagina] = useState(1)
  const [actualizando, setActualizando] = useState(false)
  const [importar, setImportar] = useState(null) // { filas, resumen, omitidas, archivo }
  const [importando, setImportando] = useState('')
  const buscador = useRef(null)
  const archivo = useRef(null)
  useAtajoBuscar(buscador)

  useEffect(() => { cargarResumen().finally(() => setCargando(false)) }, [])
  useEffect(() => { cargarTipo(tipo); setPagina(1) }, [tipo])

  async function cargarResumen() {
    const [{ data, error: e1 }, { data: av }] = await Promise.all([
      supabase.rpc('consecutivos_resumen'),
      supabase.from('equipos_consecutivos_avisos').select('*').order('fecha', { ascending: false }),
    ])
    if (e1) setError('No se pudieron cargar los consecutivos: ' + e1.message)
    setResumen(data || [])
    setAvisos(av || [])
  }

  async function cargarTipo(t) {
    setCargandoTipo(true)
    const { data, error: e1 } = await fetchAllPages((d, h) => supabase.from('equipos_consecutivos')
      .select('id, tipo, consecutivo, consecutivo_num, fecha, numero_of, cliente, capacidad, documento, empresa, origen, odoo_ref, observacion')
      .eq('tipo', t).order('consecutivo_num', { ascending: false, nullsFirst: false }).order('consecutivo').order('id').range(d, h))
    if (e1) setError('No se pudieron cargar los consecutivos: ' + e1.message)
    setFilas(data || [])
    setCargandoTipo(false)
  }

  function elegir(t) {
    setTipo(t); setBusqueda(''); setResultados(null)
    try { localStorage.setItem('feisen-consecutivos-tipo', t) } catch { /* sin almacenamiento */ }
  }

  // Búsqueda en todos los tipos (consecutivo, OF, documento o cliente), con una pausa al escribir
  useEffect(() => {
    const q = busqueda.trim().replace(/[,()*%]/g, ' ').trim()
    if (!q) { setResultados(null); return }
    const t = setTimeout(async () => {
      const filtro = /^\d+$/.test(q)
        ? `consecutivo.eq.${q},numero_of.eq.${q},documento.ilike.*${q}*`
        : `cliente.ilike.*${q}*,documento.ilike.*${q}*`
      const { data, error: e1 } = await supabase.from('equipos_consecutivos')
        .select('id, tipo, consecutivo, consecutivo_num, fecha, numero_of, cliente, capacidad, documento, empresa, origen, odoo_ref, observacion')
        .or(filtro).order('fecha', { ascending: false, nullsFirst: false }).limit(500)
      if (e1) setError('No se pudo buscar: ' + e1.message)
      setResultados(data || [])
      setPagina(1)
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // dias > 60 solo lo acepta la función para ADMIN (después de importar el Excel se relee todo Odoo)
  async function actualizarOdoo(dias = 60) {
    setActualizando(true); setMsg(null)
    const { data, error: e1 } = await supabase.functions.invoke('consecutivos-odoo', { body: { dias } })
    setActualizando(false)
    const res = data?.resultado
    if (e1 || !res) { setMsg({ tipo: 'error', texto: 'No se pudo leer Odoo: ' + (data?.error || e1?.message || 'sin respuesta') }); return }
    const partes = res.map(r => r.error
      ? `${r.empresa === 'fc' ? 'FC' : 'Feisen'}: ${r.error}`
      : `${r.empresa === 'fc' ? 'FC' : 'Feisen'}: ${r.facturas} facturas, ${fmtNum(r.consecutivos)} consecutivos`)
    setMsg({ tipo: res.some(r => r.error) ? 'alerta' : 'exito', texto: `Odoo leído (${dias > 60 ? 'todo el histórico' : 'últimos 60 días'}). ${partes.join(' · ')}.` })
    await Promise.all([cargarResumen(), cargarTipo(tipo)])
  }

  async function elegirArchivo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true })
      const r = leerLibroConsecutivos(wb, XLSX)
      if (!r.filas.length) { setMsg({ tipo: 'error', texto: 'No encontré consecutivos en ese archivo. ¿Es el Excel «CONSECUTIVO EQUIPOS»?' }); return }
      setImportar({ ...r, archivo: f.name })
    } catch (err) {
      setMsg({ tipo: 'error', texto: 'No se pudo leer el archivo: ' + err.message })
    }
  }

  async function confirmarImportar() {
    const LOTE = 2000
    const { filas: todas } = importar
    for (let i = 0; i < todas.length; i += LOTE) {
      setImportando(`Subiendo ${fmtNum(Math.min(i + LOTE, todas.length))} de ${fmtNum(todas.length)}…`)
      const { error: e1 } = await supabase.rpc('consecutivos_importar_excel', { p_filas: todas.slice(i, i + LOTE), p_reemplazar: i === 0 })
      if (e1) { setImportando(''); setMsg({ tipo: 'error', texto: `Se detuvo la importación en la fila ${fmtNum(i + 1)}: ${e1.message}` }); setImportar(null); return }
    }
    setImportando(''); setImportar(null)
    // Con el Excel cargado, se relee todo Odoo para cruzar y completar
    await actualizarOdoo(900)
    setMsg(m => ({ tipo: m?.tipo === 'error' ? 'alerta' : 'exito', texto: `Se importaron ${fmtNum(todas.length)} consecutivos del Excel. ${m?.texto || ''}` }))
  }

  const conteo = useMemo(() => Object.fromEntries(resumen.map(r => [r.tipo, r])), [resumen])
  const ultimaLectura = resumen.reduce((m, r) => (r.ultima_lectura && (!m || r.ultima_lectura > m) ? r.ultima_lectura : m), null)
  const tiposConDatos = TIPOS_EQUIPO.filter(t => conteo[t.clave]?.n > 0)
  const porRevisar = (conteo[TIPO_REVISAR]?.n || 0) + avisos.length
  const enRevisar = tipo === TIPO_REVISAR

  // Lo que se ve: búsqueda (todos los tipos) o la pestaña; filtrado por empresa
  const buscando = resultados !== null
  const base = (buscando ? resultados : filas).filter(f => !empresa || f.empresa === empresa)
  const repetidos = useMemo(() => {
    const n = {}
    filas.forEach(f => { n[f.consecutivo] = (n[f.consecutivo] || 0) + 1 })
    return n
  }, [filas])

  // Filas + huecos (números sin despacho registrado) cuando se ve la pestaña completa
  const items = useMemo(() => {
    if (buscando || empresa || enRevisar) return base.map(f => ({ fila: f }))
    const out = []
    base.forEach((f, i) => {
      out.push({ fila: f })
      const sig = base[i + 1]
      if (f.consecutivo_num != null && sig?.consecutivo_num != null && f.consecutivo_num - sig.consecutivo_num > 1) {
        out.push({ hueco: { desde: sig.consecutivo_num + 1, hasta: f.consecutivo_num - 1 } })
      }
    })
    return out
  }, [base, buscando, empresa, enRevisar])
  const visibles = items.slice(0, pagina * POR_PAGINA)

  function descargar() {
    const datos = base.map(f => ({
      Equipo: nombreTipo(f.tipo), Consecutivo: f.consecutivo, Fecha: f.fecha || '', OF: f.numero_of ?? '', Cliente: f.cliente || '',
      Capacidad: f.capacidad || '', 'Factura / remisión': f.documento || '', Empresa: f.empresa === 'fc' ? 'FC' : f.empresa === 'feisen' ? 'Feisen' : '',
      Origen: f.odoo_ref ? 'Odoo' : 'Excel', Observación: f.observacion || '',
    }))
    const ws = XLSX.utils.json_to_sheet(datos)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Consecutivos')
    XLSX.writeFile(wb, `Consecutivos ${buscando ? 'búsqueda' : nombreTipo(tipo)}.xlsx`)
  }

  if (cargando) return <Spinner texto="Cargando consecutivos..." />

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-24">
      <EncabezadoPagina modulo="Ventas" titulo="Consecutivos de equipos"
        subtitulo={ultimaLectura ? `Odoo Feisen y FC · última lectura ${new Date(ultimaLectura).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Se llena con los consecutivos que se escriben en las notas de Odoo («REF 25768, 25769»).'}>
        <button onClick={() => actualizarOdoo()} disabled={actualizando} className={BOTON}>
          <RefreshCw size={16} className={actualizando ? 'animate-spin' : ''} /> {actualizando ? 'Leyendo Odoo…' : 'Actualizar desde Odoo'}
        </button>
        {esAdmin && (
          <>
            <button onClick={() => archivo.current?.click()} className={BOTON}><Upload size={16} /> Importar Excel</button>
            <input ref={archivo} type="file" accept=".xlsx,.xls" className="hidden" onChange={elegirArchivo} />
          </>
        )}
      </EncabezadoPagina>

      {error && <Alerta tipo="error" mensaje={error} />}
      {msg && <Alerta tipo={msg.tipo} mensaje={msg.texto} />}

      {/* Pestañas por tipo de equipo */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        {(tiposConDatos.length ? tiposConDatos : TIPOS_EQUIPO.slice(0, 6)).map(t => (
          <button key={t.clave} onClick={() => elegir(t.clave)}
            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${tipo === t.clave && !buscando ? 'bg-feisen-azul-suave border-feisen-azul/40 text-feisen-azul font-semibold' : 'bg-white border-feisen-borde text-feisen-texto-2 hover:text-feisen-texto'}`}>
            {t.nombre} <span className="tabular-nums opacity-80">{fmtNum(conteo[t.clave]?.n || 0)}</span>
          </button>
        ))}
        {porRevisar > 0 && (
          <button onClick={() => elegir(TIPO_REVISAR)}
            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-[13px] flex items-center gap-1 ${enRevisar && !buscando ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold' : 'bg-white border-amber-200 text-amber-700'}`}>
            <AlertTriangle size={14} /> Por revisar <span className="tabular-nums">{porRevisar}</span>
          </button>
        )}
      </div>

      {/* Buscar y filtrar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-gris-medio pointer-events-none" />
          <input ref={buscador} value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar consecutivo, cliente, OF o factura en todos los equipos" className={`${INPUT} pl-9`} />
        </div>
        <select value={empresa} onChange={e => { setEmpresa(e.target.value); setPagina(1) }} className={INPUT.replace('w-full ', '') + ' w-auto'}>
          <option value="">Todas las empresas</option>
          <option value="feisen">Feisen</option>
          <option value="fc">FC</option>
        </select>
        <button onClick={descargar} disabled={!base.length} className={BOTON}><Download size={16} /> Excel</button>
      </div>

      {/* Facturas con algo por revisar */}
      {enRevisar && !buscando && avisos.length > 0 && (
        <section className="bg-white border border-amber-200 rounded-xl">
          <h2 className="px-4 py-3 border-b border-amber-100 text-xs font-semibold uppercase tracking-wide text-amber-800">Facturas de Odoo por revisar</h2>
          <ul className="divide-y divide-feisen-borde-suave">
            {avisos.map(a => (
              <li key={a.odoo_ref} className="px-4 py-2.5 text-sm flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-feisen-texto"><Empresa empresa={a.empresa} /> <span className="font-semibold ml-1">{a.documento}</span> <span className="ml-1">{a.cliente}</span></p>
                  <p className="text-xs text-feisen-texto-2">{a.fecha ? formatFecha(a.fecha) : 'Sin fecha'}{a.numero_of ? ` · OF ${a.numero_of}` : ''}</p>
                </div>
                <span className="flex-shrink-0 text-xs text-amber-800 bg-amber-50 rounded-md px-2 py-0.5">{a.problema}</span>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 text-xs text-feisen-texto-2 border-t border-feisen-borde-suave">Se arregla en la nota de la factura en Odoo: «REF» y los consecutivos, un grupo por producto separado con «/». En la próxima lectura desaparece.</p>
        </section>
      )}

      {/* Tabla */}
      {cargandoTipo && !buscando ? <Spinner texto="Cargando..." /> : (
        <section className="bg-white border border-feisen-borde rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-feisen-borde-suave flex items-center justify-between text-xs text-feisen-texto-2">
            <span className="font-semibold uppercase tracking-wide">{buscando ? `Búsqueda en todos los equipos` : nombreTipo(tipo)}</span>
            <span className="tabular-nums">{fmtNum(base.length)} {base.length === 1 ? 'consecutivo' : 'consecutivos'}</span>
          </div>
          {base.length === 0 ? (
            <p className="px-4 py-10 text-sm text-feisen-texto-2 text-center">
              {buscando ? 'No hay consecutivos que coincidan.' : resumen.length === 0
                ? (esAdmin ? 'Todavía no hay consecutivos. Importa el Excel con «Importar Excel» y luego «Actualizar desde Odoo».' : 'Todavía no hay consecutivos cargados.')
                : 'No hay consecutivos con este filtro.'}
            </p>
          ) : (
            <>
              {/* Escritorio */}
              <table className="hidden lg:table w-full text-sm table-fixed">
                <colgroup>
                  {buscando && <col className="w-[14%]" />}
                  <col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[6%]" /><col /><col className="w-[9%]" /><col className="w-[19%]" />
                </colgroup>
                <thead>
                  <tr className="text-xs text-feisen-texto-2 border-b border-feisen-borde-suave">
                    {buscando && <th className="text-left font-medium px-4 py-2">Equipo</th>}
                    <th className="text-left font-medium px-4 py-2">Consecutivo</th>
                    <th className="text-left font-medium px-2 py-2">Fecha</th>
                    <th className="text-left font-medium px-2 py-2">OF</th>
                    <th className="text-left font-medium px-2 py-2">Cliente</th>
                    <th className="text-left font-medium px-2 py-2">Capacidad</th>
                    <th className="text-left font-medium px-4 py-2">Factura / remisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-feisen-borde-suave">
                  {visibles.map((it, i) => it.hueco ? (
                    <tr key={`h${i}`} className="bg-amber-50/60">
                      <td colSpan={buscando ? 7 : 6} className="px-4 py-1.5 text-xs text-amber-800">
                        <span className="font-semibold tabular-nums">{it.hueco.desde === it.hueco.hasta ? fmtNum(it.hueco.desde) : `${fmtNum(it.hueco.desde)} – ${fmtNum(it.hueco.hasta)}`}</span>
                        {' '}· {it.hueco.hasta - it.hueco.desde + 1 === 1 ? '1 consecutivo sin despacho registrado' : `${fmtNum(it.hueco.hasta - it.hueco.desde + 1)} consecutivos sin despacho registrado`}
                      </td>
                    </tr>
                  ) : (
                    <Fila key={it.fila.id} f={it.fila} conTipo={buscando} repetido={!buscando && repetidos[it.fila.consecutivo] > 1} />
                  ))}
                </tbody>
              </table>

              {/* Celular */}
              <ul className="lg:hidden divide-y divide-feisen-borde-suave">
                {visibles.map((it, i) => it.hueco ? (
                  <li key={`h${i}`} className="px-4 py-2 text-xs text-amber-800 bg-amber-50/60">
                    <span className="font-semibold tabular-nums">{it.hueco.desde === it.hueco.hasta ? fmtNum(it.hueco.desde) : `${fmtNum(it.hueco.desde)} – ${fmtNum(it.hueco.hasta)}`}</span> · sin despacho registrado
                  </li>
                ) : (
                  <li key={it.fila.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate">
                        <span className="font-semibold text-feisen-azul tabular-nums">{it.fila.consecutivo}</span>
                        {buscando && <span className="ml-1.5 text-xs text-feisen-texto-2">{nombreTipo(it.fila.tipo)}</span>}
                        <span className="ml-1.5 text-feisen-texto">{it.fila.cliente}</span>
                      </p>
                      <span className="text-xs text-feisen-texto-2 tabular-nums flex-shrink-0">{it.fila.fecha ? formatFecha(it.fila.fecha) : '—'}</span>
                    </div>
                    <p className="text-xs text-feisen-texto-2 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <Empresa empresa={it.fila.empresa} /> {it.fila.documento || 'Sin documento'}
                      {it.fila.numero_of != null && <> · OF {it.fila.numero_of}</>}
                      {it.fila.capacidad && <> · {it.fila.capacidad}</>}
                      {!buscando && repetidos[it.fila.consecutivo] > 1 && <span className="text-feisen-rojo font-medium">· Repetido</span>}
                    </p>
                  </li>
                ))}
              </ul>

              {items.length > visibles.length && (
                <button onClick={() => setPagina(p => p + 1)} className="w-full px-4 py-2.5 text-sm text-feisen-azul font-medium border-t border-feisen-borde-suave hover:bg-feisen-fondo">
                  Ver más ({fmtNum(items.length - visibles.length)} más)
                </button>
              )}
            </>
          )}
        </section>
      )}

      {importar && (
        <Modal titulo="Importar el Excel de consecutivos" onCerrar={() => !importando && setImportar(null)}>
          <div className="space-y-4 text-sm">
            <p className="text-feisen-texto">
              <span className="font-semibold">{importar.archivo}</span>: {fmtNum(importar.filas.length)} consecutivos con cliente.
            </p>
            <ul className="text-feisen-texto-2 divide-y divide-feisen-borde-suave border border-feisen-borde-suave rounded-lg">
              {importar.resumen.map(r => (
                <li key={r.tipo} className="px-3 py-1.5 flex justify-between"><span>{nombreTipo(r.tipo)}</span><span className="tabular-nums">{fmtNum(r.filas)}</span></li>
              ))}
            </ul>
            {importar.omitidas.length > 0 && <p className="text-xs text-feisen-texto-2">No se importan las hojas: {importar.omitidas.join(', ')}.</p>}
            <p className="text-xs text-feisen-texto-2">Reemplaza lo que se haya importado antes del Excel. Lo que ya se leyó de Odoo no se toca: cuando un consecutivo está en los dos, manda Odoo.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setImportar(null)} disabled={!!importando} className={BOTON}>Cancelar</button>
              <button onClick={confirmarImportar} disabled={!!importando}
                className="bg-feisen-azul hover:bg-feisen-azul-claro text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">
                {importando || 'Importar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Fila({ f, conTipo, repetido }) {
  return (
    <tr className="hover:bg-feisen-fondo/60">
      {conTipo && <td className="px-4 py-2 text-feisen-texto-2 truncate">{nombreTipo(f.tipo)}</td>}
      <td className="px-4 py-2 font-semibold tabular-nums text-feisen-texto">
        {f.consecutivo}
        {repetido && <span className="block text-[11px] font-medium text-feisen-rojo" title="Este consecutivo aparece en más de un documento">Repetido</span>}
      </td>
      <td className="px-2 py-2 tabular-nums text-feisen-texto-2 whitespace-nowrap">{f.fecha ? formatFecha(f.fecha) : '—'}</td>
      <td className="px-2 py-2 tabular-nums text-feisen-texto-2">{f.numero_of ?? '—'}</td>
      <td className="px-2 py-2 truncate text-feisen-texto" title={[f.cliente, f.observacion].filter(Boolean).join(' · ')}>{f.cliente || '—'}</td>
      <td className="px-2 py-2 truncate text-feisen-texto-2">{f.capacidad || '—'}</td>
      <td className="px-4 py-2 truncate" title={f.odoo_ref ? 'Confirmado en Odoo' : 'Del Excel'}>
        <span className="inline-flex items-center gap-1.5"><Empresa empresa={f.empresa} /> <span className="tabular-nums text-feisen-texto">{f.documento || '—'}</span></span>
      </td>
    </tr>
  )
}
