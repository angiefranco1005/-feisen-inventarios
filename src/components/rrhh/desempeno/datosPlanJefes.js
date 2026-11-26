// Plan de evaluación de jefes de área (pedido de Angie, 2026-11-26). El plan se armó en el
// registro "Evaluación de jefes de área 2027" y se copió aquí; desde ahora se edita en el ERP
// (Desempeño → Plan de jefes). Un ciclo de tipo 'jefes' copia el plan al crearse: cambios
// posteriores al plan no tocan los ciclos ya creados.
import { supabase } from '../../../lib/supabase'
import { itemsParaJefe } from './desempenoCalculo'

export async function aniosPlan() {
  const { data } = await supabase.from('desempeno_jefes_areas').select('anio')
  return [...new Set((data || []).map(d => d.anio))].sort((a, b) => b - a)
}

// Áreas (con sus ítems ordenados) de un año
export async function cargarPlan(anio) {
  const { data, error } = await supabase.from('desempeno_jefes_areas')
    .select('*, desempeno_jefes_items(*)').eq('anio', anio).order('orden')
  if (error) throw error
  return (data || []).map(a => ({
    ...a, items: (a.desempeno_jefes_items || []).sort((x, y) => (x.orden - y.orden) || x.nombre.localeCompare(y.nombre)),
  }))
}

// Ítems de la evaluación de un jefe según el plan del ciclo (null si no es jefe en el plan)
export function itemsJefeEnPlan(plan, empleadoId, conEncuesta) {
  const area = plan.find(a => !a.es_comun && a.empleado_id === empleadoId)
  if (!area) return null
  const comun = plan.find(a => a.es_comun)
  return {
    area,
    items: itemsParaJefe(area.items.filter(i => i.tipo === 'kpi'), (comun?.items || []).filter(i => i.tipo === 'competencia'), conEncuesta),
  }
}
