import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { nombreBodega } from '../../utils/bodegasCatalogo'
import {
  PackageCheck, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Search, Flame, User, Recycle,
  Info, Loader2, X
} from '../shared/iconos'
import { EncabezadoPagina, ChipBodega, Segmentado, Contador, useAviso, useAtajoBuscar } from '../shared/ui'

const claseInput = 'w-full border border-feisen-borde rounded-lg px-3 py-2.5 bg-white text-feisen-texto focus:outline-none focus:border-feisen-azul focus:ring-2 focus:ring-feisen-azul-suave'
// Kilos con formato colombiano (solo para mostrar; lo que se guarda no cambia)
const kg = (n, dec = 1) => Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec })
// El Contador es un campo de texto: se deja solo dígitos y punto (como hacía el input type="number")
const soloNumero = v => String(v).replace(',', '.').replace(/[^0-9.]/g, '')

const HIERRO_COLADO_ITEM_ID = '52546e1a-dd2b-46c6-8857-9895497f228a'
const VACEADERO_ITEM_ID     = 'afc4f062-48c1-47cc-92c2-c9e4536bfff5'
// Antes se buscaba por nombre (ilike 'nombre','%FUNDICIÓN%'): si la bodega se
// renombraba, la búsqueda fallaba en silencio y los 3 movimientos de stock de
// esta pantalla se saltaban sin ningún aviso, aunque la orden igual quedaba
// marcada como completada. Se usa el id fijo (mismo que en
// TransferenciasPendientes.jsx) para que nunca dependa de un nombre editable.
const FUNDICION_BODEGA_ID = 'a0604489-2768-445b-8e68-e450ef8520ed'

function numOrden(n) { return `ORD-MOL-${String(n).padStart(4, '0')}` }
function numFun(n)   { return `FUN-${String(n).padStart(4, '0')}` }
function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

async function generarNumero(perfil, prefix) {
  const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
  const pre = `${prefix}-${iniciales}-`
  const { data: last } = await supabase
    .from('movimientos').select('numero').like('numero', `${pre}%`)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  const n = last?.numero ? parseInt(last.numero.replace(pre, ''), 10) || 0 : 0
  return `${pre}${String(n + 1).padStart(4, '0')}`
}

// Movimientos vigentes de un ítem con esa referencia exacta. Sirve para que reintentar una
// recogida que falló a mitad no vuelva a crear los movimientos que sí alcanzaron a guardarse.
async function movimientosDe(referencia, tipo, itemIds) {
  const { data, error } = await supabase.from('movimientos')
    .select('item_id').eq('referencia', referencia).eq('tipo', tipo)
    .in('item_id', itemIds).eq('revertido', false)
  if (error) throw error
  return data || []
}

export default function RecogidaFundida() {
  const { perfil } = useAuth()

  const [tab,          setTab]          = useState('pendientes')
  const [ordenes,      setOrdenes]      = useState([])
  const [completadas,  setCompletadas]  = useState([])
  const [fundidas,     setFundidas]     = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [expandido,    setExpandido]    = useState(null)
  const [busqueda,     setBusqueda]     = useState('')
  const [busquedaComp, setBusquedaComp] = useState('')

  // avances por orden: { [ordenId]: { [piezaId]: totalMoldeado } }
  const [avancesRef,   setAvancesRef]   = useState({})

  // inputs por orden: { [ordenId]: { [piezaId]: { conforme, nc, motivo } } }
  const [inputs,       setInputs]       = useState({})
  const [guardando,    setGuardando]    = useState(null)
  const [errores,      setErrores]      = useState({})
  const [exitoOrden,   setExitoOrden]   = useState(null)

  // fundida vinculada por orden: { [ordenId]: fundidaId }
  const [fundidaSel,   setFundidaSel]   = useState({})
  // vaceadero en kg por orden: { [ordenId]: string }
  const [vaceaderoKg,  setVaceaderoKg]  = useState({})
  // movimientos hierro/vaceadero de órdenes completadas: { [numOrden]: { hierro, vaceadero } }
  const [movsComp,     setMovsComp]     = useState({})
  // fundidas cuyo hierro colado ya se descontó en una orden: { [fundidaId]: 'ORD-MOL-xxxx' }
  const [fundidaUsada, setFundidaUsada] = useState({})

  const [aviso, avisar] = useAviso()
  const buscarRef = useRef(null)
  useAtajoBuscar(buscarRef)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const piezasSelect = `
      id, item_id, cantidad_planeada, asignado_a,
      cantidad_conforme, cantidad_nc, motivo_nc,
      items(id, nombre, precio_costo, peso_unitario)
    `
    const [{ data: ords }, { data: comps }, { data: funs }] = await Promise.all([
      supabase.from('ordenes_moldeo')
        .select(`id, numero, fecha, estado, ordenes_moldeo_piezas(${piezasSelect}), ordenes_moldeo_maquinas(cantidad_maquinas, maquinas_fundicion(nombre))`)
        .eq('estado', 'pendiente')
        .order('fecha', { ascending: false }),
      supabase.from('ordenes_moldeo')
        .select(`id, numero, fecha, estado, ordenes_moldeo_piezas(${piezasSelect})`)
        .eq('estado', 'completado')
        .order('fecha', { ascending: false })
        .limit(60),
      supabase.from('fundidas')
        .select('id, numero, fecha, hierro_colado')
        .not('hierro_colado', 'is', null)
        .gt('hierro_colado', 0)
        .order('fecha', { ascending: false })
        .limit(90),
    ])
    setOrdenes(ords || [])
    setCompletadas(comps || [])
    setFundidas(funs || [])

    // El hierro de una fundida se descuenta una sola vez: ver a qué orden ya se cargó cada una
    // (referencia "ORD-MOL-xxxx · FUN-xxxx" de la salida de hierro colado)
    if ((funs || []).length > 0) {
      const { data: salHierro } = await supabase.from('movimientos')
        .select('referencia')
        .or(funs.map(f => `referencia.like.%${numFun(f.numero)}`).join(','))
        .eq('item_id', HIERRO_COLADO_ITEM_ID).eq('tipo', 'salida').eq('revertido', false)
      const usadas = {}
      for (const m of (salHierro || [])) {
        const f = funs.find(x => m.referencia?.endsWith(numFun(x.numero)))
        if (f) usadas[f.id] = m.referencia.split('·')[0].trim()
      }
      setFundidaUsada(usadas)
    }

    // Cargar movimientos de hierro colado y vaceadero para órdenes completadas
    const numRefs = (comps || []).map(o => numOrden(o.numero))
    if (numRefs.length > 0) {
      const orFilter = numRefs.map(r => `referencia.like.${r}%`).join(',')
      const { data: movsData } = await supabase
        .from('movimientos')
        .select('referencia, item_id, tipo, cantidad')
        .or(orFilter)
        .in('item_id', [HIERRO_COLADO_ITEM_ID, VACEADERO_ITEM_ID])
        .eq('revertido', false)
      const mapa = {}
      for (const m of (movsData || [])) {
        const ref = numRefs.find(r => m.referencia?.startsWith(r))
        if (!ref) continue
        if (!mapa[ref]) mapa[ref] = { hierro: 0, vaceadero: 0 }
        if (m.item_id === HIERRO_COLADO_ITEM_ID && m.tipo === 'salida') mapa[ref].hierro += Number(m.cantidad)
        if (m.item_id === VACEADERO_ITEM_ID     && m.tipo === 'entrada') mapa[ref].vaceadero += Number(m.cantidad)
      }
      setMovsComp(mapa)
    }

    setCargando(false)
  }

  async function cargarAvances(orden) {
    const piezaIds = (orden.ordenes_moldeo_piezas || []).map(p => p.id)
    if (piezaIds.length === 0) return
    const { data } = await supabase
      .from('ordenes_moldeo_avances')
      .select('orden_pieza_id, cantidad_moldeada')
      .in('orden_pieza_id', piezaIds)
    const map = {}
    for (const a of (data || [])) {
      map[a.orden_pieza_id] = (map[a.orden_pieza_id] || 0) + a.cantidad_moldeada
    }
    setAvancesRef(prev => ({ ...prev, [orden.id]: map }))
  }

  async function toggle(orden) {
    if (expandido === orden.id) { setExpandido(null); return }
    setExpandido(orden.id)
    if (!avancesRef[orden.id]) await cargarAvances(orden)
  }

  function setField(ordenId, piezaId, campo, val) {
    setInputs(prev => ({
      ...prev,
      [ordenId]: {
        ...(prev[ordenId] || {}),
        [piezaId]: { ...(prev[ordenId]?.[piezaId] || {}), [campo]: val },
      },
    }))
  }
  function getField(ordenId, piezaId, campo) {
    return inputs[ordenId]?.[piezaId]?.[campo] ?? ''
  }

  // Pre-rellenar conformes con el avance registrado
  function preRellenar(orden) {
    const avOrden = avancesRef[orden.id] || {}
    const nuevos = {}
    for (const p of (orden.ordenes_moldeo_piezas || [])) {
      const av = avOrden[p.id] || 0
      nuevos[p.id] = {
        conforme: av > 0 ? String(av) : '',
        nc:       '',
        motivo:   '',
      }
    }
    setInputs(prev => ({ ...prev, [orden.id]: nuevos }))
  }

  // Calcular kg de piezas buenas para una orden
  function calcKgPiezas(orden) {
    return (orden.ordenes_moldeo_piezas || []).reduce((s, p) => {
      const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
      const peso = Number(p.items?.peso_unitario || 0)
      return s + conf * peso
    }, 0)
  }

  async function guardarRecogida(orden) {
    setErrores(prev => ({ ...prev, [orden.id]: '' }))
    const piezas = orden.ordenes_moldeo_piezas || []

    // Validaciones
    for (const p of piezas) {
      const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
      const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
      const plan = Number(p.cantidad_planeada || 0)
      if (conf < 0 || nc < 0) {
        setErrores(prev => ({ ...prev, [orden.id]: 'Las cantidades no pueden ser negativas.' }))
        return
      }
      // Si la suma supera lo planeado SÍ se permite (piezas de otras fundidas que solo
      // se identifican al pulir). Si queda POR DEBAJO también se permite, pero exige
      // una aclaración de por qué no salió todo lo planeado.
      if (plan > 0 && conf + nc < plan) {
        const aclar = String(getField(orden.id, p.id, 'faltante') || '').trim()
        if (aclar.length < 3) {
          setErrores(prev => ({ ...prev, [orden.id]: `"${p.items?.nombre}": faltan ${plan - conf - nc} por contabilizar (conformes ${conf} + NC ${nc} de ${plan} planeadas). Escribe la aclaración de por qué no salió todo lo planeado.` }))
          return
        }
      }
    }

    const hayAlgo = piezas.some(p => {
      const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
      const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
      const aclar = String(getField(orden.id, p.id, 'faltante') || '').trim()
      return conf > 0 || nc > 0 || aclar.length >= 3
    })
    if (!hayAlgo) {
      setErrores(prev => ({ ...prev, [orden.id]: 'Ingresa al menos una cantidad de conformes o NC.' }))
      return
    }

    // El hierro de una fundida solo se descuenta una vez (si ya se cargó a otra orden, no se repite)
    const usadaEn = fundidaUsada[fundidaSel[orden.id]]
    if (fundidaSel[orden.id] && usadaEn && usadaEn !== numOrden(orden.numero)) {
      setErrores(prev => ({ ...prev, [orden.id]: `El hierro de esa fundida ya se descontó en ${usadaEn}. Elige otra fundida o deja "Sin vincular".` }))
      return
    }

    setGuardando(orden.id)
    try {
      const ref = numOrden(orden.numero)
      const ccFundicion = await nombreBodega(FUNDICION_BODEGA_ID, 'FUNDICIÓN') // nombre actual de la bodega
      // 1. Actualizar piezas con conformes/NC/motivo
      for (const p of piezas) {
        const conf   = Number(getField(orden.id, p.id, 'conforme') || 0)
        const nc     = Number(getField(orden.id, p.id, 'nc') || 0)
        const motivoNC = String(getField(orden.id, p.id, 'motivo') || '').trim()
        const plan   = Number(p.cantidad_planeada || 0)
        const falta  = plan > 0 ? plan - conf - nc : 0
        const aclar  = String(getField(orden.id, p.id, 'faltante') || '').trim()
        // La aclaración del faltante se guarda junto al motivo (no requiere columna nueva)
        const motivo = [motivoNC, falta > 0 && aclar ? `Faltante ${falta} de ${plan}: ${aclar}` : '']
          .filter(Boolean).join(' | ') || null
        const { error } = await supabase.from('ordenes_moldeo_piezas')
          .update({ cantidad_conforme: conf, cantidad_nc: nc, motivo_nc: motivo })
          .eq('id', p.id)
        if (error) throw error
      }

      // 2. Movimientos de entrada por piezas conformes (se omite si un intento anterior ya la guardó)
      const piezasConformes = piezas.filter(p => Number(getField(orden.id, p.id, 'conforme') || 0) > 0)
      const entradasPrevias = piezasConformes.length > 0
        ? await movimientosDe(ref, 'entrada', piezasConformes.map(p => p.item_id)) : []
      if (piezasConformes.length > 0 && entradasPrevias.length === 0) {
        const numero = await generarNumero(perfil, 'ENT')
        const { error: errMov } = await supabase.from('movimientos').insert(
          piezasConformes.map(p => ({
            numero,
            tipo:                  'entrada',
            item_id:               p.item_id,
            bodega_destino_id:     FUNDICION_BODEGA_ID,
            bodega_origen_id:      null,
            cantidad:              Number(getField(orden.id, p.id, 'conforme')),
            precio_costo_snapshot: p.items?.precio_costo || 0,
            centro_costo:          ccFundicion,
            usuario_id:            perfil.id,
            proveedor:             'Producción interna',
            referencia:            numOrden(orden.numero),
            fecha_movimiento:      orden.fecha || null,
            foto_remision_url: null, destino: null,
            numero_of: null, serial_motor: null, motivo: null, cliente: null,
          }))
        )
        if (errMov) throw errMov
      }

      // 3. Salida automática de HIERRO COLADO si hay fundida vinculada
      const fundidaId = fundidaSel[orden.id]
      if (fundidaId) {
        const fundida = fundidas.find(f => f.id === fundidaId)
        // Revisión en la base (no solo en lo cargado): otra persona pudo vincularla mientras tanto
        const { data: salidasFun, error: errFun } = fundida ? await supabase.from('movimientos')
          .select('referencia').like('referencia', `%${numFun(fundida.numero)}`)
          .eq('item_id', HIERRO_COLADO_ITEM_ID).eq('tipo', 'salida').eq('revertido', false)
          : { data: [] }
        if (errFun) throw errFun
        const otraOrden = (salidasFun || []).find(m => !m.referencia?.startsWith(ref))
        if (otraOrden) {
          throw new Error(`el hierro de ${numFun(fundida.numero)} ya se descontó en ${otraOrden.referencia.split('·')[0].trim()}. Elige otra fundida o deja "Sin vincular"`)
        }
        const yaDescontado = (salidasFun || []).length > 0
        if (fundida?.hierro_colado > 0 && !yaDescontado) {
          const numSal = await generarNumero(perfil, 'SAL')
          const { error: errHC } = await supabase.from('movimientos').insert({
            numero:                numSal,
            tipo:                  'salida',
            item_id:               HIERRO_COLADO_ITEM_ID,
            bodega_origen_id:      FUNDICION_BODEGA_ID,
            bodega_destino_id:     null,
            cantidad:              fundida.hierro_colado,
            precio_costo_snapshot: 0,
            centro_costo:          ccFundicion,
            usuario_id:            perfil.id,
            referencia:            `${numOrden(orden.numero)} · ${numFun(fundida.numero)}`,
            fecha_movimiento:      orden.fecha || null,
            motivo:                'Consumo horno fundición',
            foto_remision_url: null, destino: null,
            numero_of: null, serial_motor: null, cliente: null, proveedor: null,
          })
          if (errHC) throw errHC
        }
      }

      // 4. Entrada de VACEADERO = kg manual + kg de piezas NC (vuelven al horno)
      const kgManual = Number(vaceaderoKg[orden.id] || 0)
      const kgNC = piezas.reduce((s, p) => {
        const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
        const peso = Number(p.items?.peso_unitario || 0)
        return s + nc * peso
      }, 0)
      const kgVacTotal = kgManual + kgNC
      const vacPrevio = kgVacTotal > 0 ? await movimientosDe(ref, 'entrada', [VACEADERO_ITEM_ID]) : []
      if (kgVacTotal > 0 && vacPrevio.length === 0) {
        const numVac = await generarNumero(perfil, 'ENT')
        const { error: errVac } = await supabase.from('movimientos').insert({
          numero:                numVac,
          tipo:                  'entrada',
          item_id:               VACEADERO_ITEM_ID,
          bodega_destino_id:     FUNDICION_BODEGA_ID,
          bodega_origen_id:      null,
          cantidad:              kgVacTotal,
          precio_costo_snapshot: 0,
          centro_costo:          ccFundicion,
          usuario_id:            perfil.id,
          proveedor:             'Producción interna',
          referencia:            numOrden(orden.numero),
          fecha_movimiento:      orden.fecha || null,
          motivo:                `Vaceadero recogida: ${kgManual > 0 ? `${kgManual} kg manual` : ''}${kgManual > 0 && kgNC > 0 ? ' + ' : ''}${kgNC > 0 ? `${kgNC.toFixed(2)} kg piezas NC` : ''}`,
          foto_remision_url: null, destino: null,
          numero_of: null, serial_motor: null, cliente: null,
        })
        if (errVac) throw errVac
      }

      // 5. Marcar orden como completada
      const { error: errOrd } = await supabase.from('ordenes_moldeo')
        .update({ estado: 'completado' }).eq('id', orden.id)
      if (errOrd) throw errOrd

      setExitoOrden(orden.id)
      avisar(`Recogida de ${numOrden(orden.numero)} registrada`)
      setTimeout(() => {
        setExitoOrden(null)
        setExpandido(null)
        cargar()
      }, 2500)
    } catch (e) {
      setErrores(prev => ({ ...prev, [orden.id]: `Error al guardar: ${e.message}. Puedes volver a intentar: lo que alcanzó a guardarse no se repite.` }))
    } finally {
      setGuardando(null)
    }
  }

  const filtradas = ordenes.filter(o => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return true
    return (
      numOrden(o.numero).toLowerCase().includes(q) ||
      fmtFecha(o.fecha).includes(q) ||
      (o.ordenes_moldeo_piezas || []).some(p => p.items?.nombre?.toLowerCase().includes(q))
    )
  })

  const q = (tab === 'pendientes' ? busqueda : busquedaComp).trim()

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {aviso}

      <EncabezadoPagina modulo="Fundición" titulo="Recogida de fundida"
        subtitulo={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">Lo que salió de cada orden de moldeo · Bodega <ChipBodega>Fundición</ChipBodega></span>} />

      {/* Pestañas */}
      <Segmentado valor={tab}
        onCambiar={id => { setTab(id); setBusqueda(''); setBusquedaComp('') }}
        opciones={[
          { valor: 'pendientes',  texto: `Por recoger · ${ordenes.length}`, icono: PackageCheck },
          { valor: 'completadas', texto: `Completadas · ${completadas.length}`, icono: CheckCircle2 },
        ]} />

      {/* Buscador */}
      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-feisen-texto-2 pointer-events-none" />
        <input ref={buscarRef} type="text"
          value={tab === 'pendientes' ? busqueda : busquedaComp}
          onChange={e => tab === 'pendientes' ? setBusqueda(e.target.value) : setBusquedaComp(e.target.value)}
          placeholder="Buscar orden, fecha o pieza"
          className={claseInput + ' pl-10 pr-10 min-h-[44px]'}
        />
        {q && (
          <button type="button" aria-label="Borrar búsqueda"
            onClick={() => tab === 'pendientes' ? setBusqueda('') : setBusquedaComp('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center text-feisen-texto-2 hover:text-feisen-texto">
            <X size={16} />
          </button>
        )}
      </div>

      {cargando && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-feisen-texto-2">
          <Loader2 size={18} className="animate-spin" /> Cargando órdenes…
        </div>
      )}

      {/* ── Vista Completadas ── */}
      {tab === 'completadas' && !cargando && (() => {
        const q = busquedaComp.toLowerCase().trim()
        const filtComp = completadas.filter(o =>
          !q ||
          numOrden(o.numero).toLowerCase().includes(q) ||
          fmtFecha(o.fecha).includes(q) ||
          (o.ordenes_moldeo_piezas || []).some(p => p.items?.nombre?.toLowerCase().includes(q))
        )
        return filtComp.length === 0 ? (
          <Vacio icono={CheckCircle2}
            titulo={q ? `Ninguna recogida coincide con "${busquedaComp.trim()}"` : 'Todavía no hay recogidas completadas'}
            texto={q ? 'Prueba con el número de la orden (ORD-MOL-…), la fecha dd/mm/aaaa o parte del nombre de la pieza.'
              : 'Cuando registres la recogida de una orden en "Por recoger", aparecerá aquí con sus kilos y la merma.'} />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-feisen-texto-2 tabular-nums">
              {filtComp.length === completadas.length ? `Últimas ${completadas.length} órdenes completadas` : `Mostrando ${filtComp.length} de ${completadas.length}`}
            </p>
            {filtComp.map(orden => {
              const piezas = orden.ordenes_moldeo_piezas || []
              const totalConf = piezas.reduce((s, p) => s + Number(p.cantidad_conforme || 0), 0)
              const totalNC   = piezas.reduce((s, p) => s + Number(p.cantidad_nc || 0), 0)
              const hayAsignados = piezas.some(p => p.asignado_a)
              // Agrupar por moldeador (si no hay asignados, un solo grupo sin título)
              const grupos = {}
              for (const p of piezas) {
                const key = hayAsignados ? (p.asignado_a || 'Sin asignar') : ''
                if (!grupos[key]) grupos[key] = []
                grupos[key].push(p)
              }
              return (
                <article key={orden.id} className="bg-white rounded-xl border border-feisen-borde">
                  <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-feisen-texto font-mono text-sm">{numOrden(orden.numero)}</p>
                      <p className="text-xs text-feisen-texto-2 tabular-nums">{fmtFecha(orden.fecha)}</p>
                    </div>
                    <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium bg-feisen-fondo text-feisen-texto-2 border border-feisen-borde-suave">
                      Completada
                    </span>
                  </header>

                  <div className="divide-y divide-feisen-borde-suave">
                    {Object.entries(grupos).map(([persona, ps]) => {
                      const subConf = ps.reduce((s, p) => s + Number(p.cantidad_conforme || 0), 0)
                      const subNC   = ps.reduce((s, p) => s + Number(p.cantidad_nc || 0), 0)
                      const conPeso = ps.some(p => Number(p.items?.peso_unitario || 0) > 0)
                      const subKg   = ps.reduce((s, p) => s + Number(p.cantidad_conforme || 0) * Number(p.items?.peso_unitario || 0), 0)
                      return (
                        <div key={persona || 'todos'} className="px-4 py-2">
                          {hayAsignados && (
                            <div className="flex items-center justify-between gap-2 py-1">
                              <p className="text-sm font-semibold text-feisen-texto flex items-center gap-1.5 min-w-0">
                                <User size={15} className="text-feisen-texto-2 shrink-0" /><span className="truncate">{persona}</span>
                              </p>
                              <p className="text-xs text-feisen-texto-2 tabular-nums text-right shrink-0">
                                {subConf} conf{conPeso && <> · <span className="font-semibold text-feisen-texto">{kg(subKg, 1)} kg</span></>}{subNC > 0 && ` · ${subNC} NC`}
                              </p>
                            </div>
                          )}
                          <ul className="divide-y divide-feisen-borde-suave">
                            {ps.map(p => {
                              const conf = Number(p.cantidad_conforme || 0)
                              const nc   = Number(p.cantidad_nc || 0)
                              const peso = Number(p.items?.peso_unitario || 0)
                              return (
                                <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm text-feisen-texto truncate">{p.items?.nombre}</p>
                                    {hayAsignados && peso > 0 && <p className="text-xs text-feisen-texto-2 tabular-nums">{kg(peso, 2)} kg/ud</p>}
                                  </div>
                                  <div className="text-right shrink-0 tabular-nums">
                                    <p className="text-sm font-semibold text-feisen-texto">{conf} <span className="font-normal text-feisen-texto-2 text-xs">conf</span></p>
                                    {hayAsignados && peso > 0 && <p className="text-xs text-feisen-texto-2">{kg(conf * peso, 1)} kg</p>}
                                    {nc > 0 && <p className="text-xs text-feisen-texto-2">{nc} NC</p>}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )
                    })}
                  </div>

                  {(totalConf > 0 || totalNC > 0) && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-feisen-borde-suave text-sm tabular-nums">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">Total</span>
                      <span className="text-right">
                        <span className="font-semibold text-feisen-texto">{totalConf} conformes</span>
                        {totalNC > 0 && <span className="text-feisen-texto-2"> · {totalNC} NC</span>}
                      </span>
                    </div>
                  )}

                  {/* Panel merma completada */}
                  {(() => {
                    const ref = numOrden(orden.numero)
                    const mov = movsComp[ref]
                    const kgHierro    = mov?.hierro    || 0
                    const kgVaceadero = mov?.vaceadero || 0
                    const kgPiezas    = piezas.reduce((s, p) => s + Number(p.cantidad_conforme || 0) * Number(p.items?.peso_unitario || 0), 0)
                    const hayPesos    = piezas.some(p => Number(p.items?.peso_unitario || 0) > 0)
                    if (!kgHierro && !kgVaceadero) return null
                    const kgMerma  = kgHierro - kgPiezas - kgVaceadero
                    const pctMerma = kgHierro > 0 ? (kgMerma / kgHierro * 100) : 0
                    return (
                      <div className="border-t border-feisen-borde-suave px-4 py-3">
                        <BalanceKg
                          hierro={`${kg(kgHierro, 1)} kg`}
                          piezas={hayPesos ? `${kg(kgPiezas, 1)} kg` : '—'}
                          vaceadero={`${kg(kgVaceadero, 2)} kg`}
                          merma={hayPesos && kgMerma > 0 ? `${kg(kgMerma, 1)} kg` : '—'}
                          mermaPct={hayPesos && kgMerma > 0 ? `${kg(pctMerma, 1)} % del hierro` : null} />
                      </div>
                    )
                  })()}
                </article>
              )
            })}
          </div>
        )
      })()}

      {/* ── Vista Por recoger ── */}
      {tab === 'pendientes' && !cargando && filtradas.length === 0 && (
        <Vacio icono={PackageCheck}
          titulo={busqueda ? `Ninguna orden coincide con "${busqueda.trim()}"` : 'No hay órdenes por recoger'}
          texto={busqueda ? 'Prueba con el número de la orden (ORD-MOL-…), la fecha dd/mm/aaaa o parte del nombre de la pieza.'
            : 'Las órdenes de moldeo pendientes aparecen aquí para registrar lo que salió del vaciado. Crea una orden de moldeo y vuelve después de la fundida.'} />
      )}

      {tab === 'pendientes' && !cargando && filtradas.length > 0 && (
        <div className="space-y-3">
          {filtradas.map(orden => {
            const piezas  = orden.ordenes_moldeo_piezas || []
            const avOrden = avancesRef[orden.id] || {}
            const totalMoldeado = piezas.reduce((s, p) => s + (avOrden[p.id] || 0), 0)
            const totalPlaneado = piezas.reduce((s, p) => s + Number(p.cantidad_planeada || 0), 0)
            const abierta = expandido === orden.id

            return (
              <article key={orden.id}
                className={`bg-white rounded-xl border ${abierta ? 'border-feisen-azul/40' : 'border-feisen-borde'}`}>

                {/* Fila resumen */}
                <button type="button" onClick={() => toggle(orden)} aria-expanded={abierta}
                  className="w-full flex items-center gap-3 px-4 py-3 min-h-[64px] text-left rounded-xl hover:bg-feisen-fondo active:bg-feisen-fondo transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-feisen-texto font-mono text-sm">{numOrden(orden.numero)}</span>
                      <span className="rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">Por recoger</span>
                    </div>
                    <p className="text-xs text-feisen-texto-2 mt-0.5 tabular-nums">
                      {fmtFecha(orden.fecha)} · {piezas.length} {piezas.length === 1 ? 'pieza' : 'piezas'} · {totalPlaneado} planeadas
                      {avancesRef[orden.id] && totalMoldeado > 0 && ` · ${totalMoldeado} moldeadas`}
                    </p>
                  </div>
                  {abierta
                    ? <ChevronUp size={18} className="text-feisen-texto-2 shrink-0" />
                    : <ChevronDown size={18} className="text-feisen-texto-2 shrink-0" />}
                </button>

                {/* Éxito */}
                {exitoOrden === orden.id && (
                  <div className="border-t border-feisen-borde-suave px-4 py-6 flex flex-col items-center gap-2 text-center">
                    <span className="w-11 h-11 rounded-full bg-emerald-50 grid place-items-center">
                      <CheckCircle2 size={26} className="text-emerald-700" />
                    </span>
                    <p className="text-sm font-semibold text-feisen-texto">Recogida registrada</p>
                    <p className="text-xs text-feisen-texto-2 max-w-sm">
                      Las piezas conformes ingresaron al inventario de Fundición
                      {fundidaSel[orden.id] ? ' · se descontó el hierro colado' : ''}
                      {Number(vaceaderoKg[orden.id] || 0) > 0 ? ` · ${vaceaderoKg[orden.id]} kg de vaceadero registrados` : ''}.
                    </p>
                  </div>
                )}

                {/* Detalle expandido */}
                {abierta && exitoOrden !== orden.id && (() => {
                  const kgVacManual = Number(vaceaderoKg[orden.id] || 0)
                  const kgVacNC = piezas.reduce((s, p) => {
                    const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
                    const peso = Number(p.items?.peso_unitario || 0)
                    return s + nc * peso
                  }, 0)
                  const kgVacTotal = kgVacManual + kgVacNC
                  const totConf = piezas.reduce((s, p) => s + Number(getField(orden.id, p.id, 'conforme') || 0), 0)
                  const totNC   = piezas.reduce((s, p) => s + Number(getField(orden.id, p.id, 'nc') || 0), 0)
                  const conCantidad = piezas.some(p => Number(getField(orden.id, p.id, 'conforme') || 0) + Number(getField(orden.id, p.id, 'nc') || 0) > 0)
                  const faltanAclarar = piezas.filter(p => {
                    const plan = Number(p.cantidad_planeada || 0)
                    const suma = Number(getField(orden.id, p.id, 'conforme') || 0) + Number(getField(orden.id, p.id, 'nc') || 0)
                    return plan > 0 && suma < plan && String(getField(orden.id, p.id, 'faltante') || '').trim().length < 3
                  }).length

                  return (
                    <div className="border-t border-feisen-borde-suave px-3 sm:px-4 pt-4 pb-3 space-y-4">

                      {/* ── Piezas ── */}
                      <section className="space-y-2">
                        <TituloSeccion titulo="Piezas" detalle={`${piezas.length} ${piezas.length === 1 ? 'pieza' : 'piezas'} · ${totalPlaneado} planeadas`} />
                        {piezas.map(p => {
                          const conf = Number(getField(orden.id, p.id, 'conforme') || 0)
                          const nc   = Number(getField(orden.id, p.id, 'nc') || 0)
                          const plan = Number(p.cantidad_planeada || 0)
                          return (
                            <div key={p.id} className="border border-feisen-borde rounded-xl p-3 space-y-3">
                              {/* Encabezado pieza */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-feisen-texto text-sm leading-snug">{p.items?.nombre}</p>
                                  <p className="text-xs text-feisen-texto-2 mt-0.5">
                                    {[p.asignado_a && `Moldeador: ${p.asignado_a}`, p.items?.peso_unitario && `${kg(Number(p.items.peso_unitario), 2)} kg/ud`].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                                <div className="text-right shrink-0 tabular-nums">
                                  <p className="text-lg font-semibold text-feisen-texto leading-tight">{p.cantidad_planeada}</p>
                                  <p className="text-[11px] uppercase tracking-wide text-feisen-texto-2">planeadas</p>
                                  {avOrden[p.id] > 0 && (
                                    <p className="text-xs text-feisen-azul font-medium mt-0.5">{avOrden[p.id]} moldeadas</p>
                                  )}
                                </div>
                              </div>

                              {/* Conformes / NC */}
                              <div className="divide-y divide-feisen-borde-suave border-t border-feisen-borde-suave">
                                <div className="flex items-center justify-between gap-3 pt-2 pb-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-feisen-texto">Conformes</p>
                                    <p className="text-xs text-feisen-texto-2">Entran a Fundición</p>
                                  </div>
                                  <Contador etiqueta="Conformes" valor={getField(orden.id, p.id, 'conforme')}
                                    onCambiar={v => {
                                      const conf = soloNumero(v)
                                      setField(orden.id, p.id, 'conforme', conf)
                                      const plan = Number(p.cantidad_planeada || 0)
                                      const ncAuto = Math.max(0, plan - Number(conf || 0))
                                      if (plan > 0) setField(orden.id, p.id, 'nc', String(ncAuto))
                                    }} />
                                </div>
                                <div className="flex items-center justify-between gap-3 pt-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-feisen-texto">No conformes</p>
                                    <p className="text-xs text-feisen-texto-2">Su peso va al vaceadero</p>
                                  </div>
                                  <Contador etiqueta="No conformes" valor={getField(orden.id, p.id, 'nc')}
                                    onCambiar={v => setField(orden.id, p.id, 'nc', soloNumero(v))} />
                                </div>
                              </div>

                              {nc > 0 && (
                                <label className="block space-y-1.5">
                                  <span className="block text-sm font-medium text-feisen-texto">Razón de calidad <span className="font-normal text-feisen-texto-2">(opcional)</span></span>
                                  <input type="text"
                                    value={getField(orden.id, p.id, 'motivo')}
                                    onChange={e => setField(orden.id, p.id, 'motivo', e.target.value)}
                                    placeholder="Ej: porosidad, grieta…"
                                    className={claseInput + ' min-h-[44px]'}
                                  />
                                </label>
                              )}

                              {/* Avisos: suma por encima o por debajo de lo planeado */}
                              {plan > 0 && conf + nc > plan && (
                                <p className="text-xs text-amber-700 flex items-start gap-1.5">
                                  <AlertTriangle size={14} className="shrink-0 mt-px" />
                                  <span>La suma ({conf + nc}) supera lo planeado ({plan}) en {conf + nc - plan}. Se puede guardar (piezas de otras fundidas).</span>
                                </p>
                              )}
                              {plan > 0 && conf + nc < plan && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                  <p className="text-xs text-amber-800 font-semibold flex items-start gap-1.5">
                                    <AlertTriangle size={14} className="shrink-0 mt-px" />
                                    <span>No salió todo lo planeado: faltan <span className="tabular-nums">{plan - conf - nc} de {plan}</span>. Explica por qué.</span>
                                  </p>
                                  <input type="text"
                                    aria-label={`Aclaración del faltante de ${p.items?.nombre || 'la pieza'}`}
                                    value={getField(orden.id, p.id, 'faltante')}
                                    onChange={e => setField(orden.id, p.id, 'faltante', e.target.value)}
                                    placeholder="Ej: no se moldeó, se rompió el molde, falta arena…"
                                    className="w-full min-h-[44px] border border-amber-300 bg-white rounded-lg px-3 py-2 text-sm text-feisen-texto focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                                  />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </section>

                      {/* ── Vincular fundida ── */}
                      <section className="space-y-2">
                        <TituloSeccion titulo="Fundida" detalle="Opcional" />
                        <label className="block space-y-1.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-feisen-texto">
                            <Flame size={16} className="text-feisen-texto-2" /> ¿De qué fundida salieron estas piezas?
                          </span>
                          <select
                            value={fundidaSel[orden.id] || ''}
                            onChange={e => setFundidaSel(prev => ({ ...prev, [orden.id]: e.target.value }))}
                            className={claseInput + ' min-h-[44px] text-sm'}
                          >
                            <option value="">Sin vincular (no descuenta hierro)</option>
                            {fundidas.map(f => {
                              const usada = fundidaUsada[f.id] && fundidaUsada[f.id] !== numOrden(orden.numero)
                              return (
                                <option key={f.id} value={f.id} disabled={usada}>
                                  {numFun(f.numero)} · {fmtFecha(f.fecha)} · {usada ? `hierro ya descontado en ${fundidaUsada[f.id]}` : `${f.hierro_colado} kg hierro colado`}
                                </option>
                              )
                            })}
                          </select>
                        </label>

                        {/* Panel de merma */}
                        {fundidaSel[orden.id] && (() => {
                          const fundida   = fundidas.find(f => f.id === fundidaSel[orden.id])
                          const kgEntrada = Number(fundida?.hierro_colado || 0)
                          const kgPiezas  = calcKgPiezas(orden)
                          const hayPesos  = piezas.some(p => Number(p.items?.peso_unitario || 0) > 0)
                          // Vaceadero = manual + piezas NC con peso
                          const kgVaceadero = kgVacManual + kgVacNC
                          // Merma real = hierro - piezas buenas - vaceadero
                          const kgMerma  = kgEntrada - kgPiezas - kgVaceadero
                          const pctMerma = kgEntrada > 0 ? (kgMerma / kgEntrada * 100) : 0

                          return (
                            <div className="space-y-2">
                              <BalanceKg
                                hierro={`${kg(kgEntrada, 1)} kg`}
                                piezas={hayPesos ? `${kg(kgPiezas, 1)} kg` : 'Sin peso unitario'}
                                vaceadero={`${kg(kgVaceadero, 2)} kg`}
                                vaceaderoDetalle={kgVacNC > 0 && kgVacManual > 0 ? `${kg(kgVacNC, 2)} NC + ${kg(kgVacManual, 2)} manual` : null}
                                merma={hayPesos ? (kgMerma > 0 ? `${kg(kgMerma, 1)} kg` : '0 kg') : '—'}
                                mermaPct={hayPesos && kgMerma > 0 ? `${kg(pctMerma, 1)} % del hierro` : null} />
                              {hayPesos && kgEntrada > 0 && (
                                <p className="text-xs text-feisen-texto-2 tabular-nums">
                                  Merma = hierro colado − piezas buenas − vaceadero
                                </p>
                              )}
                              <p className="text-xs text-feisen-texto-2 flex items-start gap-1.5">
                                <Info size={14} className="shrink-0 mt-px" />
                                <span>Al guardar se descuentan <strong className="font-semibold text-feisen-texto tabular-nums">{kg(kgEntrada, 1)} kg</strong> de hierro colado del inventario de Fundición.</span>
                              </p>
                            </div>
                          )
                        })()}
                      </section>

                      {/* ── Vaceadero ── */}
                      <section className="space-y-2">
                        <TituloSeccion titulo="Vaceadero" detalle="Entra al inventario" />
                        <label className="block space-y-1.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-feisen-texto">
                            <Recycle size={16} className="text-feisen-texto-2" /> Kg recogidos aparte <span className="font-normal text-feisen-texto-2">(opcional)</span>
                          </span>
                          <div className="relative">
                            <input
                              type="number" min="0" step="0.1" inputMode="decimal"
                              value={vaceaderoKg[orden.id] || ''}
                              onChange={e => setVaceaderoKg(prev => ({ ...prev, [orden.id]: e.target.value }))}
                              placeholder="0"
                              className={claseInput + ' min-h-[44px] pr-12 text-right font-semibold tabular-nums'}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-feisen-texto-2 pointer-events-none">kg</span>
                          </div>
                        </label>
                        {(kgVacNC > 0 || kgVacManual > 0) && (
                          <dl className="text-sm tabular-nums divide-y divide-feisen-borde-suave border border-feisen-borde-suave rounded-lg">
                            {kgVacNC > 0 && (
                              <div className="flex justify-between gap-3 px-3 py-2">
                                <dt className="text-feisen-texto-2">Piezas NC <span className="text-xs">(por peso unitario)</span></dt>
                                <dd className="text-feisen-texto">{kg(kgVacNC, 2)} kg</dd>
                              </div>
                            )}
                            {kgVacManual > 0 && (
                              <div className="flex justify-between gap-3 px-3 py-2">
                                <dt className="text-feisen-texto-2">Recogido aparte</dt>
                                <dd className="text-feisen-texto">{kg(kgVacManual, 2)} kg</dd>
                              </div>
                            )}
                            <div className="flex justify-between gap-3 px-3 py-2 font-semibold">
                              <dt className="text-feisen-texto">Total vaceadero</dt>
                              <dd className="text-feisen-texto">{kg(kgVacTotal, 2)} kg</dd>
                            </div>
                          </dl>
                        )}
                      </section>

                      {/* Error */}
                      {errores[orden.id] && (
                        <div role="alert" className="flex items-start gap-2 bg-feisen-rojo-suave text-feisen-rojo rounded-lg px-3 py-2.5 text-sm">
                          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{errores[orden.id]}</span>
                        </div>
                      )}

                      {/* Guardar: fijo abajo en celular, con el resumen */}
                      <div className="sticky bottom-[calc(4.5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
                        <div className="flex items-center gap-3 bg-white border border-feisen-borde rounded-xl shadow-sm pl-3 pr-2 py-2">
                          <div className="flex-1 min-w-0 text-sm leading-tight">
                            {conCantidad
                              ? <p className="font-semibold text-feisen-texto tabular-nums">{totConf} conf · {totNC} NC</p>
                              : <p className="font-semibold text-feisen-texto">Sin cantidades</p>}
                            <p className={`text-xs truncate ${faltanAclarar ? 'text-amber-700' : 'text-feisen-texto-2'}`}>
                              {faltanAclarar
                                ? `${faltanAclarar} ${faltanAclarar === 1 ? 'pieza' : 'piezas'} sin aclarar faltante`
                                : [fundidaSel[orden.id] && 'descuenta hierro', kgVacTotal > 0 && `${kg(kgVacTotal, 1)} kg vaceadero`].filter(Boolean).join(' · ') || 'Cierra la orden'}
                            </p>
                          </div>
                          <button type="button" onClick={() => guardarRecogida(orden)} disabled={guardando === orden.id}
                            className="inline-flex items-center gap-2 bg-feisen-azul text-white rounded-lg px-4 min-h-[48px] text-[15px] font-semibold disabled:opacity-60 hover:opacity-90 active:scale-[.98] transition">
                            {guardando === orden.id
                              ? <><Loader2 size={18} className="animate-spin" /> Registrando…</>
                              : 'Registrar recogida'}
                          </button>
                        </div>
                      </div>

                    </div>
                  )
                })()}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Piezas visuales de esta pantalla ────────────────────────────────────────
function TituloSeccion({ titulo, detalle }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">{titulo}</h3>
      {detalle && <span className="text-xs text-feisen-texto-2 tabular-nums">{detalle}</span>}
    </div>
  )
}

// Balance de kilos de la fundida: hierro colado → piezas buenas + vaceadero + merma
function BalanceKg({ hierro, piezas, vaceadero, vaceaderoDetalle, merma, mermaPct }) {
  const filas = [
    ['Hierro colado', hierro, null],
    ['Piezas buenas', piezas, null],
    ['Vaceadero', vaceadero, vaceaderoDetalle],
    ['Merma real', merma, mermaPct],
  ]
  return (
    <dl className="grid grid-cols-2 gap-px bg-feisen-borde-suave border border-feisen-borde-suave rounded-lg overflow-hidden">
      {filas.map(([etq, valor, extra]) => (
        <div key={etq} className="bg-white px-3 py-2 min-w-0">
          <dt className="text-[11px] uppercase tracking-wide text-feisen-texto-2">{etq}</dt>
          <dd className="text-right tabular-nums">
            <span className="block text-base font-semibold text-feisen-texto">{valor}</span>
            {extra && <span className="block text-xs text-feisen-texto-2">{extra}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Vacio({ icono: Icono, titulo, texto }) {
  return (
    <div className="bg-white border border-feisen-borde rounded-xl px-6 py-12 text-center">
      <Icono size={36} className="text-feisen-texto-2 mx-auto mb-3" />
      <p className="font-semibold text-feisen-texto">{titulo}</p>
      <p className="text-sm text-feisen-texto-2 mt-1 max-w-sm mx-auto">{texto}</p>
    </div>
  )
}
