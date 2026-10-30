import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Alerta from '../shared/Alerta'
import { Lock, AlertTriangle } from '../shared/iconos'
import { MODULOS, NIVELES, ORDEN_NIVEL, PERMISOS_INICIALES, nivelDe } from '../../permisos/modulos'

// Configuración › Permisos: matriz rol × módulo. Tocar una celda pasa al siguiente nivel que
// la pantalla soporta (No → Ve → Registra → Todo) y se guarda al instante en rol_permisos.
// ADMIN no se edita (siempre todo) y Configuración es solo de ADMIN.

const CLASE = {
  todo:     'bg-feisen-azul text-white',
  registra: 'bg-feisen-azul-suave text-feisen-azul',
  ve:       'bg-white text-feisen-texto-2 ring-1 ring-inset ring-feisen-borde',
  no:       'text-gray-300',
}
const GRUPOS = [...new Set(MODULOS.map(m => m.grupo))]
// Nombre para roles que el código conoce aunque no estén en la tabla roles
const NOMBRE_ROL = { JEFE_FUNDICION: 'Jefe Fundición', JEFE_ENSAMBLE: 'Jefe Ensamble', JEFE_MECANIZADOS: 'Jefe Mecanizados', RRHH: 'Recursos Humanos', OPERARIO: 'Operario', CONSULTOR: 'Consultor', COMERCIAL: 'Asesor comercial' }

export default function SeccionPermisos({ datos, avisar }) {
  const { perfil, permisos, recargarPermisos } = useAuth()
  const [mapa, setMapa] = useState(permisos)
  const [guardando, setGuardando] = useState(null) // 'ROL:modulo'
  const [error, setError] = useState('')

  useEffect(() => { recargarPermisos() }, [recargarPermisos])
  useEffect(() => { setMapa(permisos) }, [permisos])

  // Columnas: ADMIN primero, luego los roles de la tabla roles (más los que el código conoce)
  const nombres = [...new Set(['ADMIN', ...datos.roles.map(r => r.nombre), ...Object.keys(PERMISOS_INICIALES)])]
  const roles = nombres.map(n => ({ nombre: n, label: datos.roles.find(r => r.nombre === n)?.label || NOMBRE_ROL[n] || n }))
  const personas = n => datos.usuarios.filter(u => u.rol === n && u.activo !== false).map(u => u.nombre.trim().split(/\s+/)[0])

  async function cambiar(rol, modulo) {
    const m = MODULOS.find(x => x.clave === modulo)
    const opciones = ['no', ...m.niveles]
    const actual = nivelDe(mapa, rol, modulo)
    const siguiente = opciones[(opciones.indexOf(actual) + 1) % opciones.length]
    const clave = `${rol}:${modulo}`
    setGuardando(clave); setError('')
    setMapa(prev => ({ ...prev, [rol]: { ...(prev[rol] || {}), [modulo]: siguiente } }))
    const { error: err } = await supabase.from('rol_permisos').upsert(
      { rol, modulo, nivel: siguiente, actualizado_por: perfil.id, updated_at: new Date().toISOString() },
      { onConflict: 'rol,modulo' })
    setGuardando(null)
    if (err) {
      setMapa(prev => ({ ...prev, [rol]: { ...(prev[rol] || {}), [modulo]: actual } }))
      setError('No se pudo guardar: ' + err.message)
      return
    }
    avisar(`${roles.find(r => r.nombre === rol)?.label} · ${m.nombre}: ${NIVELES[siguiente].texto}`)
    recargarPermisos()
  }

  // Se le dio más de lo que tenía al crear la tabla: la base (RLS por rol) quizá no lo deje ver
  const sinBase = (rol, modulo, nivel) => !MODULOS.find(x => x.clave === modulo)?.rlsPorMatriz &&
    ORDEN_NIVEL[nivel] > ORDEN_NIVEL[PERMISOS_INICIALES[rol]?.[modulo] || 'no']

  return (
    <div className="space-y-3">
      <p className="text-sm text-feisen-texto-2 max-w-3xl">
        Toca una celda para cambiar lo que ese rol ve en el módulo; se guarda al instante y la persona lo ve al volver a entrar.
        Cada módulo solo ofrece los niveles que su pantalla sabe manejar. Para revisarlo como otra persona, usa <b className="font-medium text-feisen-texto">Vista previa</b> en el menú.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-feisen-texto-2 items-center">
        {['todo', 'registra', 've', 'no'].map(n => (
          <span key={n} className="inline-flex items-center gap-1.5">
            <span className={`rounded-md px-1.5 py-0.5 font-medium ${CLASE[n]}`}>{n === 'no' ? '—' : NIVELES[n].texto}</span>{NIVELES[n].ayuda}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><AlertTriangle size={13} className="text-amber-600" /> la base de datos todavía no le da esos datos a este rol</span>
      </div>
      {error && <Alerta tipo="error" mensaje={error} />}

      <div className="bg-white border border-feisen-borde rounded-xl overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0 min-w-[900px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-white text-left px-3 py-2.5 border-b border-feisen-borde text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2 min-w-[180px]">Módulo</th>
              {roles.map(r => {
                const p = personas(r.nombre)
                return (
                  <th key={r.nombre} className="text-left align-bottom px-2 py-2.5 border-b border-feisen-borde min-w-[96px]">
                    <span className="block text-[12.5px] font-semibold text-feisen-texto leading-tight">{r.label}</span>
                    <span className="block text-[11px] font-normal text-feisen-texto-2 leading-snug mt-0.5">{p.length ? p.join(' · ') : 'sin personas'}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {GRUPOS.map(g => [
              <tr key={g}>
                <td className="sticky left-0 z-10 bg-feisen-fondo px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-feisen-texto-2">{g}</td>
                <td colSpan={roles.length} className="bg-feisen-fondo" />
              </tr>,
              ...MODULOS.filter(m => m.grupo === g).map(m => (
                <tr key={m.clave}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-feisen-borde-suave">
                    <span className="block font-medium text-feisen-texto">{m.nombre}</span>
                    <span className="block text-xs text-feisen-texto-2 leading-snug">{m.detalle}</span>
                  </td>
                  {roles.map(r => {
                    const n = nivelDe(mapa, r.nombre, m.clave)
                    const bloqueado = r.nombre === 'ADMIN' || m.soloAdmin
                    const aviso = !bloqueado && sinBase(r.nombre, m.clave, n)
                    const opciones = ['no', ...m.niveles]
                    const sig = opciones[(opciones.indexOf(n) + 1) % opciones.length]
                    return (
                      <td key={r.nombre} className="px-2 py-2 border-b border-feisen-borde-suave">
                        {bloqueado ? (
                          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${r.nombre === 'ADMIN' ? CLASE.todo : CLASE.no}`}
                            title={r.nombre === 'ADMIN' ? 'Administración siempre tiene todo' : 'Solo administración'}>
                            {r.nombre === 'ADMIN' ? <><Lock size={11} /> Todo</> : '—'}
                          </span>
                        ) : (
                          <button type="button" onClick={() => cambiar(r.nombre, m.clave)} disabled={guardando === `${r.nombre}:${m.clave}`}
                            title={`${NIVELES[n].ayuda}. Tocar: ${NIVELES[sig].texto}`}
                            aria-label={`${r.label}, ${m.nombre}: ${NIVELES[n].texto}. Cambiar a ${NIVELES[sig].texto}`}
                            className={`inline-flex items-center gap-1 min-h-[30px] rounded-md px-2 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 ${CLASE[n]} ${n === 'no' ? 'hover:bg-feisen-fondo' : ''}`}>
                            {n === 'no' ? '—' : NIVELES[n].texto}
                            {aviso && <AlertTriangle size={12} className={n === 'todo' ? 'text-amber-200' : 'text-amber-600'} />}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-feisen-texto-2 max-w-3xl">
        «Su bodega» se sigue asignando en Usuarios: cada persona ve y registra solo en las bodegas que tiene; solo administración ve todas y los valores del inventario.
        Lo que dentro de cada pantalla depende del rol (por ejemplo precios de costo) no cambia desde aquí.
      </p>
    </div>
  )
}
