import { useEffect, useState } from 'react'
import { formatNumber } from './utils/format'
import { ETAPAS } from './utils/etapas'
import { hoy, horaActual, horasEntre, textoHorario, transcurrido, unirNotas } from './utils/tiempos'

const input =
  'w-full border border-feisen-borde rounded-lg px-3 py-3 text-base bg-white outline-none focus:border-feisen-azul'
const label = 'block text-sm font-medium mb-1'

function nuevaMedicion() {
  return { etapa: '', parte: '', responsable: '', orden: '', num_operarios: 1 }
}

// Las mediciones en curso viven en este celular (localStorage) para que sobrevivan si se
// bloquea la pantalla o se recarga la página; solo se guardan en la base al terminarlas.
function claveEnCurso(fichaId) {
  return `costeo-tiempos-en-curso-${fichaId}`
}

function leerEnCurso(fichaId) {
  try {
    return JSON.parse(localStorage.getItem(claveEnCurso(fichaId)) || '[]')
  } catch {
    return []
  }
}

function Contador({ valor, onCambiar }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onCambiar(Math.max(1, valor - 1))}
        className="w-12 h-12 rounded-lg border border-feisen-borde bg-white text-xl font-bold"
        aria-label="Menos operarios"
      >
        −
      </button>
      <span className="w-10 text-center text-lg font-semibold">{valor}</span>
      <button
        type="button"
        onClick={() => onCambiar(valor + 1)}
        className="w-12 h-12 rounded-lg border border-feisen-borde bg-white text-xl font-bold"
        aria-label="Más operarios"
      >
        +
      </button>
    </div>
  )
}

function Cierre({ inicio, onGuardar, onCancelar, guardando, textoBoton, error }) {
  const [fin, setFin] = useState(horaActual())
  const [pausa, setPausa] = useState('')
  const [unidades, setUnidades] = useState('1')
  const [notas, setNotas] = useState('')
  const [ini, setIni] = useState(inicio || '')
  const horas = horasEntre(ini, fin, pausa)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Hora inicio</label>
          <input type="time" value={ini} onChange={(e) => setIni(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Hora fin</label>
          <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Pausas (min)</label>
          <input
            type="number"
            inputMode="numeric"
            value={pausa}
            onChange={(e) => setPausa(e.target.value)}
            placeholder="0"
            className={input}
          />
        </div>
        <div>
          <label className={label}>Unidades buenas</label>
          <input
            type="number"
            inputMode="decimal"
            value={unidades}
            onChange={(e) => setUnidades(e.target.value)}
            className={input}
          />
        </div>
      </div>
      <div>
        <label className={label}>
          Observaciones <span className="font-normal text-feisen-texto-2">(opcional)</span>
        </label>
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="ej. se esperó material 20 min"
          className={input}
        />
      </div>
      <p className="text-sm text-feisen-texto-2">
        {horas ? `= ${formatNumber(horas)} horas trabajadas` : 'Revisa las horas de inicio y fin.'}
      </p>
      {error && <p className="text-feisen-rojo text-sm">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={guardando || !horas || !(Number(unidades) > 0)}
          onClick={() => onGuardar({ inicio: ini, fin, pausa, unidades, notas, horas })}
          className="flex-1 bg-feisen-azul text-white font-semibold rounded-lg py-3 text-base disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : textoBoton}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="px-4 rounded-lg border border-feisen-borde bg-white text-feisen-texto-2"
        >
          Volver
        </button>
      </div>
    </div>
  )
}

export default function RegistroRapidoTiempos({ fichaId, partes, operarios, registros, onGuardar }) {
  const [enCurso, setEnCurso] = useState(() => leerEnCurso(fichaId))
  const [cerrando, setCerrando] = useState(null) // id de la medición que se está terminando
  const [nueva, setNueva] = useState(nuevaMedicion)
  const [anotarYa, setAnotarYa] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  function actualizarEnCurso(lista) {
    setEnCurso(lista)
    try {
      localStorage.setItem(claveEnCurso(fichaId), JSON.stringify(lista))
    } catch {
      // Sin almacenamiento local: la medición sigue en pantalla mientras no se recargue.
    }
  }

  function avisar(texto) {
    setMensaje(texto)
    setTimeout(() => setMensaje(''), 3000)
  }

  function empezar() {
    setError('')
    if (!nueva.etapa) {
      setError('Elige la etapa.')
      return
    }
    actualizarEnCurso([
      { ...nueva, id: String(Date.now()), fecha: hoy(), inicio: horaActual(), inicioMs: Date.now() },
      ...enCurso,
    ])
    setNueva(nuevaMedicion())
    avisar('Medición iniciada. Toca "Terminar" cuando acabe.')
  }

  async function guardar(base, cierre) {
    setError('')
    setGuardando(true)
    const err = await onGuardar({
      fecha: base.fecha || hoy(),
      orden: base.orden.trim() || null,
      parte: base.parte.trim() || null,
      etapa: base.etapa,
      responsable: base.responsable.trim() || null,
      num_operarios: Number(base.num_operarios),
      horas: cierre.horas,
      unidades: Number(cierre.unidades),
      notas: unirNotas(textoHorario(cierre.inicio, cierre.fin, cierre.pausa), cierre.notas),
    })
    setGuardando(false)
    if (err) {
      setError(err)
      return false
    }
    avisar('Tiempo guardado.')
    return true
  }

  async function terminar(m, cierre) {
    if (await guardar(m, cierre)) {
      actualizarEnCurso(enCurso.filter((x) => x.id !== m.id))
      setCerrando(null)
    }
  }

  async function guardarDirecto(cierre) {
    if (!nueva.etapa) {
      setError('Elige la etapa.')
      return
    }
    if (await guardar(nueva, cierre)) {
      setNueva(nuevaMedicion())
      setAnotarYa(false)
    }
  }

  function descartar(m) {
    if (!window.confirm(`¿Descartar la medición de ${m.etapa}? No se guarda nada.`)) return
    actualizarEnCurso(enCurso.filter((x) => x.id !== m.id))
    setCerrando(null)
  }

  const deHoy = registros.filter((r) => r.fecha === hoy())

  return (
    <div className="space-y-5 max-w-md mx-auto">
      {mensaje && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 bg-feisen-gris-oscuro text-white text-sm px-4 py-2 rounded-lg shadow">
          {mensaje}
        </div>
      )}

      {enCurso.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">En curso ({enCurso.length})</h2>
          <div className="space-y-3">
            {enCurso.map((m) => (
              <div key={m.id} className="bg-white border-2 border-feisen-azul rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-base">
                      {m.etapa}
                      {m.parte && <span className="font-normal text-feisen-texto-2"> · {m.parte}</span>}
                    </div>
                    <div className="text-sm text-feisen-texto-2">
                      {[m.responsable, `${m.num_operarios} oper.`, m.orden].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-feisen-azul">{transcurrido(m.inicioMs)}</div>
                    <div className="text-xs text-feisen-texto-2">desde {m.inicio}</div>
                  </div>
                </div>
                {cerrando === m.id ? (
                  <div className="mt-3 pt-3 border-t border-feisen-borde">
                    <Cierre
                      inicio={m.inicio}
                      guardando={guardando}
                      error={error}
                      textoBoton="Guardar tiempo"
                      onGuardar={(c) => terminar(m, c)}
                      onCancelar={() => setCerrando(null)}
                    />
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setError('')
                        setCerrando(m.id)
                      }}
                      className="flex-1 bg-feisen-rojo text-white font-semibold rounded-lg py-3 text-base"
                    >
                      ■ Terminar
                    </button>
                    <button
                      type="button"
                      onClick={() => descartar(m)}
                      className="px-4 rounded-lg border border-feisen-borde bg-white text-sm text-feisen-texto-2"
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border border-feisen-borde rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Nueva medición</h2>
        <div>
          <label className={label}>Etapa</label>
          <select
            value={nueva.etapa}
            onChange={(e) => setNueva({ ...nueva, etapa: e.target.value })}
            className={input}
          >
            <option value="">-- Selecciona --</option>
            {ETAPAS.map((et) => (
              <option key={et} value={et}>
                {et}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>
            Parte <span className="font-normal text-feisen-texto-2">(opcional)</span>
          </label>
          <input
            list="partes-rapido"
            value={nueva.parte}
            onChange={(e) => setNueva({ ...nueva, parte: e.target.value })}
            placeholder="ej. Cintura, Cono"
            className={input}
          />
          <datalist id="partes-rapido">
            {partes.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={label}>
            Responsable <span className="font-normal text-feisen-texto-2">(opcional)</span>
          </label>
          <input
            list="operarios-rapido"
            value={nueva.responsable}
            onChange={(e) => setNueva({ ...nueva, responsable: e.target.value })}
            className={input}
          />
          <datalist id="operarios-rapido">
            {operarios.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={label}>
              Orden / lote <span className="font-normal text-feisen-texto-2">(opc.)</span>
            </label>
            <input
              value={nueva.orden}
              onChange={(e) => setNueva({ ...nueva, orden: e.target.value })}
              placeholder="OP-125"
              className={input}
            />
          </div>
          <div>
            <label className={label}>Operarios</label>
            <Contador valor={nueva.num_operarios} onCambiar={(v) => setNueva({ ...nueva, num_operarios: v })} />
          </div>
        </div>

        {anotarYa ? (
          <div className="pt-3 border-t border-feisen-borde">
            <Cierre
              inicio=""
              guardando={guardando}
              error={error}
              textoBoton="Guardar tiempo"
              onGuardar={guardarDirecto}
              onCancelar={() => setAnotarYa(false)}
            />
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={empezar}
              className="w-full bg-feisen-azul text-white font-semibold rounded-lg py-3.5 text-base"
            >
              ▶ Empezar ahora
            </button>
            <button
              type="button"
              onClick={() => {
                setError('')
                setAnotarYa(true)
              }}
              className="w-full border border-feisen-azul text-feisen-azul font-medium rounded-lg py-3 text-base bg-white"
            >
              Ya terminó: anotar horas
            </button>
          </div>
        )}
        {error && !anotarYa && !cerrando && <p className="text-feisen-rojo text-sm">{error}</p>}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Registrado hoy ({deHoy.length})</h2>
        {deHoy.length === 0 ? (
          <p className="text-sm text-feisen-texto-2">Nada todavía.</p>
        ) : (
          <div className="bg-white border border-feisen-borde rounded-xl divide-y divide-feisen-borde">
            {deHoy.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {r.etapa}
                    {r.parte && <span className="font-normal text-feisen-texto-2"> · {r.parte}</span>}
                  </span>
                  <span className="whitespace-nowrap">
                    {formatNumber(r.horas)} h · {formatNumber(r.unidades, 0)} u
                  </span>
                </div>
                {(r.responsable || r.notas) && (
                  <div className="text-xs text-feisen-texto-2">
                    {[r.responsable, r.notas].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
