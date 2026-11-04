import { sumarHabiles, habilesEntre, hoyColombia, motivoNoHabil } from '../../utils/diasHabiles'

// Fecha estimada de llegada de un pedido: se puede escoger en el calendario o tocar
// "en N días hábiles" y la app salta sábados, domingos y festivos (pedido de Angie, 4/11/2026).
// Debajo dice a cuántos días hábiles queda y avisa si la fecha cae en un día que no se trabaja.
const PLAZOS = [1, 2, 3, 5, 10]
const diaSemana = f => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '')

export default function FechaLlegada({ valor, onCambiar, etiqueta = 'Fecha estimada de llegada' }) {
  const hoy = hoyColombia()
  const habiles = valor ? habilesEntre(hoy, valor) : null
  const noHabil = valor ? motivoNoHabil(valor) : null
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700 block mb-1">{etiqueta}</label>
      <div className="flex flex-wrap items-center gap-1.5 mb-2" role="group" aria-label="Llega en días hábiles">
        <span className="text-xs text-feisen-texto-2 mr-0.5">Llega en</span>
        {PLAZOS.map(n => {
          const f = sumarHabiles(n, hoy)
          const activo = valor === f
          return (
            <button key={n} type="button" onClick={() => onCambiar(f)} aria-pressed={activo}
              title={diaSemana(f)}
              className={`h-9 min-w-[40px] px-2.5 rounded-lg border tabular-nums text-sm font-medium transition-colors
                ${activo ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul' : 'border-feisen-borde text-feisen-texto-2 hover:bg-feisen-fondo'}`}>
              {n}
            </button>
          )
        })}
        <span className="text-xs text-feisen-texto-2 ml-0.5">días hábiles</span>
      </div>
      <input type="date" value={valor || ''} onChange={e => onCambiar(e.target.value)}
        className="w-full border border-feisen-borde rounded-xl px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul" />
      <p className="text-xs mt-1.5 text-feisen-texto-2">
        {!valor
          ? 'Los botones cuentan días hábiles: sin sábados, domingos ni festivos.'
          : valor < hoy
            ? <span className="text-amber-700">Esa fecha ya pasó ({diaSemana(valor)}).</span>
          : noHabil
            ? <span className="text-amber-700">Ojo: el {diaSemana(valor)} es {noHabil === 'sábado' || noHabil === 'domingo' ? noHabil : `festivo (${noHabil})`} y no se trabaja.</span>
            : <>Llega el <b className="text-feisen-texto">{diaSemana(valor)}</b>{valor > hoy ? ` · en ${habiles} ${habiles === 1 ? 'día hábil' : 'días hábiles'}` : ' · hoy'}</>}
      </p>
    </div>
  )
}
