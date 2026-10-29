// Cálculo del valor por hora-máquina de un equipo de planta (costeo_equipos_planta).
// Método: (depreciación anual + mantenimiento anual + energía anual) ÷ horas disponibles al año.
// Depreciación anual = saldo pendiente por depreciar ÷ vida útil restante (años).
// Nota: "saldo_pendiente_depreciar" es el saldo en libros que todavía falta depreciar HOY,
// no el valor de rescate al final de la vida útil (eso sería el "valor residual" contable).
// Para un equipo nuevo, el saldo pendiente es igual al costo original (nada depreciado aún).
export function calcularCostosEquipo(eq) {
  const saldoPendiente = Number(eq?.saldo_pendiente_depreciar || 0)
  const vidaUtil = Number(eq?.vida_util_anios || 0)
  const mantenimiento = Number(eq?.mantenimiento_anual || 0)
  const kw = Number(eq?.kw_instalados || 0)
  const tarifa = Number(eq?.tarifa_kwh || 0)
  const horas = Number(eq?.horas_disponibles_anio || 0)

  const depreciacionAnual = vidaUtil > 0 ? saldoPendiente / vidaUtil : 0
  const energiaAnual = kw * tarifa * horas
  const costoAnualTotal = depreciacionAnual + mantenimiento + energiaAnual
  const valorHora = horas > 0 ? costoAnualTotal / horas : 0

  return { depreciacionAnual, energiaAnual, costoAnualTotal, valorHora }
}
