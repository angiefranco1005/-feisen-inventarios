// Piezas compartidas por la ficha del colaborador y la ficha del cargo:
// tarjetas ("bloques") que se ven como datos y se editan por separado.
//
// Un bloque es { id, titulo, icon, campos, derivar?, alGuardar? } y cada campo
// { k, label, tipo?, req?, full?, opciones?, visible?, extra?, nota?, mostrar?, columnas? }.
// `ctx` lleva datos que algunos campos necesitan (listas para selects, jefe…);
// `opciones` puede ser una función de ctx para selects dinámicos.
import { Pencil, Plus, X } from '../shared/iconos'
import Alerta from '../shared/Alerta'
import * as E from './estilos'
import { nombreCompleto, formatoFecha, formatoPesos } from './catalogosRRHH'

function resolverOpciones(c, ctx) {
  return (typeof c.opciones === 'function' ? c.opciones(ctx) : c.opciones) || []
}

function opcionLabel(c, valor, ctx) {
  const op = resolverOpciones(c, ctx).find(o => (typeof o === 'object' ? String(o.value) : o) === String(valor))
  return op ? (typeof op === 'object' ? op.label : op) : valor
}

const listaVacia = (c) => (c.columnas ? {} : '')
const filaVacia = (c, f) => c.columnas ? c.columnas.every(col => !String(f?.[col.k] ?? '').trim()) : !String(f ?? '').trim()

// Valores del formulario al empezar a editar un bloque
export function valoresIniciales(bloque, registro) {
  const f = {}
  for (const c of bloque.campos) {
    const v = registro[c.k]
    if (c.tipo === 'lista') f[c.k] = Array.isArray(v) && v.length ? v.map(x => (c.columnas ? { ...x } : x)) : [listaVacia(c)]
    else if (c.tipo === 'bool') f[c.k] = !!v
    else f[c.k] = v === null || v === undefined ? '' : (c.tipo === 'select' || c.tipo === 'number' ? String(v) : v)
  }
  return f
}

// Convierte el formulario en el objeto a guardar en la base
export function valoresParaGuardar(bloque, form, ctx) {
  const cambios = {}
  for (const c of bloque.campos) {
    let v = form[c.k]
    if (c.tipo === 'lista') {
      v = (v || []).filter(f => !filaVacia(c, f)).map(f => c.columnas
        ? Object.fromEntries(c.columnas.map(col => {
            const x = typeof f[col.k] === 'string' ? f[col.k].trim() : f[col.k]
            return [col.k, col.tipo === 'number' && x !== '' && x !== undefined ? Number(x) : (x ?? '')]
          }))
        : f.trim())
    } else {
      if (typeof v === 'string') v = v.trim()
      if (v === '') v = null
      if (c.tipo === 'money' && v !== null) v = Number(String(v).replace(/[^\d.]/g, ''))
      if (c.tipo === 'number' && v !== null) v = Number(v)
      if (c.numerico && v !== null) v = Number(v)
    }
    if (c.visible && !c.visible(form)) v = c.tipo === 'lista' ? [] : null
    cambios[c.k] = v
  }
  return bloque.alGuardar ? bloque.alGuardar(cambios, ctx) : cambios
}

function textoCampo(c, registro, ctx) {
  const v = registro[c.k]
  if (c.mostrar) return c.mostrar(registro, ctx)
  if (c.tipo === 'bool') return v ? 'Sí' : 'No'
  if (v === null || v === undefined || v === '') return null
  if (c.tipo === 'date') return formatoFecha(v)
  if (c.tipo === 'money') return formatoPesos(v)
  if (c.tipo === 'select') return opcionLabel(c, v, ctx)
  if (c.tipo === 'jefe') return ctx?.jefe ? `${nombreCompleto(ctx.jefe)}${ctx.jefe.cargo ? ` · ${ctx.jefe.cargo}` : ''}` : null
  return v
}

function ListaVista({ c, valor }) {
  const filas = Array.isArray(valor) ? valor : []
  if (filas.length === 0) return <p className="text-sm text-feisen-gris-medio/70">—</p>
  if (!c.columnas) return (
    <ul className="space-y-1.5">
      {filas.map((f, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-feisen-texto">
          <span className="w-1 h-1 rounded-full bg-feisen-gris-medio mt-2 flex-shrink-0" />{f}
        </li>
      ))}
    </ul>
  )
  return (
    <div className="border border-feisen-borde-suave rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-feisen-gris-medio border-b border-feisen-borde-suave">
            {c.columnas.map(col => <th key={col.k} className={`font-medium px-3 py-2 ${col.ancho || ''}`}>{col.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-feisen-borde-suave">
          {filas.map((f, i) => (
            <tr key={i}>
              {c.columnas.map(col => (
                <td key={col.k} className={`px-3 py-2 ${col.k === c.columnas[0].k ? 'text-feisen-texto' : 'text-feisen-texto-2'}`}>
                  {f[col.k] === '' || f[col.k] === undefined || f[col.k] === null ? '—' : `${f[col.k]}${col.sufijo || ''}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {c.pie && <tfoot>{c.pie(filas)}</tfoot>}
      </table>
    </div>
  )
}

function ListaEditable({ c, valor, onChange }) {
  const filas = Array.isArray(valor) && valor.length ? valor : [listaVacia(c)]
  const cambiar = (i, v) => onChange(filas.map((f, j) => (j === i ? v : f)))
  const quitar = (i) => onChange(filas.length === 1 ? [listaVacia(c)] : filas.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      {c.columnas && (
        <div className="hidden sm:flex gap-2 pr-9">
          {c.columnas.map(col => <span key={col.k} className={`${E.labelForm} mb-0 ${col.ancho || 'flex-1'}`}>{col.label}</span>)}
        </div>
      )}
      {filas.map((f, i) => (
        <div key={i} className="flex gap-2 items-start">
          {c.columnas
            ? <div className="flex-1 flex flex-col sm:flex-row gap-2">
                {c.columnas.map(col => (
                  <input key={col.k} value={f[col.k] ?? ''} placeholder={col.placeholder || col.label}
                    type={col.tipo === 'number' ? 'number' : 'text'} min={col.tipo === 'number' ? 0 : undefined}
                    onChange={e => cambiar(i, { ...f, [col.k]: e.target.value })}
                    className={`${E.input} ${col.ancho || 'flex-1'}`} />
                ))}
              </div>
            : <input value={f} placeholder={c.placeholder} onChange={e => cambiar(i, e.target.value)} className={`${E.input} flex-1`} />}
          <button type="button" onClick={() => quitar(i)} title="Quitar"
            className="p-2 text-feisen-gris-medio hover:text-feisen-rojo hover:bg-feisen-rojo-suave rounded-lg flex-shrink-0">
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...filas, listaVacia(c)])} className={`${E.btnTextoAzul} -ml-2.5`}>
        <Plus size={14} strokeWidth={1.8} /> {c.agregar || 'Agregar'}
      </button>
    </div>
  )
}

export function CampoEditable({ campo: c, valor, onChange, form, ctx }) {
  const label = <label className={E.labelForm}>{c.label}{c.req && ' *'}</label>
  const nota = typeof c.nota === 'function' ? c.nota(form) : c.nota
  const wrap = (input) => (
    <div className={c.full || c.tipo === 'lista' ? 'col-span-full' : ''}>
      {label}{input}
      {nota && <p className="text-xs text-feisen-gris-medio mt-1">{nota}</p>}
    </div>
  )

  if (c.tipo === 'lista') return wrap(<ListaEditable c={c} valor={valor} onChange={onChange} />)
  if (c.tipo === 'bool') return (
    <label className="flex items-center gap-2.5 border border-feisen-borde rounded-lg px-3 py-2 self-end cursor-pointer">
      <input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-feisen-azul" />
      <span className="text-sm text-feisen-texto">{c.label}</span>
    </label>
  )
  if (c.tipo === 'select') {
    const opciones = resolverOpciones(c, ctx)
    // Un valor guardado que ya no está en el catálogo (p. ej. un área renombrada) se sigue mostrando
    const huerfano = valor && !opciones.some(o => String(typeof o === 'object' ? o.value : o) === String(valor))
    return wrap(
      <select required={c.req} value={valor ?? ''} onChange={e => onChange(e.target.value)} className={E.input}>
        {!c.req ? <option value="">{c.vacio || '—'}</option> : <option value="" disabled>Seleccionar…</option>}
        {opciones.map(o => typeof o === 'object'
          ? <option key={o.value} value={o.value}>{o.label}</option>
          : <option key={o} value={o}>{o}</option>)}
        {huerfano && <option value={valor}>{valor} (ya no está en la lista)</option>}
      </select>
    )
  }
  if (c.tipo === 'jefe') return wrap(
    <select value={valor ?? ''} onChange={e => onChange(e.target.value)} className={E.input}>
      <option value="">— Sin jefe asignado —</option>
      {(ctx?.otros || []).filter(o => o.estado !== 'retirado' || o.id === valor).map(o =>
        <option key={o.id} value={o.id}>{nombreCompleto(o)}{o.cargo ? ` · ${o.cargo}` : ''}</option>)}
    </select>
  )
  if (c.tipo === 'textarea') return wrap(
    <textarea rows={3} value={valor ?? ''} onChange={e => onChange(e.target.value)} className={E.input} />
  )
  if (c.tipo === 'money') return wrap(
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-feisen-gris-medio">$</span>
      <input inputMode="numeric" value={valor === null || valor === '' ? '' : Number(String(valor).replace(/[^\d]/g, '')).toLocaleString('es-CO')}
        onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))} className={`${E.input} pl-7`} />
    </div>
  )
  if (c.tipo === 'number') return wrap(
    <input required={c.req} type="number" min={c.min ?? 1} step="1" inputMode="numeric"
      value={valor ?? ''} onChange={e => onChange(e.target.value)} className={E.input} />
  )
  return wrap(
    <input required={c.req} type={c.tipo === 'date' ? 'date' : c.tipo === 'email' ? 'email' : 'text'}
      value={valor ?? ''} onChange={e => onChange(e.target.value)} className={E.input} />
  )
}

export function Bloque({ bloque, registro, ctx, editando, bloqueado, form, setForm, guardando, msg, onEditar, onCancelar, onGuardar }) {
  return (
    <div className={E.tarjeta}>
      <div className={E.cabTarjeta}>
        <h2 className={E.tituloTarj}>
          <bloque.icon {...E.ICONO} className={E.iconoTitulo} /> {bloque.titulo}
        </h2>
        {!editando && (
          <button onClick={onEditar} disabled={bloqueado} className={`${E.btnTexto} -mr-2`}>
            <Pencil size={14} strokeWidth={1.8} /> Editar
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {bloque.ayuda && !editando && <p className="text-xs text-feisen-gris-medio -mt-1 mb-3">{bloque.ayuda}</p>}
        {msg && <div className="mb-4"><Alerta tipo={msg.tipo} mensaje={msg.texto} /></div>}
        {editando ? (
          <form onSubmit={onGuardar}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bloque.campos.map(c => (!c.visible || c.visible(form)) && (
                <CampoEditable key={c.k} campo={c} valor={form[c.k]} form={form} ctx={ctx}
                  onChange={v => setForm(f => {
                    const nf = { ...f, [c.k]: v }
                    return bloque.derivar ? bloque.derivar(nf, c.k, ctx) : nf
                  })} />
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-5">
              <button type="button" onClick={onCancelar} className={E.btnSecundario}>Cancelar</button>
              <button type="submit" disabled={guardando} className={E.btnPrimario}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3.5">
            {bloque.campos.map(c => {
              if (c.visible && !c.visible(registro)) return null
              if (c.tipo === 'lista') return (
                <div key={c.k} className="col-span-full">
                  {bloque.campos.length > 1 && <dt className={`${E.etiqueta} mb-1.5`}>{c.label}</dt>}
                  <dd><ListaVista c={c} valor={registro[c.k]} /></dd>
                </div>
              )
              const texto = textoCampo(c, registro, ctx)
              const extra = c.extra?.(registro, ctx) || (texto && typeof c.nota === 'function' ? c.nota(registro) : null)
              return (
                <div key={c.k} className={c.full ? 'col-span-full' : ''}>
                  <dt className={`${E.etiqueta} mb-0.5`}>{c.label}</dt>
                  <dd className={`text-sm whitespace-pre-line ${texto ? 'text-feisen-texto' : 'text-feisen-gris-medio/70'}`}>
                    {texto || '—'}
                    {extra && <span className="block text-xs text-feisen-gris-medio">{extra}</span>}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </div>
    </div>
  )
}
