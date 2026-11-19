// ─────────────────────────────────────────────────────────────────────────────
// LOS INDICADORES DEL BALANCE, MES A MES
//
// Los cuatro de siempre (razón corriente, prueba ácida, capital de trabajo y
// endeudamiento), pero sacados de todos los meses del año y no solo del que se escoja,
// para poder dibujar cómo vienen. Angie los pidió así el 19/11/2026, al escoger una
// combinación de las formas A y B que le mostré: sub-pestañas para separar los del
// resultado de los del balance, y tarjetas con minigráfico dentro de cada una.
//
// ── POR QUÉ AQUÍ NO HAY COLUMNA DE AÑO ───────────────────────────────────────
// Los del estado de resultados suman meses, así que "el margen del año" existe. Un
// balance no: es una foto de un día. No existe "la razón corriente del año", y por eso
// en estos la cifra de cierre es la del último mes cerrado, no un total. En el Excel de
// Angie esa casilla quedaba en blanco todos los años y esta es la razón.
//
// El cálculo no se repite en ninguna parte: cada mes entra ya resuelto por
// `calcularBalance` o `calcularBalanceHistorico` (los trae `useBalanceMeses`), y aquí
// solo se dividen cifras que esos ya dejaron hechas.
// ─────────────────────────────────────────────────────────────────────────────

const div = (a, b) => (b ? a / b : null)

// Las seis cifras de un balance que necesitan los indicadores.
export function cifrasDe(bal) {
  if (!bal) return null
  const c = bal.corriente || {}
  const pasivo = bal.secciones?.find(s => s.id === 'pasivo')?.total || 0
  return {
    activoCorriente: c.activoCorriente || 0,
    pasivoCorriente: c.pasivoCorriente || 0,
    capitalTrabajo: c.capitalTrabajo || 0,
    inventario: bal.inventario?.total || 0,
    pasivoTotal: pasivo,
    activoTotal: bal.activo?.total || 0,
  }
}

export const INDICADORES_BALANCE = [
  { tipo: 'grupo', nombre: 'Liquidez' },
  {
    tipo: 'dato', id: 'razon', nombre: 'Razón corriente', formato: 'veces', mejorEs: 'alto',
    explica: 'Por cada peso que hay que pagar en doce meses, cuántos hay para hacerlo. Por debajo de 1 no alcanza.',
    valor: k => div(k.activoCorriente, k.pasivoCorriente),
  },
  {
    tipo: 'dato', id: 'acida', nombre: 'Prueba ácida', formato: 'veces', mejorEs: 'alto',
    explica: 'Lo mismo, pero sin contar con vender el inventario, que es lo más lento de volverse plata.',
    valor: k => div(k.activoCorriente - k.inventario, k.pasivoCorriente),
  },
  {
    tipo: 'dato', id: 'capital', nombre: 'Capital de trabajo', formato: 'pesos', mejorEs: 'alto',
    explica: 'Lo que queda después de pagar todo lo que vence en doce meses. En negativo, es lo que falta.',
    valor: k => k.capitalTrabajo,
  },
  { tipo: 'grupo', nombre: 'Endeudamiento' },
  {
    tipo: 'dato', id: 'endeudamiento', nombre: 'Razón de endeudamiento', formato: 'pct', mejorEs: 'bajo',
    explica: 'De todo lo que tiene la empresa, qué parte está financiada con deuda y no con plata de los socios.',
    valor: k => {
      const r = div(k.pasivoTotal, k.activoTotal)
      return r == null ? null : r * 100
    },
  },
]

export const DATOS_BALANCE = INDICADORES_BALANCE.filter(i => i.tipo === 'dato')

// `porMes` es { '2026-01': balance, … } tal como lo deja `useBalanceMeses`; `meses` es el
// orden en que se quieren. Devuelve, por indicador, su valor en cada mes.
export function calcularIndicadoresBalance(porMes, meses) {
  const cifras = meses.map(m => cifrasDe(porMes[m]))
  return DATOS_BALANCE.map(ind => ({
    indicador: ind,
    valores: cifras.map(k => (k ? ind.valor(k) : null)),
  }))
}
