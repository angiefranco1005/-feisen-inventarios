// Motor de cada línea de OF (2026-11-24, columnas items_of.motor y items_of.motor_item_id).
//   'sin' → sin motor · 'cliente' → lo pone el cliente · 'feisen' → sale de la bodega MOTORES
//   null  → línea creada antes de la pregunta (no se sabe)
// Solo cuentan los motores de MOTORES CONSTRU: los de EQUIPMASTER STORE son de un cliente
// que nos los deja guardados (decisión de Angie), así que no se ofrecen ni se cuentan.
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { esBodegaMotores } from '../../shared/seriales'

export const MOTOR_OPCIONES = [
  { id: 'sin', label: 'Sin motor' },
  { id: 'cliente', label: 'Motor del cliente' },
  { id: 'feisen', label: 'Motor Feisen' },
]

const esDeCliente = categoria => (categoria || '').toUpperCase().includes('EQUIPMASTER')

// Motores propios de la bodega MOTORES con lo que hay en existencia: [{ id, nombre, stock }]
export async function cargarMotoresFeisen() {
  const { data: bods } = await supabase.from('bodegas').select('id, nombre')
  const bodega = (bods || []).find(b => esBodegaMotores(b.nombre))
  if (!bodega) return []
  const { data: items } = await supabase.from('items')
    .select('id, nombre, bodega_id, categorias(nombre)').eq('bodega_id', bodega.id).eq('activo', true).order('nombre')
  const propios = (items || []).filter(i => i.bodega_id === bodega.id && !esDeCliente(i.categorias?.nombre))
  if (!propios.length) return []
  const { data: st } = await supabase.from('stock').select('item_id, cantidad_actual')
    .eq('bodega_id', bodega.id).in('item_id', propios.map(i => i.id))
  const stock = Object.fromEntries((st || []).map(s => [s.item_id, Number(s.cantidad_actual) || 0]))
  return propios.map(i => ({ id: i.id, nombre: i.nombre, stock: stock[i.id] || 0 }))
}

// Texto corto del motor de una línea (item.motor_item?.nombre viene del embed motor_item:items(nombre))
export function textoMotor(item, nombreMotor) {
  if (item.motor === 'sin') return 'Sin motor'
  if (item.motor === 'cliente') return 'Motor del cliente'
  if (item.motor === 'feisen') {
    const n = nombreMotor || item.motor_item?.nombre
    return n ? `Motor ${n}` : 'Motor Feisen por elegir'
  }
  return null
}

// Etiqueta del motor junto al detalle de la línea en las listas de OF
export function MotorLinea({ item }) {
  const t = textoMotor(item)
  if (!t) return null
  const tono = item.motor === 'feisen'
    ? (item.motor_item_id ? 'bg-feisen-azul-suave text-feisen-azul' : 'bg-amber-50 text-amber-800')
    : 'bg-gray-100 text-feisen-texto-2'
  return <span className={`ml-1.5 inline-block text-[11px] px-1.5 py-px rounded font-medium ${tono}`}>{t}</span>
}

// «¿Lleva motor?» + buscador del motor cuando es de Feisen
export function SelectorMotor({ motor, setMotor, motorItemId, setMotorItemId, motores, cantidad }) {
  const [texto, setTexto] = useState('')
  const elegido = motores.find(m => m.id === motorItemId)
  const filtrados = motores.filter(m => m.nombre.toLowerCase().includes(texto.trim().toLowerCase()))
  const cant = Number(cantidad) || 0
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="¿Lleva motor?">
        {MOTOR_OPCIONES.map(o => (
          <button key={o.id} type="button" role="radio" aria-checked={motor === o.id}
            onClick={() => { setMotor(o.id); if (o.id !== 'feisen') setMotorItemId(null) }}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors
              ${motor === o.id
                ? 'border-feisen-azul bg-feisen-azul-suave text-feisen-azul font-semibold'
                : 'border-feisen-borde bg-white text-feisen-texto-2 hover:border-feisen-gris-medio'}`}>
            {o.label}
          </button>
        ))}
      </div>
      {motor === 'feisen' && (
        <div>
          {elegido ? (
            <div className="flex items-center justify-between gap-3 border border-feisen-azul bg-feisen-azul-suave/40 rounded-lg px-3 py-2 text-sm">
              <span className="font-medium text-feisen-texto">{elegido.nombre}</span>
              <span className="flex items-center gap-3">
                <Existencia stock={elegido.stock} />
                <button type="button" onClick={() => { setMotorItemId(null); setTexto('') }} className="text-xs text-feisen-azul font-medium hover:underline">Cambiar</button>
              </span>
            </div>
          ) : (
            <>
              <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Busca el motor: marca, HP, gasolina, diésel..."
                className="w-full border border-feisen-borde rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-feisen-azul/25 focus:border-feisen-azul" />
              <div className="mt-1 border border-feisen-borde rounded-lg max-h-52 overflow-y-auto divide-y divide-feisen-borde-suave">
                {filtrados.length === 0 && <p className="px-3 py-2 text-sm text-feisen-gris-medio">Ningún motor coincide. Si no está en el catálogo, pídeselo a Logística.</p>}
                {filtrados.map(m => (
                  <button key={m.id} type="button" onClick={() => setMotorItemId(m.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left hover:bg-feisen-fondo">
                    <span className="text-feisen-texto">{m.nombre}</span>
                    <Existencia stock={m.stock} />
                  </button>
                ))}
              </div>
            </>
          )}
          {elegido && cant > 0 && (
            <p className="text-xs text-feisen-gris-medio mt-1.5">
              Se piden {cant} {cant === 1 ? 'motor' : 'motores'}, uno por máquina.
              {elegido.stock < cant && ' No alcanzan los del almacén: le aparece a Logística como faltante.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Existencia({ stock }) {
  return <span className={`text-xs whitespace-nowrap ${stock > 0 ? 'text-emerald-700' : 'text-feisen-rojo'}`}>{stock > 0 ? `${stock} en almacén` : 'Sin existencia'}</span>
}
