import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Flame, Plus, X, CheckCircle2 } from 'lucide-react'

const FUND_BODEGA_ID = 'a0604489-2768-445b-8e68-e450ef8520ed'

// Materiales del formulario que tienen item en inventario → se descontarán al guardar
const MATERIAL_ITEMS = {
  carbon:      '7314b94c-385c-4c22-b0f8-04861fbc644e', // CARBÓN
  caliza:      '8dac18cd-3909-4ea5-ace5-316a2cf6a894', // CALIZA
  ferromolido: '8a13934b-6d19-4ef1-975f-8b36f3429abd', // FERROMOLIDO
  exlac:       '55974f24-8892-475f-8658-eb57f5f496cc', // EXLAC (slax)
}

const MATERIAL_LABELS = {
  carbon:      'Carbón',
  caliza:      'Caliza',
  ferromolido: 'Ferromolido',
  exlac:       'Exlac (slax)',
}

async function generarNumSalida(perfil) {
  const iniciales = (perfil?.nombre || 'USR').trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
  const pre = `SAL-${iniciales}-`
  const { data: last } = await supabase
    .from('movimientos').select('numero').like('numero', `${pre}%`)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  const n = last?.numero ? parseInt(last.numero.replace(pre, ''), 10) || 0 : 0
  return `${pre}${String(n + 1).padStart(4, '0')}`
}

function hoyCol() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

// Input con sugerencias desde localStorage
function InputSugerencias({ value, onChange, placeholder, storageKey }) {
  const [mostrar, setMostrar] = useState(false)
  const [sugerencias, setSugerencias] = useState([])

  function abrirSugerencias() {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
    const filtradas = saved.filter(s => s.toLowerCase().includes((value || '').toLowerCase()) && s !== value)
    setSugerencias(filtradas)
    setMostrar(true)
  }

  function seleccionar(s) {
    onChange(s)
    setMostrar(false)
  }

  function guardarSugerencia(val) {
    if (!val?.trim()) return
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (!saved.includes(val.trim())) {
      localStorage.setItem(storageKey, JSON.stringify([val.trim(), ...saved].slice(0, 40)))
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={abrirSugerencias}
        onBlur={() => { setTimeout(() => setMostrar(false), 150); guardarSugerencia(value) }}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      {mostrar && sugerencias.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
          {sugerencias.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => seleccionar(s)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-orange-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Lista dinámica de personas
function ListaPersonas({ label, valores, onChange, storageKey, placeholder, requerido }) {
  function agregar() { onChange([...valores, '']) }
  function cambiar(i, v) { const a = [...valores]; a[i] = v; onChange(a) }
  function quitar(i) { onChange(valores.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label}{requerido && <span className="text-feisen-rojo ml-1">*</span>}
      </label>
      <div className="space-y-2">
        {valores.map((v, i) => (
          <div key={i} className="flex gap-2 items-center">
            <div className="flex-1">
              <InputSugerencias
                value={v}
                onChange={val => cambiar(i, val)}
                placeholder={placeholder}
                storageKey={storageKey}
              />
            </div>
            {valores.length > 1 && (
              <button
                type="button"
                onClick={() => quitar(i)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={agregar}
        className="mt-2 text-xs text-feisen-azul font-medium flex items-center gap-1 hover:opacity-70 transition-opacity"
      >
        <Plus size={13} /> Agregar persona
      </button>
    </div>
  )
}

const MATERIALES = [
  { key: 'pesoVaceadero',     dbKey: 'peso_vaceadero',            label: 'Peso vaceadero',             unit: 'kg' },
  { key: 'hierroColado',      dbKey: 'hierro_colado',             label: 'Hierro colado',              unit: 'kg' },
  { key: 'hierroContaminado', dbKey: 'hierro_colado_contaminado', label: 'Hierro colado contaminado',  unit: 'kg' },
  { key: 'carbon',            dbKey: 'carbon',                    label: 'Carbón',                     unit: 'kg' },
  { key: 'caliza',            dbKey: 'caliza',                    label: 'Caliza',                     unit: 'kg' },
  { key: 'ferromolido',       dbKey: 'ferromolido',               label: 'Ferromolido',                unit: 'kg' },
  { key: 'exlac',             dbKey: 'exlac',                     label: 'Exlac',                      unit: 'kg' },
  { key: 'temperatura',       dbKey: 'temperatura',               label: 'Temperatura aprox.',         unit: '°C' },
]

function numFun(n) {
  return `FUN-${String(n).padStart(4, '0')}`
}

export default function RegistrarFundida() {
  const { perfil } = useAuth()

  const [fecha,       setFecha]       = useState(hoyCol())
  const [horaInicio,  setHoraInicio]  = useState('')
  const [horaFin,     setHoraFin]     = useState('')
  const [horneros,    setHorneros]    = useState([''])
  const [vaceadores,  setVaceadores]  = useState([''])
  const [auxiliares,  setAuxiliares]  = useState([''])
  const [materiales,  setMateriales]  = useState(
    Object.fromEntries(MATERIALES.map(m => [m.key, '']))
  )
  const [observaciones, setObservaciones] = useState('')

  const [guardando,      setGuardando]      = useState(false)
  const [error,          setError]          = useState('')
  const [exito,          setExito]          = useState(null)
  const [proximoNumero,  setProximoNumero]  = useState(null)

  useEffect(() => {
    supabase.from('fundidas').select('numero').order('numero', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setProximoNumero((data?.numero || 0) + 1))
  }, [])

  function setMat(key, val) {
    setMateriales(prev => ({ ...prev, [key]: val }))
  }

  function limpiar() {
    setFecha(hoyCol()); setHoraInicio(''); setHoraFin('')
    setHorneros(['']); setVaceadores(['']); setAuxiliares([''])
    setMateriales(Object.fromEntries(MATERIALES.map(m => [m.key, ''])))
    setObservaciones(''); setExito(null); setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!fecha)       { setError('Ingresa la fecha.'); return }
    if (!horaInicio)  { setError('Ingresa la hora de inicio.'); return }
    const hornerosFiltrados   = horneros.filter(h => h.trim())
    const vaceadoresFiltrados = vaceadores.filter(v => v.trim())
    if (hornerosFiltrados.length === 0)   { setError('Ingresa al menos un hornero.'); return }
    if (vaceadoresFiltrados.length === 0) { setError('Ingresa al menos un vaceador.'); return }

    setGuardando(true)
    try {
      // Validar stock disponible de cada material antes de guardar
      const materialesConsumir = Object.entries(MATERIAL_ITEMS)
        .filter(([key]) => materiales[key] !== '' && parseFloat(materiales[key]) > 0)

      if (materialesConsumir.length > 0) {
        const faltantes = []
        for (const [key, itemId] of materialesConsumir) {
          const { data: stockRow } = await supabase
            .from('stock')
            .select('cantidad_actual')
            .eq('item_id', itemId)
            .eq('bodega_id', FUND_BODEGA_ID)
            .maybeSingle()
          const disponible = Number(stockRow?.cantidad_actual ?? 0)
          const solicitado = parseFloat(materiales[key])
          if (disponible < solicitado) {
            faltantes.push(
              `• ${MATERIAL_LABELS[key]}: necesitas ${solicitado} kg, hay ${disponible.toFixed(2)} kg`
            )
          }
        }
        if (faltantes.length > 0) {
          setError('Stock insuficiente en FUNDICIÓN:\n' + faltantes.join('\n'))
          setGuardando(false)
          return
        }
      }

      const payload = {
        fecha,
        hora_inicio: horaInicio,
        hora_fin:    horaFin || null,
        horneros:    hornerosFiltrados,
        vaceadores:  vaceadoresFiltrados,
        auxiliares:  auxiliares.filter(a => a.trim()),
        observaciones: observaciones.trim() || null,
        usuario_id:  perfil.id,
      }
      MATERIALES.forEach(({ key, dbKey }) => {
        payload[dbKey] = materiales[key] !== '' ? parseFloat(materiales[key]) : null
      })

      const { data, error: err } = await supabase
        .from('fundidas')
        .insert(payload)
        .select('numero')
        .single()

      if (err) { setError('Error al guardar: ' + err.message); return }

      // Crear salidas automáticas de materiales consumidos en el horno
      const matSalidas = Object.entries(MATERIAL_ITEMS)
        .filter(([key]) => materiales[key] !== '' && parseFloat(materiales[key]) > 0)
      if (matSalidas.length > 0) {
        const numSal = await generarNumSalida(perfil)
        const numFun = `FUN-${String(data.numero).padStart(4, '0')}`
        await supabase.from('movimientos').insert(
          matSalidas.map(([key, itemId]) => ({
            numero:                numSal,
            tipo:                  'salida',
            item_id:               itemId,
            bodega_origen_id:      FUND_BODEGA_ID,
            bodega_destino_id:     null,
            cantidad:              parseFloat(materiales[key]),
            precio_costo_snapshot: 0,
            centro_costo:          'FUNDICIÓN',
            usuario_id:            perfil.id,
            referencia:            numFun,
            fecha_movimiento:      fecha || null,
            motivo:                'Consumo horno fundición',
            foto_remision_url: null, destino: null,
            numero_of: null, serial_motor: null, cliente: null, proveedor: null,
          }))
        )
      }

      setExito({ numero: data.numero })
    } finally {
      setGuardando(false)
    }
  }

  // Pantalla de éxito
  if (exito) {
    return (
      <div className="max-w-xl mx-auto p-4 flex flex-col items-center justify-center gap-5 py-20">
        <CheckCircle2 size={60} className="text-green-500" />
        <div className="text-center">
          <p className="text-xl font-bold text-gray-800">¡Fundida registrada!</p>
          <p className="text-feisen-azul font-bold text-2xl mt-2">{numFun(exito.numero)}</p>
          <p className="text-xs text-gray-400 mt-1">Número de seguimiento asignado</p>
        </div>
        <button
          onClick={limpiar}
          className="bg-feisen-rojo text-white rounded-xl px-8 py-3 text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          🔥 Registrar otra fundida
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-orange-100 p-2.5 rounded-xl">
          <Flame size={22} className="text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Registrar Fundida</h1>
          {proximoNumero && (
            <p className="text-xs text-orange-600 font-bold mt-0.5">
              Próximo N°: <span className="font-mono bg-orange-50 px-2 py-0.5 rounded-lg">{numFun(proximoNumero)}</span>
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium whitespace-pre-line">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── INFORMACIÓN GENERAL ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Información general</h2>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fecha <span className="text-feisen-rojo">*</span></label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hora inicio <span className="text-feisen-rojo">*</span></label>
              <input
                type="time"
                value={horaInicio}
                onChange={e => setHoraInicio(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Hora fin <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="time"
                value={horaFin}
                onChange={e => setHoraFin(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>
        </div>

        {/* ── PERSONAL ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Personal</h2>

          <ListaPersonas
            label="Horneros" requerido
            valores={horneros} onChange={setHorneros}
            storageKey="feisen_horneros" placeholder="Nombre del hornero"
          />
          <ListaPersonas
            label="Vaceadores" requerido
            valores={vaceadores} onChange={setVaceadores}
            storageKey="feisen_vaceadores" placeholder="Nombre del vaceador"
          />
          <ListaPersonas
            label="Auxiliares"
            valores={auxiliares} onChange={setAuxiliares}
            storageKey="feisen_auxiliares" placeholder="Nombre del auxiliar"
          />
        </div>

        {/* ── MATERIALES ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Materiales</h2>

          <div className="grid grid-cols-2 gap-4">
            {MATERIALES.map(({ key, label, unit }) => (
              <div key={key}>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={materiales[key]}
                    onChange={e => setMat(key, e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── OBSERVACIONES ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Observaciones <span className="font-normal text-gray-400">(problemas, novedades…)</span>
          </label>
          <textarea
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            placeholder="Describe cualquier problema o novedad durante el proceso…"
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={guardando}
          className="w-full bg-feisen-rojo text-white rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {guardando ? 'Registrando…' : '🔥 Registrar fundida'}
        </button>
      </form>
    </div>
  )
}
