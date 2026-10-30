// Catálogo de módulos del ERP para los permisos editables desde Configuración › Permisos.
// La tabla `rol_permisos` (rol × módulo → nivel) dice qué módulo ve cada rol; ADMIN siempre
// tiene todo y no se guarda. Ver supabase/migraciones/2026-10-29_rol_permisos.sql.
//
// Niveles: 'no' · 've' (solo consulta) · 'registra' (crea y edita lo suyo, en su bodega) · 'todo'.
// `niveles` = lo que la pantalla de verdad sabe hacer para un rol que no es ADMIN; la matriz
// solo ofrece esos. `rutas` = rutas de App.jsx que abre el módulo; `rutasNivel` = rutas que
// piden un nivel mínimo (las demás se abren con cualquier nivel distinto de 'no').
// `usaBodega` = el módulo trabaja con las bodegas asignadas a la persona: si su rol no tiene
// ninguno de esos, no hace falta asignarle bodega (ej. quien solo ve OF).
//
// Etapa 1: esto manda en el menú y las rutas. Las políticas RLS siguen por rol fijo, así que
// darle un módulo a un rol que no lo tenía puede mostrar la pantalla vacía (etapa 2).
// `rlsPorMatriz` = las RLS de ese módulo ya leen rol_permisos (función mi_nivel), así que
// cualquier nivel funciona también en la base de datos.

export const NIVELES = {
  no:       { texto: 'No',       ayuda: 'No le aparece' },
  ve:       { texto: 'Ve',       ayuda: 'Solo consulta' },
  registra: { texto: 'Registra', ayuda: 'Crea y edita lo suyo, en su bodega' },
  todo:     { texto: 'Todo',     ayuda: 'Crea, edita y ve todo el módulo' },
}
export const ORDEN_NIVEL = { no: 0, ve: 1, registra: 2, todo: 3 }

export const MODULOS = [
  { clave: 'productos',      grupo: 'Inventario', nombre: 'Productos y stock', detalle: 'existencias de su bodega', niveles: ['ve', 'registra'], usaBodega: true,
    rutas: ['/productos'] },
  { clave: 'movimientos',    grupo: 'Inventario', nombre: 'Entradas y salidas', detalle: 'registrar movimientos', niveles: ['registra'], usaBodega: true,
    rutas: ['/movimientos/nuevo'] },
  { clave: 'historial',      grupo: 'Inventario', nombre: 'Historial', detalle: 'movimientos registrados', niveles: ['ve'], usaBodega: true,
    rutas: ['/movimientos'] },
  { clave: 'transferencias', grupo: 'Inventario', nombre: 'Transferencias', detalle: 'aprobar lo que llega a su bodega', niveles: ['registra'], usaBodega: true,
    rutas: ['/transferencias'] },
  { clave: 'paquetes',       grupo: 'Inventario', nombre: 'Paquetes por máquina', detalle: 'kits para sacar de una vez', niveles: ['todo'], usaBodega: true,
    rutas: ['/mecanizados/paquetes'] },
  { clave: 'reportes',       grupo: 'Inventario', nombre: 'Inventario físico, kardex y corte', detalle: 'reportes de inventario', niveles: ['ve'], usaBodega: true,
    rutas: ['/reportes', '/reportes/corte', '/reportes/inventario-fisico', '/reportes/kardex'] },

  { clave: 'pedidos',        grupo: 'Compras', nombre: 'Pedidos internos', detalle: 'Registra: los suyos · Todo: gestiona los de todos', niveles: ['registra', 'todo'], usaBodega: true,
    rutas: ['/pedidos'] },
  { clave: 'ordenes_compra', grupo: 'Compras', nombre: 'Órdenes de compra', detalle: 'a proveedores', niveles: ['todo'],
    rutas: ['/ordenes-compra'] },

  { clave: 'fundicion',      grupo: 'Producción', nombre: 'Fundición', detalle: 'fundidas, moldeo, recogida, BOM, nómina', niveles: ['todo'], usaBodega: true,
    rutas: ['/fundidas', '/fundidas/nueva', '/moldeo', '/moldeo/nueva', '/moldeo/catalogo', '/recogida', '/nomina/fundicion', '/analitica/fundicion'] },
  { clave: 'informes_fundicion', grupo: 'Producción', nombre: 'Informes de fundición', detalle: 'balance de hierro, ventas internas', niveles: ['ve'],
    rutas: ['/reportes/balance-hierro', '/reportes/ventas-internas-fundicion'] },
  { clave: 'mecanizados',    grupo: 'Producción', nombre: 'Mecanizados', detalle: 'registro de mecanizado', niveles: ['todo'], usaBodega: true,
    rutas: ['/mecanizados/registro'] },
  { clave: 'ensamble',       grupo: 'Producción', nombre: 'Ensamble', detalle: 'órdenes y recetas', niveles: ['todo'], usaBodega: true,
    rutas: ['/ensamble', '/ensamble/recetas'] },
  { clave: 'calidad',        grupo: 'Producción', nombre: 'Calidad', detalle: 'no conformidades', niveles: ['registra'], usaBodega: true,
    rutas: ['/calidad'] },
  { clave: 'mantenimiento',  grupo: 'Producción', nombre: 'Mantenimiento', detalle: 'equipos; reporta fallas de su área', niveles: ['registra'], usaBodega: true,
    rutas: ['/mantenimiento'] },

  { clave: 'of',             grupo: 'Ventas', nombre: 'Órdenes de fabricación', detalle: 'Ve: despachos, sin cliente · Registra: crea y edita las suyas · Todo: edita todas', niveles: ['ve', 'registra', 'todo'], rlsPorMatriz: true,
    rutasNivel: { '/of/nueva': 'registra', '/of/dashboard': 'registra', '/of/productos': 'registra', '/of/clientes': 'registra' },
    rutas: ['/of/nueva', '/of/ordenes', '/of/resumen', '/of/calendario', '/of/dashboard', '/of/productos', '/of/clientes'] },

  { clave: 'manuales',       grupo: 'Administración', nombre: 'Manuales de procedimiento', detalle: 'Ve: consulta lo aprobado · Registra: elabora borradores · Todo: revisa y marca obsoletos (aprueba solo ADMIN)', niveles: ['ve', 'registra', 'todo'], rlsPorMatriz: true,
    rutas: ['/manuales'] },
  { clave: 'costeo',         grupo: 'Administración', nombre: 'Costeo', detalle: 'fichas de costo', niveles: ['todo'],
    rutas: ['/costeo', '/costeo/fichas/:id', '/costeo/etapas', '/costeo/cif', '/costeo/equipos'] },
  { clave: 'rrhh',           grupo: 'Administración', nombre: 'Recursos Humanos', detalle: 'colaboradores, nómina, novedades', niveles: ['todo'],
    rutas: ['/rrhh/empleados', '/rrhh/empleados/:id', '/rrhh/organigrama', '/rrhh/organigrama/:id', '/rrhh/novedades', '/rrhh/calendario',
      '/rrhh/nomina', '/rrhh/nomina/tarifas', '/rrhh/nomina/:periodoId', '/rrhh/nomina/:periodoId/:liqId',
      '/rrhh/desempeno', '/rrhh/desempeno/:cicloId', '/rrhh/desempeno/:cicloId/:evalId'] },
  { clave: 'finanzas',       grupo: 'Administración', nombre: 'Finanzas', detalle: 'resultado por centro, cartera, por pagar y flujo de caja (Odoo)', niveles: [], soloAdmin: true,
    rutas: ['/finanzas/resultado', '/finanzas/cartera', '/finanzas/por-pagar', '/finanzas/flujo'] },
  { clave: 'config',         grupo: 'Administración', nombre: 'Configuración', detalle: 'usuarios, bodegas, roles y permisos', niveles: [], soloAdmin: true,
    rutas: ['/config'] },
]

export const MODULO_POR_CLAVE = Object.fromEntries(MODULOS.map(m => [m.clave, m]))

// Lo que cada rol tenía cuando se creó la tabla (= carga inicial de la migración). Sirve de
// respaldo si la tabla no carga, y para avisar en la matriz cuando se le da a un rol algo
// que la base de datos todavía no le deja ver (las RLS siguen por rol hasta la etapa 2).
const BASE_INVENTARIO = { productos: 'registra', movimientos: 'registra', historial: 've', pedidos: 'registra', calidad: 'registra', manuales: 've' }
export const PERMISOS_INICIALES = {
  LOGISTICA:        { ...BASE_INVENTARIO, pedidos: 'todo', ordenes_compra: 'todo' },
  ALMACENISTA:      { ...BASE_INVENTARIO },
  OPERARIO:         { ...BASE_INVENTARIO },
  JEFE_FUNDICION:   { ...BASE_INVENTARIO, transferencias: 'registra', mantenimiento: 'registra', fundicion: 'todo' },
  JEFE_MECANIZADOS: { ...BASE_INVENTARIO, transferencias: 'registra', mantenimiento: 'registra', mecanizados: 'todo' },
  JEFE_ENSAMBLE:    { ...BASE_INVENTARIO, mantenimiento: 'registra', ensamble: 'todo' },
  CONSULTOR:        { historial: 've', manuales: 've' },
  COMERCIAL:        { of: 'registra', manuales: 've' },
  DESPACHOS:        { of: 've', productos: 've', manuales: 've' },
  JEFE_MANTENIMIENTO: { of: 've', pedidos: 'registra', manuales: 've' },
  RRHH:             { rrhh: 'todo', productos: 'registra', movimientos: 'registra', historial: 've', pedidos: 'registra', manuales: 've' },
}

// Nivel de un rol en un módulo según el mapa { rol: { modulo: nivel } }
export function nivelDe(mapa, rol, modulo) {
  if (rol === 'ADMIN') return 'todo'
  if (MODULO_POR_CLAVE[modulo]?.soloAdmin) return 'no'
  return mapa?.[rol]?.[modulo] || 'no'
}

// Módulo al que pertenece una ruta (para el menú)
export function moduloDeRuta(ruta) {
  return MODULOS.find(m => m.rutas.includes(ruta))?.clave || null
}

// ¿El rol trabaja con bodegas? (si no, la persona puede quedar sin bodega asignada)
export function rolUsaBodega(mapa, rol) {
  if (rol === 'ADMIN') return false
  return MODULOS.some(m => m.usaBodega && nivelDe(mapa, rol, m.clave) !== 'no')
}

// ¿Este nivel alcanza para abrir la ruta? (ver `rutasNivel`)
export function nivelAbreRuta(modulo, ruta, nivel) {
  if (nivel === 'no') return false
  const minimo = MODULO_POR_CLAVE[modulo]?.rutasNivel?.[ruta]
  return !minimo || ORDEN_NIVEL[nivel] >= ORDEN_NIVEL[minimo]
}
