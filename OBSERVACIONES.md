# Observaciones — App de Inventario (Feisen ERP)

Registro de decisiones, pendientes y "gotchas" para retomar el contexto rápido. Actualizar cada vez que se resuelva algo importante o se descubra un problema no obvio.

## Gotchas importantes

- **`supabase/schema.sql` está desactualizado frente a la base real.** No confiar en él para constraints/columnas — verificar siempre en vivo (`pg_get_constraintdef`, `pg_get_functiondef`) antes de asumir el comportamiento de un trigger o un CHECK. Ya se encontraron dos desfases (ver abajo) causados por migraciones aplicadas en Supabase que nunca se reflejaron en este archivo.
- **`categorias` pertenece a una bodega (`bodega_id` NOT NULL en la base real)**, aunque `schema.sql` la muestra global. La migración de la bodega de Administración falló la primera vez por suponer lo contrario (2026-10-26). Al crear categorías por SQL, siempre con `bodega_id`.
- **Aprendices SENA (2026-10-27)**: tipos de contrato "Aprendiz SENA · etapa lectiva" y "· etapa práctica" (Angie dijo "electiva"; el término del SENA es "lectiva"). Llevan duración y fecha fin como el término fijo (`tieneFechaFin`), pero sin preaviso; lo pagado es apoyo de sostenimiento (50 % / 75 % SMMLV, Ley 789/2002), en nómina van como "fijo". `tipo_contrato` es texto libre en la base: agregar tipos no requiere migración.
- **Huellero → días (2026-11-03)**: a los de "al día" el huellero les pone los días (días hábiles con marcación) y recalcula totales; las horas siguen solo como sugerencia. Quien se agrega a la quincena después de cargar el archivo toma la sugerencia del archivo guardado (`huelleroDeQuincena`), y la tarjeta Huellero tiene "Aplicar a toda la quincena". Antes, el archivo solo llegaba a quien ya estaba en la quincena (caso real: huellero cargado y luego agregadas las personas → sin sugerencia).
- **Horas extra diurnas / nocturnas / festivas (2026-11-04)**: diurna = día ÷ 8,4 × 1,25; nocturna (7:00 p. m.–6:00 a. m., Ley 2466 de 2025) = × 1,75; domingo/festivo = × 2 (Feisen paga 100 %, por encima del mínimo legal vigente). En el huellero cada tramo extra se redondea completo y de ahí se separa la parte nocturna (`partirTramo`); domingo/festivo no se parte. Columnas nuevas: `empleados.valor_hora_nocturna`, `nomina_liquidaciones.horas_extra_nocturna` y `valor_hora_nocturna` (sin valor, la nocturna = diurna × 1,4). Pendiente legal a revisar con el contador: una hora extra nocturna en domingo/festivo legalmente acumula ambos recargos; hoy se paga al 100 %.
- **Comprobante por WhatsApp (2026-11-04)**: botón por persona en la quincena aprobada. Sube el PDF a `rrhh/nomina/<periodo>/whatsapp/`, crea un enlace firmado de 30 días y abre `wa.me/<57+celular>` con el mensaje listo; RRHH envía desde el WhatsApp de la empresa. Queda `whatsapp_enviado_en/_a` en la liquidación (se marca al abrir el chat, no hay confirmación de que se haya enviado). WhatsApp no permite adjuntar el PDF por wa.me. Si el volumen lo pide, el siguiente paso es la API de WhatsApp Business (Meta): verificación de la empresa, número dedicado, plantilla aprobada, costo por mensaje.
- **Sub-áreas y puestos de trabajo (2026-11-06)**: `cargos.subarea` (texto). Un puesto de trabajo es un cargo con sub-área: Área › Sub-área › Puesto (ej. Soldadura y Armado › Corte y embombe › Operario de plasma / Operario dobladora y cizalla / Operario de embombe y rolado). Organigrama tiene la vista "Áreas" (por defecto) con esa jerarquía; "Árbol" sigue siendo a quién reporta cada cargo. Costeo toma la mano de obra de los cargos, así que ve los puestos.
- **Centro de costo de la nómina (2026-11-13)**: `empleados.centro_costo` y `nomina_liquidaciones.centro_costo` ∈ construequipos / fundicionHierro / aluminio / administracion (mismos ids que items_of y profiles.centro_costo_of de las OF; en Finanzas › EEFF Hierro es 'hierro', mapear al cruzar la mano de obra). Ojo: items.centro_costo y movimientos.centro_costo son otra cosa (texto libre por área de inventario). Se pide al crear el colaborador y en la ficha (Laboral). La liquidación copia el de la ficha al crearse y se puede cambiar en la liquidación; las liquidaciones viejas sin centro toman el de la ficha al mostrarse. La quincena tiene "Por centro de costo" (clic filtra) y el Excel trae las hojas "Centro de costo" y "Detalle por centro". Una persona va a un solo centro (no se reparte por porcentaje).
- **Migraciones re-ejecutables**: Angie a veces vuelve a correr una migración ya aplicada. Todo `CREATE POLICY` va precedido de `DROP POLICY IF EXISTS` (y tablas/índices con `IF NOT EXISTS`, triggers con `DROP TRIGGER IF EXISTS`). Las de RRHH se ajustaron así el 2026-10-27 tras el error "policy desempeno_ciclos_rrhh_admin already exists".
- **El dominio `costeoequipos.netlify.app` apunta a esta app (inventario), NO a la app de costeo.** Verificar siempre a qué proyecto apunta un dominio antes de diagnosticar algo como bug.
- **Cada bodega tiene su propio renglón de catálogo (`items`) para el mismo nombre de producto** — no es un ítem global con stock por bodega, es un `id` de `items` distinto por bodega. Cualquier transferencia entre bodegas debe buscar el ítem de **destino** por nombre normalizado (`UPPER(TRIM(...))`, colapsando espacios), nunca reutilizar el `item_id` de origen. Ver el patrón `normaliza()` en `GestionProductos.jsx` (función "mecanizar") y ahora también en `TransferenciasPendientes.jsx`.
- **Trigger `fn_actualizar_stock` (vivo, verificado 2026-09-16):** `tipo='entrada'` usa `bodega_destino_id` para sumar stock; `tipo='salida'` usa `bodega_origen_id` para restar. Un movimiento `'salida'` **nunca** acredita `bodega_destino_id` aunque el campo esté lleno — es solo metadato descriptivo. Cualquier transferencia entre bodegas necesita DOS movimientos (una salida + una entrada), no uno solo.
- **`movimientos.tipo` (constraint real, verificado 2026-09-16):** solo permite `'entrada'` y `'salida'`. Los valores `'entrada_compra'`, `'ajuste_inventario'`, etc. del `schema.sql` no existen en producción.

## Correcciones aplicadas (16–21 sept 2026)

1. **Doble registro de entradas en Pedidos (PED-0066).** `confirmarRecibido()` en `ListaPedidos.jsx` no bloqueaba el botón "Recibido + Entrada" mientras procesaba — un doble toque insertaba movimientos duplicados. Se agregó estado `guardandoRecibido` que deshabilita el botón y muestra "Guardando…". Datos duplicados corregidos con movimientos `salida` de reversa (se prefirió esto sobre `DELETE` porque `movimientos` es append-only por diseño).

2. **Aprobación de transferencias no acreditaba stock a Mecanizados.** `aprobar()` en `TransferenciasPendientes.jsx` solo creaba un movimiento `'salida'` (que resta en Fundición) y nunca el `'entrada'` correspondiente en destino — el comentario del código decía "el stock se actualiza automáticamente... por bodega_destino_id", lo cual es falso según el trigger real. Corregido: ahora crea también la entrada, buscando el `item_id` correcto en el catálogo de la bodega destino por nombre (nunca reutilizando el `item_id` de origen — ver gotcha de arriba).

3. **36 productos con stock "invisible" por el mismo motivo.** La función vieja de transferencia directa (commit `f73dd75`, reemplazada el 14-sep por el flujo de aprobación) tenía el mismo bug: acreditaba la entrada bajo el `item_id` de origen en vez del de destino. Se corrigieron 28 de 36 casos moviendo el stock al `item_id` correcto (ver commit correspondiente / historial de movimientos `COR-SAL-*` / `COR-ENT-*`). **Pendiente:** 8 productos ("Corona 1/2 Bulto", "Corona 1 Bulto", "Corona 1 Bulto Litemix", "Corona 1/2 Bulto Litemix", "Corona 2 Bultos", "Corona 1 1/2 Bulto", "Plancha Rana Convencional", "Plancha Rana Zanjera") no tienen renglón de catálogo en la bodega `7f0e4d7e-8c85-40d3-84c5-7857e26f624a` ("Producción y Ensamble") — 86 unidades sin reubicar hasta que Angie cree esos ítems o confirme a cuál renglón existente deberían mapear.

4. **`pedidos_estado_check` no permitía `'cerrado'`.** Nadie podía cerrar pedidos (no era un tema de permisos de un usuario puntual). Se agregó `'cerrado'` al CHECK constraint.

5. **Módulo "Calidad" ausente en la barra inferior móvil de Jefe Fundición y Jefe Mecanizados.** Ya estaba en el sidebar de escritorio y en el menú hamburguesa móvil, pero no en la barra de accesos rápidos curada (`MOBILE_JEFE_FUNDICION` / `MOBILE_JEFE_MECANIZADOS` en `Layout.jsx`). Agregado como sexto botón en ambas.

6. **Almacenista no podía cancelar pedidos en tránsito o recibidos.** El botón de "cerrar pedido" (con los 3 motivos: ya no se necesita / proveedor no lo tiene / cambio de proveedor — que es exactamente el concepto de "cancelar" para el negocio) solo estaba habilitado para `esAdmin || esLogistica`, y además se ocultaba para pedidos en estado `recibido`. Corregido en `ListaPedidos.jsx`: se agregó `esAlmacenista` al permiso `puedeCerrar`, y se quitó la exclusión del estado `recibido` (solo se excluye `cerrado`, que ya no se puede volver a cancelar). Se renombró la UI de "Cerrar" a "Cancelar" en el modal y el botón para que coincida con el modelo mental del usuario (mismo estado `cerrado` en BD, no requirió cambios de constraint).

## Módulo: Paquetes de Mecanizados (kits de piezas para ensamble)

Agregado el 21-sept-2026. Antes, el jefe de Mecanizados (William) tenía que seleccionar pieza por pieza
cada vez que Ensamble solicitaba las piezas de una máquina para armarla — aunque la salida ya soportaba
varias líneas en una sola transacción, elegir cada pieza a mano era lento y repetitivo.

- **Tablas nuevas** (mismo patrón ya usado en `maquinas_fundicion` / `bom_maquina_piezas`, ver `GestionBOM.jsx`):
  `paquetes` (cabecera: nombre, descripcion, activo) y `paquete_items` (hija: paquete_id, item_id, cantidad).
  RLS: cualquier autenticado puede leer (`SELECT`); solo `ADMIN` puede crear/editar/eliminar. Migración en
  `supabase/migraciones/2026-09-21_paquetes.sql` (hay que correrla manualmente en el SQL Editor de Supabase —
  igual que toda DDL, no se puede aplicar con la anon key).
- **Módulo de gestión** (`src/components/mecanizados/GestionPaquetes.jsx`, ruta `/mecanizados/paquetes`,
  solo visible en el nav de ADMIN — decisión explícita de Angie: solo admin crea/edita paquetes, William
  solo los usa). Permite crear paquetes, renombrarlos, agregarles descripción, agregar/quitar piezas de su
  catálogo (con cantidad "por 1 unidad" del paquete), activar/desactivar y eliminar.
- **Uso en la salida** (`RegistrarMovimientoAlmacenista.jsx`, dentro de `tipoSalidaMec === 'produccion'`,
  o sea la salida interna hacia Almacén/Soldadura y Armado — **no** aplica a la salida "Cliente externo"
  por decisión de Angie): selector de paquete + un "multiplicador" (cuántas máquinas va a armar). Al
  aplicar, reemplaza las líneas de "Productos" con las piezas del paquete × el multiplicador; William
  puede seguir ajustando cantidades o agregando piezas sueltas después. La validación de stock por pieza
  ya existente en `handleSalida()` corre igual sobre estas líneas, sin cambios.
- **Pendiente:** Angie/William deben crear los paquetes reales (ej. "Mezcladora 1 Bulto") desde el módulo
  antes de que el selector muestre algo — hoy no hay ninguno cargado.
- **Ronda de ajustes de UI (21-sept-2026), reportados por Angie con capturas:** buscador de piezas en
  `GestionPaquetes.jsx` demasiado pequeño y sin filtrar por categoría "Producto mecanizado" (se agregó el
  filtro `categoria_id` que faltaba); espaciado general muy apretado (se agrandó todo el módulo: contenedor,
  paddings, tipografía); la lista desplegable del buscador se cortaba dentro de la tarjeta expandida del
  paquete (la tarjeta tenía `overflow-hidden`, que recortaba el dropdown con `position: absolute` — se quitó
  y se reaplicaron las esquinas redondeadas manualmente en header/footer de la tarjeta en vez de en el
  contenedor). **Gotcha para el futuro:** cualquier dropdown/menú flotante dentro de una tarjeta con esquinas
  redondeadas necesita que la tarjeta NO use `overflow-hidden`, o el menú se corta.
- **Fila del selector de paquete en la salida muy angosta (botón cortado) + título de firma duplicado
  (21-sept-2026).** En `RegistrarMovimientoAlmacenista.jsx`: se reestructuró el selector de paquete en dos
  filas (select ancho completo, luego multiplicador + botón) en vez de una sola fila apretada. El título
  duplicado era porque `FirmaCanvas.jsx` ya renderiza su propio `<label>` internamente (con default "Firma
  del responsable" si no se le pasa `label`), y el sitio de uso además envolvía el componente en OTRO
  `<label>` manual — se quitó el envoltorio manual y se pasa el texto directo por la prop `label`.
  **Gotcha:** antes de envolver `<FirmaCanvas>` en un `<label>` propio, revisar si ya acepta la prop `label`.
- **Al seleccionar un paquete no se agregaban los productos a la salida (21-sept-2026).** `aplicarPaquete()`
  dependía 100% del embed anidado de PostgREST `paquete_items(...,items(nombre, unidad_medida))` para
  resolver cada pieza; si ese embed venía vacío (posible por caché de esquema de PostgREST tras una
  migración reciente, u otros casos borde), la función fallaba en silencio sin poblar `sProductos`. Se
  corrigió resolviendo nombre/unidad de cada pieza contra el catálogo `items` de la bodega ya cargado en el
  estado del componente (la misma fuente que usa el buscador de "Productos" de más abajo, que sí funciona
  siempre), usando el embed solo como respaldo. **Gotcha:** no confiar únicamente en un embed anidado de
  PostgREST recién creado para datos críticos de UI — preferir resolver contra un catálogo local ya probado
  cuando esté disponible.

## Módulo: Analítica — actualización en tiempo real (22-sept-2026)

Angie reportó que el Dashboard ejecutivo (`/analitica`, `DashboardEjecutivo.jsx`) no se actualizaba en
tiempo real — cargaba los datos solo al entrar o cambiar filtros, sin botón de refrescar ni actualización
automática. La Analítica de Fundición (`AnaliticaFundicion.jsx`, `/analitica/fundicion`) ya tenía botón de
refrescar manual, así que se usó como referencia de patrón.

- **Solución elegida (Angie, entre opciones):** botón de refrescar manual + actualización automática
  periódica cada 2 minutos mientras la pantalla está abierta.
- Se agregó `useEffect` con `setInterval(() => cargarTodo(), 120000)` (limpia el interval al desmontar),
  botón con ícono `RefreshCw` (gira mientras `cargando === true`) junto al título, y texto "Actualizado
  HH:MM:SS" con la hora de la última carga (`ultimaActualizacion`, se actualiza al final de `cargarTodo()`).
- No se tocó `AnaliticaFundicion.jsx` (ya tenía su propio botón de refrescar, no necesitaba cambios).
- **Pendiente:** Angie va a revisar contenido/exactitud de las 4 pestañas de Analítica (Financiero,
  Rotación, Pedidos & Lead Time, Alertas) y avisar si encuentra algo más para corregir — no se auditó el
  contenido de las pestañas en esta ronda, solo el mecanismo de actualización.

## Módulo: Pedidos — "cerrar" pasó a ser "completar" (23-sept-2026)

Antes, un pedido se podía "cerrar" (solo admin/logística/almacenista) con un motivo (ya no se necesita /
proveedor no lo tiene / cambio de proveedor). Angie pidió quitar el concepto de "cerrar/cancelar" y
dejarlo como **"marcar como completado"**: el pedido queda completado aunque haya llegado incompleto,
porque ya no va a llegar más — y quien creó el pedido (el solicitante) también debe poder completarlo, no
solo admin/logística/almacenista.

- **Sin migración de BD:** se decidió NO tocar la columna `estado` ni el CHECK constraint — el valor en
  base de datos sigue siendo `'cerrado'` (evita otra migración manual en Supabase). Solo se relabeleó en
  toda la UI: el badge, el filtro, el historial y el texto del motivo ahora dicen "Completado" en vez de
  "Cerrado"/"Cancelar". Así los pedidos que ya estaban cerrados aparecen automáticamente como completados,
  sin correr nada en el SQL Editor.
- `ListaPedidos.jsx`: `puedeCerrar` ahora también es `true` cuando `p.solicitante_id === perfil?.id` (antes
  solo admin/logística/almacenista). Modal renombrado a "Completar pedido", con el mismo motivo obligatorio
  (queda igual en el historial).
- `DashboardEjecutivo.jsx` (Analítica → pestaña Pedidos & Lead Time): se agregó `'cerrado'` a las
  exclusiones de `pedidosPendientes` / `pedidosRetrasados` (antes solo excluían `'recibido'` y
  `'anulado'`) — un pedido completado ya no cuenta como pendiente ni dispara la alerta de "atrasado" o de
  "comprometido sin stock". Este era un bug de arrastre: con el botón anterior ya existía la posibilidad
  de cerrar un pedido y quedaba contando como pendiente en el dashboard.
- **Gotcha de la sesión:** `npm run build` falló con `EPERM: operation not permitted, unlink ... dist/...`
  porque el borrado de archivos en la carpeta conectada del Mac de Angie no estaba habilitado para esta
  sesión. Se resolvió pidiendo permiso de borrado (una sola vez por sesión) antes de reintentar el build.
- **Ajuste del filtro (23-sept-2026):** Angie hizo notar que "Recibido" y "Completado" no son lo mismo
  (Recibido = sí llegó y generó movimiento de inventario real, con fecha_recibido para el lead time;
  Completado = se cerró el pedido a mano por algún motivo, sin importar si llegó todo). Se probó primero
  con "Completado" agrupando ambos (`estado IN ('recibido', 'cerrado')`) pero dejando "Recibido" como
  pestaña aparte también — Angie prefirió, en una segunda vuelta, **un solo embudo sin pestaña "Recibido"
  aparte**: se quitó `'recibido'` del arreglo de pestañas de filtro (queda `['todos', 'pendiente',
  'en_transito', 'parcialmente_recibido', 'cerrado']`), y toda la distinción vive en la tarjeta:
  - Pastilla de estado: verde "Recibido" vs. gris "Completado".
  - Si un pedido se cerró (completó) sin que llegara todo lo pedido, se agrega un aviso naranja
    "⚠️ Llegó incompleto" junto a la pastilla, y el desglose por producto (que antes solo se mostraba en
    `parcialmente_recibido`/`recibido`) ahora también se muestra para `cerrado`, con "⏳ No llegó: X" en
    vez de "Pendiente" cuando el pedido ya está cerrado (no va a llegar más).
  - El motivo de cierre (`p.motivo_cierre`) se sigue mostrando siempre debajo, sin cambios.
- **Búsqueda en Pedidos (23-sept-2026):** se agregó una caja de búsqueda (número de pedido, producto o
  quién hizo el pedido, todo en un solo campo de texto — normaliza tildes/mayúsculas) más un rango de
  fechas (Desde/Hasta sobre `created_at`), combinable con el filtro de estado existente. Todo es
  client-side sobre los pedidos ya cargados (no pega a la BD de nuevo por cada tecla) — si el número de
  pedidos crece mucho en el futuro y se siente lento, ahí sí valdría la pena mover la búsqueda de texto a
  una query a Supabase.
- **Alerta para vigilar (no bloqueante):** `git fsck` reportó objetos corruptos (`bad sha1 file`) y entradas
  de reflog inválidas en el repo local de Angie — probablemente porque la carpeta del repo vive dentro de
  `Documents`, que suele sincronizarse con iCloud Drive, y un archivo de `.git/objects` se vio afectado por
  esa sincronización. El HEAD de `main` y el historial reciente están intactos (el push de este commit
  funcionó bien), así que no se tocó nada por ahora — pero si en el futuro `git log`/`git push` empiezan a
  fallar, este es el sospechoso número uno. Posible solución si pasa: mover el repo fuera de una carpeta
  sincronizada por iCloud, o excluirlo de "Optimizar almacenamiento de Mac" en Ajustes > Apple ID > iCloud.

## Módulo: Inventario en fecha — filtro por bodega (26-sept-2026)

Angie pidió poder correr el "Inventario en fecha" (`CorteInventario.jsx`, en Reportes) para una bodega
puntual, o dejarlo en todas ("TODO") como funcionaba hasta ahora.

- Se agregó un selector "Bodega" junto a la fecha de corte (mismo patrón que ya usa `InformeKardex.jsx`):
  `''` = todas las bodegas, o el id de una bodega puntual. Se aplica como `.eq('bodega_id', bodegaId)` en
  la consulta de `items` — la consulta de `movimientos` no necesita tocarse porque los deltas solo se
  aplican sobre los items ya cargados (filtrados o no).
- El banner de resultado y la hoja "Resumen" del Excel ahora dicen qué bodega se filtró (o "Todas las
  bodegas"), y el nombre del archivo descargado incluye la bodega cuando se filtró una puntual
  (`corte_inventario_<fecha>_<bodega>.xlsx`) — mismo patrón de sufijo que ya usa `exportarKardex`.

## Módulo: Inventario Físico — título para reconocer cada conteo (26-sept-2026)

Angie pidió poder ponerle un "título" a cada Inventario Físico para reconocer más fácil de qué se trata
cada uno al verlos en la lista (antes solo se veían Número/Fecha/Estado/Creado por, sin ninguna pista de
contexto).

- **Sin migración de BD:** la tabla `inventarios_fisicos` ya tenía un campo `notas` que en la práctica se
  usaba exactamente para esto (el placeholder ya decía "Ej: Conteo fin de mes agosto"), solo que no se
  mostraba en ningún lado visible de la lista. Se decidió NO agregar una columna nueva — se reetiquetó el
  campo existente como "Título" en el editor (con una ayuda: "Para reconocer este inventario más fácil en
  la lista") y se agregó una columna "Título" en la tabla de la lista, en el título del modal de detalle, y
  como subtítulo mientras se está llenando el conteo. Nada cambia en el esquema ni en cómo se guarda.
  `notas` solo se usa en este archivo (`InventarioFisico.jsx`), así que renombrar su rol en la UI no afecta
  nada más.

## Módulo: Inventario Físico — filtro por categoría (26-sept-2026)

Angie pidió poder escoger por categoría al hacer el Inventario Físico, además del filtro de bodega y la
búsqueda que ya existían.

- Se agregó un selector "Todas las categorías" junto al de bodega, en la barra de filtros del editor de
  conteo. Las categorías se derivan de los items ya cargados (`categoria_nombre`, que ya venía en la
  consulta) — no hace falta ir de nuevo a la BD ni tocar el esquema.
- Se combina con los filtros existentes (bodega, búsqueda de producto, "solo diferencias"): todos aplican
  a la vez sobre la misma lista.

## Módulo: Inventario Físico — título editable en la lista (28-sept-2026)

Angie pidió corregir el título de un inventario ya confirmado (INV-FIS-0027) para agregarle "SEP" y saber
que era de septiembre. Al revisar, ningún inventario confirmado se podía renombrar — `continuarBorrador()`
solo aplica a `estado === 'borrador'`, así que un título ya confirmado quedaba fijo para siempre salvo que
alguien editara la base de datos directamente.

- Se agregó `TituloEditable` (mismo patrón `InlineEdit` que ya usan `GestionBOM.jsx`/`GestionPaquetes.jsx`):
  click en el título (o el lápiz) en la lista, edita, Enter o ✓ para guardar — funciona para borradores y
  para confirmados por igual, sin necesidad de abrir el inventario.
- `renombrarTitulo()` hace un `update` directo sobre `inventarios_fisicos.notas` (sigue siendo el mismo
  campo reetiquetado como "Título", ver entrada del 26-sept) y actualiza el estado local sin recargar toda
  la lista.
- Se agregó el bloque de mensajes de error/éxito (`{msg && <Alerta .../>}`) también en la vista de lista —
  antes solo se mostraba dentro del editor, así que un error al renombrar no se hubiera visto en ningún
  lado.

## Pendiente de otras sesiones

- Modelo de avance diario para órdenes de moldeo (tabla `ordenes_moldeo_avances`: `orden_pieza_id`, `fecha`, `cantidad_moldeada`, `usuario_id`; cierre manual, no automático).
- Límite de precache del PWA subido a 5 MB (16-sept) porque el build fallaba silenciosamente al desplegar — vigilar si el bundle sigue creciendo (ya va en ~2.3 MB precacheados).

## BUG encontrado y corregido: stock nunca se actualizaba con mecanizado ni con correcciones de inventario físico (28-sept-2026)

Angie reportó que el valor de bodega Mecanizados → categoría "Producto Mecanizado" en la página de inicio
le parecía muy alto. Al revisar el trigger `fn_actualizar_stock` (el que recalcula `stock.cantidad_actual`
cada vez que se inserta un movimiento), se encontró que su `IF/ELSIF` solo reconocía los tipos
`entrada_compra`, `devolucion`, `salida_produccion`, `salida_venta`, `traslado` y `ajuste_inventario`.

Se revisó todo `src/` buscando quién más inserta movimientos (no solo el punto que ella señaló) y aparecieron
dos flujos completos que usan tipos genéricos `'entrada'` / `'salida'`, que el trigger **no reconocía en
absoluto**:

- `RegistroMecanizado.jsx` — al registrar un mecanizado (consumir materia prima → crear producto mecanizado).
- `InventarioFisico.jsx`, en `aplicarCorrecciones()` — el botón "aplicar correcciones" de un inventario físico
  contado (el código incluso tenía un comentario diciendo que el trigger actualizaba el stock automáticamente,
  lo cual no era cierto para estos dos tipos).

Efecto: el movimiento sí quedaba guardado en el historial (por eso nunca hubo un error visible), pero
`stock.cantidad_actual` **nunca se tocaba**. Cada inventario físico "corregido" y cada mecanizado registrado
desde que existen estas dos funcionalidades no tuvo ningún efecto real sobre el stock del sistema — lo que
explica que el valor mostrado en el dashboard quede desfasado (generalmente por encima) de lo que hay
físicamente, porque las correcciones que debían bajarlo nunca se aplicaron.

- **Fix**: se agregó `'entrada'` y `'salida'` a las dos primeras ramas del trigger (no hace falta tocar el
  código de React — ambos archivos ya arman correctamente `bodega_origen_id`/`bodega_destino_id`). El SQL
  completo quedó en `supabase/migraciones/2026-09-28_fix_trigger_stock_entrada_salida.sql` y `schema.sql`
  ya refleja la función corregida — falta que Angie lo corra manualmente en el SQL Editor de Supabase (DDL,
  no se aplica solo).
- **Pendiente después de correr el fix**: el stock actual de las bodegas/categorías afectadas (sobre todo
  Mecanizados → Producto Mecanizado, y las materias primas mecanizables) sigue desfasado de la realidad,
  porque los ajustes históricos nunca pegaron. La forma más segura de resincronizar es hacer un inventario
  físico nuevo de esas bodegas/categorías DESPUÉS de aplicar el fix — con el trigger corregido, "aplicar
  correcciones" sí va a mover el stock real y quedará al día. (Alternativa más agresiva y riesgosa: recalcular
  `stock` desde cero repitiendo todo el historial de `movimientos` — no se hizo por el riesgo de tocar datos
  de producción sin poder verlos en vivo desde esta sesión.)
- **Nota aparte, no corregida (no se está usando actualmente)**: el comentario de la rama `ajuste_inventario`
  dice "sobreescribe el stock directamente", pero el `DO UPDATE` en realidad SUMA `NEW.cantidad` al valor
  existente, no lo reemplaza. Hoy ningún flujo del código inserta ese tipo, así que es inofensivo, pero si en
  el futuro alguien lo usa asumiendo que "sobreescribe", va a duplicar cantidades — vale la pena revisarlo si
  se llega a usar ese tipo de movimiento.

## Alcance real del bug del trigger: casi TODA la app usa tipo 'entrada'/'salida' (28-sept-2026, continuación)

Al revisar más a fondo por qué "Inventario en fecha" y la página de inicio mostraban valores distintos
para Mecanizados el mismo día, se hizo un inventario completo de quién inserta en `movimientos` en toda
la app (`grep` de "from('movimientos').insert" en todo `src/`). Resultado: casi todos los módulos usan los
tipos genéricos `'entrada'`/`'salida'` — no solo Registro de mecanizado e Inventario Físico (ya corregidos
antes hoy):

- `pedidos/ListaPedidos.jsx` — entrada automática al marcar un pedido como recibido.
- `fundicion/RegistrarFundida.jsx` y `RecogidaFundida.jsx`.
- `transferencias/TransferenciasPendientes.jsx`.
- `movimientos/RegistrarMovimiento.jsx` y `RegistrarMovimientoAlmacenista.jsx` (registro manual de movimientos).
- `productos/GestionProductos.jsx` (su propio flujo de mecanizado).

Los únicos tipos "clasificados" del trigger original (`entrada_compra`, `devolucion`, `salida_produccion`,
`salida_venta`, `traslado`, `ajuste_inventario`) casi no se usan en la práctica — solo apareció
`salida_produccion` una vez, en `operario/Dashboard.jsx`.

**Implicación importante**: el bug del trigger (ver entrada anterior de hoy) no afectaba solo a
Mecanizados — afectaba prácticamente TODA la actualización de stock de la aplicación, en todas las
bodegas, desde que existen estos módulos. El `stock.cantidad_actual` de la mayoría de los productos
probablemente refleja solo lo que se cargó al crear el producto (`GestionProductos.jsx` sí escribe stock
directo al crear), y no los movimientos posteriores de ventas, compras, producción o transferencias. El
fix del trigger de hoy corrige esto hacia adelante para TODOS estos módulos (todos ya arman bien
`bodega_origen_id`/`bodega_destino_id`), pero el stock histórico de cada bodega sigue desfasado hasta que
se recuente físicamente — igual que se hizo hoy con Mecanizados.

**Recomendación**: priorizar inventarios físicos de recuento en las demás bodegas (empezando por las de
mayor valor o las que más movimiento tienen: pedidos, transferencias, fundición) para resincronizar el
stock real ahora que el trigger ya lo permite.

## Fix: "Inventario en fecha" (CorteInventario.jsx) daba un valor distinto al de la página de inicio (28-sept-2026)

Para la misma bodega (Mecanizados) y la misma fecha (hoy), "Inventario en fecha" mostraba $80.326.647 y la
página de inicio $74.060.747. Se encontraron dos bugs independientes en `calcular()`:

1. La consulta de `items` traía el stock como embed anidado `stock(cantidad_actual)` sin filtrar por
   bodega, y el código tomaba `item.stock?.[0]` (la primera fila del array, sin garantía de orden).
   **Corrección sobre la causa**: en este modelo de datos cada producto pertenece a una sola bodega
   (confirmado por Angie) — una transferencia mueve cantidad hacia OTRO item_id ya existente en la bodega
   destino, no reparte el mismo item_id entre dos bodegas (ver `TransferenciasPendientes.jsx`, que busca el
   item destino por nombre en `destino_bodega_id`). Así que "stock en dos bodegas para el mismo producto"
   no debería pasar en el flujo normal, y no fue la causa confirmada de la diferencia que vio Angie. Aun así
   se dejó la consulta filtrada explícitamente por `item_id` + `bodega_id` (igual al patrón que ya usa
   `InventarioFisico.jsx`, `stockMap` por `${item_id}_${bodega_id}`) en vez de confiar en el orden de un
   embed sin filtrar — más seguro ante cualquier fila huérfana o mal cargada, aunque no cambie el resultado
   en el caso normal.
2. El cálculo de "deltas" (para deshacer movimientos posteriores a la fecha de corte) solo trataba el tipo
   literal `'entrada'` como aumento; cualquier otro tipo, incluidos `'entrada_compra'` y `'devolucion'`, se
   restaba — quedaba al revés. Se listan explícitamente los tipos que aumentan/disminuyen stock, igual que
   en `fn_actualizar_stock`. `'traslado'` no se intenta reconstruir aquí (esta función no distingue
   bodega origen/destino por producto) — hoy ningún flujo lo usa, así que no aplica, pero queda anotado por
   si se llega a usar.

Con estos dos fixes, "Inventario en fecha" para hoy debería coincidir con la página de inicio (el corte a
hoy no debería deshacer ningún movimiento). Falta que Angie confirme el número después de que Netlify
despliegue este cambio.

## Nuevo módulo: Órdenes de compra (28-sept-2026)

Pedido de Angie: Efraín (Logística) necesita poder generar, desde un pedido, una o varias
órdenes de compra — porque el mismo pedido a veces se compra en distintos proveedores, y a
veces ni siquiera se genera orden (se va a comprar en persona al centro). Cada orden debe
poder descargarse en PDF.

Decisiones tomadas (todas confirmadas con Angie vía preguntas antes de construir):

- **Proveedores**: catálogo reutilizable (tabla `proveedores`), no texto libre. Se puede crear
  uno nuevo directamente desde el formulario de la orden.
- **Precio unitario**: se sugiere desde `items.precio_costo` pero Efraín lo puede editar línea
  por línea (el precio de compra real a un proveedor no siempre es el costo interno).
- **Cobertura visible en el pedido**: cada línea del pedido muestra cuánto ya está cubierto por
  alguna orden de compra y cuánto falta, para no volver a pedirlo por error.
- **División de cantidad**: SÍ soportado — un mismo producto del pedido puede repartirse en
  cantidades distintas entre varias órdenes/proveedores (ej. 50 unidades → 30 a un proveedor,
  20 a otro). Por eso cada línea de una orden de compra (`orden_compra_items`) referencia la
  línea original del pedido (`pedido_item_id`) y solo guarda la cantidad de ESA orden, no la
  cantidad total del pedido.

### Modelo de datos (migración `supabase/migraciones/2026-09-28_ordenes_compra.sql`, falta correrla)

- `proveedores` (nombre, nit, contacto, telefono, email, direccion, activo).
- `ordenes_compra` (numero OC-XXXX, pedido_id, proveedor_id, fecha, razon_social, ciudad,
  observaciones, anulada, usuario_id). `razon_social`/`ciudad` se eligen en el formulario cada
  vez (por defecto Feisen S.A.S. / Soacha) — el NIT es el mismo para ambas razones sociales
  (900.595.456-2, mismo ente jurídico desde el cambio de nombre) así que va fijo en el PDF.
- `orden_compra_items` (orden_compra_id, pedido_item_id, descripcion, unidad, cantidad,
  precio_unitario) — snapshot de la línea, no depende de que el pedido_item original no cambie.
- RLS: todos los autenticados leen; solo ADMIN y LOGISTICA administran (crear/editar/anular).

### UI

- `ModalGenerarOC.jsx` (dentro de `pedidos/`): se abre desde un ícono nuevo en la tarjeta del
  pedido (visible para ADMIN/LOGISTICA). Lista los productos del pedido con checkbox, cantidad
  editable (con validación de que no exceda lo pendiente de cubrir) y precio sugerido/editable;
  selector de proveedor o alta rápida de uno nuevo; selector de razón social/ciudad;
  observaciones. Al guardar, genera y descarga el PDF de una vez.
- `compras/OrdenesCompra.jsx`, ruta `/ordenes-compra` (ADMIN y LOGISTICA): lista todas las
  órdenes generadas, con búsqueda, re-descarga de PDF, y anular/reactivar (soft-delete —
  `anulada`, no se borra el registro).
- `utils/exportOrdenCompraPDF.js`: genera el PDF con jsPDF + jspdf-autotable (nueva dependencia,
  agregada a package.json), con los colores de marca (azul #064794, rojo #B4271D, nunca negro).
- `ListaPedidos.jsx`: cada línea del pedido ahora muestra "🧾 En orden de compra: X / Falta
  pedir: Y" cuando aplica, y debajo del pedido se listan las órdenes ya generadas para ese
  pedido con su propio botón de descarga.

### Pendiente / notas

- El campo suelto `pedidos.numero_oc` (texto libre, ya existía desde antes, se llenaba al
  marcar "en tránsito") se deja tal cual, sin migrar a este nuevo modelo — son cosas separadas;
  no se quitó porque no se pidió y no estorba.
- El bundle de la PWA subió de ~2.42 MB a ~3.23 MB de precache por las nuevas dependencias
  (jsPDF trae html2canvas y dompurify como sub-dependencias) — sigue bien debajo del límite de
  5 MB, pero vale la pena vigilarlo si se siguen agregando librerías pesadas.
- No se construyó una pantalla de administración de proveedores aparte (editar/desactivar un
  proveedor ya creado) — por ahora solo se crean desde el modal de generar orden. Si Angie o
  Efraín necesitan editarlos después, se puede agregar una pantalla simple tipo CRUD.

## Órdenes de compra: logo institucional + simplificación de razón social (28-sept-2026)

Ajustes pedidos por Angie tras la primera versión del módulo de órdenes de compra:

- **Logo**: Angie subió el manual de marca (PDF). Se extrajo el ícono del cubo "CF" del
  manual (página 1, versión a color) con `pdftoppm` + recorte por bounding box en Python, y
  se embebió como PNG en base64 directamente en `exportOrdenCompraPDF.js` (self-contained,
  no depende de un archivo en `public/`). El wordmark "FEISEN" se dibuja con texto nativo de
  jsPDF, letra por letra, en los colores de marca (F-E-I azul #064794, S-E-N rojo #B4271D) en
  vez de usar una imagen — más nítido a cualquier tamaño y coincide exacto con los hex que ya
  usa el resto de la app (los del manual son levemente distintos: #09407C/#B5241C — se usaron
  los de la app/preferencias de Angie por consistencia).
- **Razón social y ciudad fijas**: por pedido explícito de Angie, se quitó el selector de
  razón social/ciudad del formulario — ya no se pregunta, siempre queda "Feisen S.A.S." y
  "Soacha" en el PDF (el NIT es el mismo para ambas razones sociales así que no cambiaba de
  todas formas). Las columnas `razon_social`/`ciudad` se mantienen en la tabla por si en el
  futuro hace falta volver a variarlas, pero el formulario ya no las expone.
- **Número de orden más visible**: el N.° de OC ahora va en un recuadro azul sólido en la
  esquina superior derecha, con la fecha debajo — mucho más prominente que antes.
- Se agregó una franja roja de pie de página con NIT/ciudad y el número de orden repetido,
  para que el documento se vea como un formato institucional completo, no una lista simple.

## Logo horizontal oficial en la OC + bug de mecanizado con bodega nula (29-sept-2026)

**Logo de la OC**: Angie reportó que el ícono del cubo quedaba desalineado (aparecía debajo
del wordmark "FEISEN" en vez de al lado) y sugirió usar el logo horizontal que ya existe
armado en el manual de marca, en vez de dibujar el ícono y el texto por separado. Se extrajo
esa variante exacta ("PRINCIPAL HORIZONTAL SIN SLOGAN", a color, página 07 del manual) como
una sola imagen PNG (ícono + wordmark ya combinados, fondo transparente) y se reemplazó el
enfoque anterior (imagen del ícono + texto "FEISEN" dibujado letra por letra con jsPDF) por
un único `doc.addImage(...)` de esa imagen. Elimina de raíz cualquier bug de alineación entre
ícono y texto, y usa el logo tal como está diseñado en el manual (con sus colores impresos
originales, #09407C/#B5241C, en vez de los hex de la app — para un asset de marca oficial
como este tiene más sentido usarlo tal cual que reconstruirlo).

**Bug: `null value in column "bodega_id" of relation "stock"` al mecanizar**: William
(Jefe Mecanizados) reportó que al intentar mecanizar una pieza (chumacera mediana) la app le
tiraba ese error de Postgres y no dejaba guardar nada. Causa raíz: tanto
`RegistroMecanizado.jsx` como la opción de mecanizar dentro de `GestionProductos.jsx` arman
el movimiento `tipo: 'entrada'` (el producto ya mecanizado que entra a inventario) sin
asignarle `bodega_destino_id` — solo le ponían `bodega_origen_id`. El trigger
`fn_actualizar_stock` necesita `bodega_destino_id` para las entradas (ver el fix del
28-sept), así que al intentar insertar en `stock` con `bodega_id = NULL` Postgres rechaza el
insert por la restricción NOT NULL.

Este bug ya existía en el código desde antes, pero quedaba oculto porque el trigger viejo no
hacía nada con los movimientos `tipo: 'entrada'`/`'salida'` genéricos (ese fue justamente el
bug que se corrigió el 28-sept). Al arreglar el trigger para que sí actualizara el stock con
esos tipos, quedó expuesto este segundo bug independiente. Se revisaron TODOS los demás
archivos que insertan movimientos con tipo `'entrada'`/`'salida'` (`ListaPedidos.jsx`,
`RegistrarFundida.jsx`, `RecogidaFundida.jsx`, `InventarioFisico.jsx`,
`TransferenciasPendientes.jsx`, `RegistrarMovimiento.jsx`,
`RegistrarMovimientoAlmacenista.jsx`) y todos los demás sí asignan correctamente
`bodega_origen_id`/`bodega_destino_id` según el tipo — el bug estaba solo en los dos flujos
de mecanizado. Corregido agregando `bodega_destino_id: BODEGA_MECANIZADOS` a ambos.

## Bug: eliminar pedido fallaba si ya tenía una orden de compra generada (29-sept-2026)

Angie intentó borrar un pedido de prueba (PED-0105) y le salió
`update or delete on table "pedidos" violates foreign key constraint
"ordenes_compra_pedido_id_fkey"`. Causa: `eliminarPedido()` en
`ListaPedidos.jsx` desvincula `movimientos.pedido_id` antes de borrar,
pero nunca hacía lo mismo con `ordenes_compra.pedido_id` — si el
pedido ya tenía al menos una OC generada, Postgres rechazaba el borrado
por la llave foránea. Corregido agregando el mismo paso de
desvinculación (`ordenes_compra.pedido_id = null`) antes de borrar
`pedido_items` y el pedido — la OC en sí no se borra, solo pierde la
referencia al pedido eliminado, igual que ya pasaba con los
movimientos.

## Diagnóstico: "las OC no salen con el logo" tras el fix del logo horizontal (01-oct-2026)

Angie reportó que después del fix del logo horizontal (commit 50217e6) las
órdenes de compra generadas en producción no muestran el logo en absoluto.

Verificación hecha directamente contra el bundle JS que está sirviendo
Netlify en https://erpfeisen.netlify.app (sin tocar el código, por
navegador):
- El archivo `assets/index-*.js` servido en producción SÍ contiene la
  imagen del logo embebida en base64, con exactamente los mismos 52.908
  caracteres que el archivo fuente local — es decir, el deploy de
  50217e6/ab4d9d6 está vivo y el dato no llegó corrupto ni truncado.
- Decodificando ese base64 en el navegador y cargándolo como `<img>`, la
  imagen es válida y mide 900×196px — exactamente el logo esperado.
- Conclusión: el problema NO está en el código ni en el deploy. Es casi
  seguro un tema de caché de la PWA (service worker de Workbox,
  `registerType: 'autoUpdate'`) sirviendo todavía la versión anterior del
  bundle en los dispositivos de los usuarios. `autoUpdate` no siempre
  refresca al instante — a veces necesita que el usuario cierre y vuelva
  a abrir la app, o un refresh forzado, para tomar la versión nueva.
- Pendiente: confirmar con Angie después de que ella (o quien generó la
  OC) haga un refresh forzado / cierre y reabra la PWA, que el logo ya
  aparece. Si after eso persiste, revisar entonces si hay algo específico
  del entorno de `jsPDF.addImage()` en el navegador real que no se
  reproduce en Node.

### Hallazgo aparte (no corregido, solo detectado): pantalla de login
Mientras se revisaba el bundle en vivo se confirmó que la pantalla de
login todavía muestra "Construequipos Franco S.A.S." como subtítulo (un
único ícono de letra "F", no el logo real) en vez de "Feisen S.A.S." —
es texto plano hardcodeado, un solo lugar en el código. No se tocó
porque no fue lo que Angie pidió corregir; queda anotado para cuando se
revise el login o se le pregunte si quiere actualizarlo.

## Diagnóstico: stock inconsistente de POLEA 4 X 2B en Mecanizados (01-oct-2026)

Angie reportó que el stock de "POLEA 4 X 2B" en bodega Mecanizados no
cuadraba: contó físicamente 23 el 28-sept, y sabiendo de 2 salidas
posteriores (6 y 7 unidades), esperaba 10 — pero el sistema mostraba 38.

Diagnóstico (sin acceso a los datos en vivo, por revisión de código +
aritmética): la causa casi segura es el bug del trigger `fn_actualizar_stock`
que arregamos ese mismo 28-sept (migración
`2026-09-28_fix_trigger_stock_entrada_salida.sql`). Antes de ese fix, un
movimiento de tipo genérico 'entrada'/'salida' (que es justo lo que genera
"Aplicar correcciones" de Inventario Físico) se guardaba bien en
`movimientos` — aparece en el historial — pero el trigger NUNCA actualizaba
la tabla `stock`, en silencio, sin ningún error visible.

La aritmética cuadra exactamente con esa teoría: si el stock antes de la
corrección del 28 era 51, y las 2 salidas posteriores (6+7=13) sí se
aplicaron bien (después del fix), 51-13=38 — el número que ve Angie. Y si
la corrección de ese día (bajar de 51 a 23, un ajuste de -28) se hubiera
aplicado correctamente, hoy sería 23-13=10, lo que ella esperaba. La
diferencia entre lo que ve (38) y lo que espera (10) es exactamente 28 —
el tamaño del ajuste que se perdió en silencio.

Esto probablemente afecta a TODOS los productos de esa misma sesión de
inventario físico de septiembre si se aplicaron antes de las 10:21am del
28-sept (hora Bogotá, cuando se corrió el fix del trigger) — vale la pena
revisar si hay otros productos de ese mismo inventario con el mismo
síntoma.

### Fix aplicado (commit 97d4474)
`aplicarCorrecciones()` en InventarioFisico.jsx no revisaba el error del
INSERT de cada movimiento de ajuste — si fallaba, se ignoraba en silencio
y el inventario se marcaba "confirmado" y "ajustado" igual, mostrando
"✅ todo bien" al usuario sin que fuera cierto. Ahora se captura el error
por producto, solo se marca `ajustado=true` el que sí se corrigió de
verdad, y si algo falla se avisa explícitamente con el detalle de qué
productos quedaron pendientes de corregir a mano. Esto no arregla el daño
histórico del bug del trigger (ya no pasará de nuevo, pero el stock viejo
sigue mal) — para corregir productos ya afectados hay que volver a hacer
un inventario físico puntual de esos productos (ahora sí va a aplicar bien
porque el trigger ya está arreglado).

Pendiente: Angie necesita hacer un recuento físico puntual de POLEA 4 X 2B
(y revisar si hay más productos de esa sesión de septiembre con el mismo
problema) para corregir el stock real en el sistema.

## Script de reconciliación de stock para INV-FIS-0029 (01-oct-2026)

Angie pidió que la corrección de stock por el bug del trigger (ver sección
de arriba) se hiciera de una sola vez para TODO lo que ingresó en el
inventario físico "INV-FIS-0029" (Mecanizados/Fundición, sept-2026), no
producto por producto con "Registrar Movimiento".

Se agregó `supabase/migraciones/2026-10-01_reconciliar_stock_inv_fis_0029.sql`.
No recalcula deltas a mano: para cada producto+bodega que esté en
`inventario_fisico_items` de ese inventario (exactamente lo que ella contó e
ingresó), recalcula el stock correcto sumando/restando el histórico
COMPLETO de `movimientos` (que nunca se borra) con la misma lógica que ya
usa el trigger `fn_actualizar_stock` hoy. Primero un SELECT de vista previa
(no cambia nada), y si los números cuadran, un UPDATE que solo toca las
filas con diferencia real.

No lo pude ejecutar yo — necesita una sesión autenticada contra Supabase
(RLS exige `auth.uid()`, y no entro con credenciales a producción). Hay
que correrlo manualmente en el SQL Editor del panel de Supabase del
proyecto (mismo patrón que la migración del trigger del 28-sept, que
también se corrió a mano ahí).

Simplificación a tener en cuenta: el recálculo suma todo el histórico y
aplica el piso en cero (GREATEST 0) solo al total final, no paso a paso
como lo hace el trigger en vivo. Para el 99% de los casos da exactamente
igual; solo podría diferir si el stock real de algún producto llegó a cero
y se "clampeó" en algún punto intermedio de su historia — caso raro, pero
queda anotado por transparencia.

## Reconciliación de INV-FIS-0026 (piezas mecanizadas) (01-oct-2026)

Las piezas ya mecanizadas (ej. "POLEA 4 X 2B - MECANIZADO") se cuentan en
un inventario físico aparte del de materia prima — INV-FIS-0026, no
INV-FIS-0029. Se agregó
`supabase/migraciones/2026-10-01_reconciliar_stock_inv_fis_0026.sql`, igual
al de INV-FIS-0029 pero apuntando a ese número de inventario.

Nota sobre el resultado de INV-FIS-0029: al correr el PASO 1 de ese script,
todos los productos (incluyendo POLEA 4 X 2B, materia prima) dieron
diferencia 0.000 — es decir, el stock actual YA coincide con el recálculo
completo del historial de movimientos. Posibles explicaciones: (a) Angie ya
había aplicado la corrección manual sugerida antes de correr el script, o
(b) el problema real estaba más acotado de lo que parecía al principio.
Pendiente confirmar con ella si alcanzó a correr también el PASO 2 (el
UPDATE) de ese script o si no hizo falta.

## INV-FIS-0026 reconciliado (01-oct-2026)

Angie corrió el PASO 2 del script de INV-FIS-0026 — quedaron corregidos 64
productos en la bodega Mecanizados (bodega_id 03a709ac-0bee-457a-80a1-0a1603218d34),
cada uno con su stock recalculado desde el historial completo de
movimientos. Pendiente de que ella confirme visualmente en la app que al
menos "POLEA 4 X 2B - MECANIZADO" quedó con un número que tiene sentido.

INV-FIS-0029 no necesitó corrección — el PASO 1 de ese script ya había
mostrado diferencia 0 en todos sus productos (incluida POLEA 4 X 2B cruda),
así que no se corrió el PASO 2 ahí.

## Corrección de enfoque en los scripts de reconciliación (01-oct-2026)

Angie señaló un error conceptual en los scripts anteriores
(2026-10-01_reconciliar_stock_inv_fis_0026.sql y ...0029.sql): sumaban TODO
el historial de movimientos desde el principio de los tiempos para
"demostrar" el valor correcto. Eso está mal — un inventario físico es un
punto de control confiable: lo que se contó ese día es la verdad a partir
de ahí, sin importar si el historial de antes replica exactamente ese
número (puede haber drift de otras causas, no solo el bug del trigger).
Reconstruir desde cero todo el historial corre el riesgo de pisar el
conteo físico real con un número inventado a partir de movimientos previos
que pueden estar mal por otras razones.

Se agregó `2026-10-01_verificar_stock_desde_inventario_fisico.sql` con la
fórmula correcta: `stock_correcto = cantidad_fisica (lo contado ese día) +
entradas desde esa fecha − salidas desde esa fecha`, excluyendo el propio
movimiento de ajuste de ese inventario (se identifica por
`referencia = numero_del_inventario`) para no contarlo dos veces.

Pendiente: Angie va a correr este script (de solo lectura) para
INV-FIS-0026 (donde YA se aplicó un UPDATE con el método viejo, hay que
confirmar si con el método correcto da lo mismo o si hace falta ajustar
algo) y también para INV-FIS-0029 (donde no se aplicó nada, solo para
confirmar que con el método bueno también da diferencia 0).

## 2026-10-01 — Corrección del método de reconciliación de stock (checkpoint, no replay completo)

**Error cometido y corregido**: los scripts `2026-10-01_reconciliar_stock_inv_fis_0029.sql` y
`2026-10-01_reconciliar_stock_inv_fis_0026.sql` recalculaban el stock sumando/restando
TODO el historial de movimientos desde el principio de los tiempos, ignorando la fecha
del inventario físico. Esto es conceptualmente incorrecto: un inventario físico es un
punto de control confiable — lo que se contó ese día ES la verdad a partir de ahí, no
hay que "demostrarlo" reconstruyendo todo el pasado (que puede tener su propio desfase
por causas no relacionadas al bug del trigger).

Angie detectó el error: "recuerda que el inventario fisico modifica el stock actual así
hayan movimientos antes, no afectarían el stock actual, porque hay que contar a partir
del stock que modificó el inventario físico."

**Fórmula correcta** (implementada en `2026-10-01_verificar_stock_desde_inventario_fisico.sql`
y aplicada en `2026-10-01_corregir_stock_inv_fis_0026_checkpoint.sql`):

```
stock_correcto = cantidad_fisica (el conteo, tal cual se registró)
                + entradas DESDE la fecha del inventario
                − salidas   DESDE la fecha del inventario
                + ajustes   DESDE la fecha del inventario
```

excluyendo de esas sumas los movimientos cuyo `referencia` = el número del propio
inventario (son las correcciones que generó ese mismo conteo — ya están incluidas en
`cantidad_fisica`, sumarlas aparte sería contarlas dos veces).

**Impacto**: el UPDATE de `...reconciliar_stock_inv_fis_0026.sql` (64 filas) quedó
confirmado como incorrecto para la mayoría de los productos "-MECANIZADO" — la mayoría
demasiado bajos, algunos demasiado altos. Validado con POLEA 4 X 2B - MECANIZADO:
contado 36, método correcto da 19 (coincide con el cálculo manual hecho con Angie),
el método anterior lo había dejado en 8.

**Corregido con**: `2026-10-01_corregir_stock_inv_fis_0026_checkpoint.sql` — un solo
UPDATE con la fórmula de checkpoint, pendiente de que Angie lo corra en Supabase.

**Pendiente**: re-verificar INV-FIS-0029 con el método correcto (el método anterior
había mostrado diferencia 0 para todos sus productos bajo el método viejo —
aún no confirmado bajo el método correcto; no se llegó a aplicar ningún UPDATE
para -0029, así que no hay nada que deshacer ahí, solo confirmar).

**Lección para futuras reconciliaciones de stock**: siempre anclar en el conteo físico
más reciente de cada producto/bodega como punto de partida, nunca reconstruir sumando
el historial completo desde el inicio.

## 2026-10-01 — Corrección aplicada y confirmada: INV-FIS-0026

Angie corrió `2026-10-01_corregir_stock_inv_fis_0026_checkpoint.sql` en Supabase.
RETURNING confirmó 67 filas corregidas con el método de checkpoint (cantidad_fisica +
movimientos desde la fecha del inventario). Stock de las piezas "-MECANIZADO" queda
ahora correcto. Ejemplo validado antes de aplicar: POLEA 4 X 2B - MECANIZADO quedó en 19
(el método viejo lo había dejado en 8).

Pendiente: correr `2026-10-01_verificar_stock_inv_fis_0029_checkpoint.sql` (solo lectura)
para confirmar que INV-FIS-0029 no necesita corrección bajo este mismo método correcto
(el método viejo había mostrado diferencia 0 para todos sus productos, pero nunca se
confirmó con la fórmula de checkpoint).

## 2026-10-01 — INV-FIS-0029 verificado con método correcto: solo 1 diferencia real

Se corrió `2026-10-01_verificar_stock_inv_fis_0029_checkpoint.sql` (solo lectura). De
~115 productos del inventario, 114 ya cuadraban (diferencia 0). Solo uno tenía
diferencia real: POLEA ARRASTRE PLUMA LITEMIX (contado: 25, sistema: 55, correcto: 25
→ sistema tenía 30 de más). Se generó `2026-10-01_corregir_stock_inv_fis_0029_checkpoint.sql`
para corregirlo — pendiente de que Angie lo corra.

Con esto, los dos inventarios físicos (INV-FIS-0026 y INV-FIS-0029) quedan reconciliados
bajo el método correcto (checkpoint), cerrando el tema de la reconciliación de stock.

## 2026-10-01 — Cierre: ambos inventarios físicos reconciliados correctamente

Angie corrió el UPDATE para INV-FIS-0029: 1 fila corregida (POLEA ARRASTRE PLUMA
LITEMIX → 25, confirmado por RETURNING). Con esto, INV-FIS-0026 (67 filas) e
INV-FIS-0029 (1 fila) quedan reconciliados con el método correcto (checkpoint). Tema
de reconciliación de stock cerrado.

## 2026-10-01 — Bug: editar/eliminar un movimiento no ajustaba stock (MOV-WA--0020)

Angie editó MOV-WA--0020 (cambió la cantidad) y el stock no se actualizó. Causa raíz:
`guardarEdicion()` y `eliminarMovimiento()` en Historial.jsx buscaban la bodega afectada
comparando `centro_costo` (snapshot de texto del movimiento) contra `bodegas.nombre`
actual con `ilike`. Si la bodega fue renombrada después de crear el movimiento (posible,
ya que `GestionConfig.jsx` permite renombrar bodegas libremente y ese cambio no se
propaga a `centro_costo` en movimientos históricos), la búsqueda no encuentra nada y el
ajuste de stock se salta SIN NINGÚN AVISO — el movimiento se guarda/elimina bien, pero
`stock.cantidad_actual` nunca se toca.

Además, el signo del ajuste solo reconocía `tipo === 'entrada'` vs "cualquier otra cosa"
como salida — con signo invertido para tipos reales usados en la app como
`entrada_compra`, `devolucion`, `salida_produccion`, `salida_venta`, `ajuste_inventario`.

**Fix** (commit b6d9380): nueva función `ajustesStockPorTipo()` que replica el criterio
del trigger `fn_actualizar_stock` de la BD (mismo mapeo de tipos), usando siempre
`bodega_origen_id`/`bodega_destino_id` (FKs reales) en vez de `centro_costo`. Nueva
`aplicarAjustesStock()` reporta en el mensaje de pantalla si no pudo ajustar el stock,
en vez de fallar en silencio. Aplicado tanto a editar como a eliminar movimientos.

**Pendiente**: corregir manualmente el stock puntual de MOV-WA--0020 (la edición ya
hecha no se reflejó) — diagnóstico de solo lectura en
`2026-10-01_diagnostico_mov_wa_0020.sql`, corrección pendiente de los datos que arroje.

**Nota para revisar después**: `TIPO_CONFIG` en Historial.jsx (badges de color) solo
tiene `entrada`/`salida` — los demás tipos reales (entrada_compra, salida_produccion,
etc.) se muestran sin badge propio. No afecta el stock, es solo visual — pendiente de
mejora si Angie lo pide.

## 2026-10-01 — Cierre: MOV-WA-0020 corregido

Confirmado: el movimiento (PASADOR - PLUMA 300 KG 1 3/8x1200MM 1045, bodega
MECANIZADOS) se creó con cantidad 1 (stock correcto en ese momento). Angie lo editó a
18 el 2026-10-01, pero el ajuste de stock se saltó por el bug de `centro_costo` (ya
corregido en Historial.jsx, commit b6d9380). Se aplicó UPDATE puntual: stock pasó de 1
a 18, confirmado por RETURNING. Caso cerrado.

## 2026-10-01 — Auditoría completa de la app tras el caso MOV-WA-0020

Angie pidió revisar toda la app en busca de la misma clase de error (ajustes de stock
que se saltan en silencio). Se encontraron y corrigieron 4 casos reales (commit e1db157):

1. **Historial.jsx (`revertir`/`eliminarMovimiento`)**: el "movimiento par" de una
   transferencia se buscaba comparando `item_id` — pero cada bodega tiene su propio
   renglón de catálogo para el mismo producto (ids distintos), así que esa búsqueda
   casi nunca encontraba nada. Al revertir o eliminar un lado de una transferencia real,
   el stock del otro lado quedaba sin corregir, sin aviso. Ahora busca primero por
   `referencia` compartida (el identificador real que usan los pares que crea la app,
   confirmado en `TransferenciasPendientes.jsx`), con el criterio viejo como respaldo.
   De paso, el ajuste de stock del par ahora usa `ajustesStockPorTipo()` (ya no asume
   binario entrada/salida) y reporta cualquier fallo.

2. **RegistrarMovimientoAlmacenista.jsx (`handleSalida`)**: una transferencia interna de
   Fundición a cualquier bodega que NO fuera Mecanizados solo registraba la salida —
   nunca creaba la entrada en el destino, a pesar de que la pantalla decía "se creará
   una entrada automática". El stock de origen bajaba, el de destino nunca subía. Ahora
   mapea cada producto al catálogo de la bodega destino (mismo criterio que ya usa la
   aprobación de transferencias a Mecanizados) y crea la entrada pareada; si algún
   producto no existe en el catálogo del destino, avisa ANTES de guardar nada.

3. **RecogidaFundida.jsx**: la bodega de Fundición se resolvía buscando por nombre
   (`ilike '%FUNDICIÓN%'`). Si se renombraba, los 3 movimientos de stock de la recogida
   (piezas conformes, consumo de hierro colado, vaceadero) se saltaban completos y en
   silencio, mientras la orden igual quedaba "completado" con pantalla de éxito. Ahora
   usa el id fijo de la bodega (igual que `TransferenciasPendientes.jsx`).

4. **RegistrarFundida.jsx**: el insert de las salidas automáticas de materiales de horno
   no verificaba su error — si fallaba, la fundida se guardaba igual sin que el consumo
   de materiales se reflejara en stock, sin aviso. Ahora se verifica y se avisa.

**Patrón general identificado y ya corregido donde aparecía**: cualquier código que
ajusta `stock` a mano (porque el trigger de la BD solo corre en INSERT, nunca en UPDATE/
DELETE) debe usar las FKs reales del movimiento (`bodega_origen_id`/`bodega_destino_id`,
o para pares, `referencia` compartida) — nunca texto (`centro_costo`, nombre de bodega) —
y debe verificar y mostrar cualquier error, nunca fallar en silencio.

**Revisado y sin hallazgos** (ver auditoría completa): `InventarioFisico.jsx`,
`ListaPedidos.jsx`, `TransferenciasPendientes.jsx`, `RegistrarMovimiento.jsx`,
`RegistroMecanizado.jsx`, `GestionProductos.jsx`, todos los Dashboards (solo lectura).

## 2026-10-02 — Bug: "Generar orden de compra" con pedido_item_id obsoleto (PED-0116)

Error: `insert or update on table "orden_compra_items" violates foreign key constraint
"orden_compra_items_pedido_item_id_fkey"` al generar la OC de PED-0116.

Causa: editar un pedido (`guardarEdicion()` en ListaPedidos.jsx) borra todos sus
`pedido_items` y los vuelve a crear con ids nuevos. El modal "Generar OC"
(`ModalGenerarOC.jsx`) armaba el INSERT de `orden_compra_items` usando
`pedido.pedido_items` — el objeto tal como llegó de la lista en memoria del
componente padre — así que si el pedido se editó mientras la lista no se había
refrescado en pantalla (o el usuario tenía la pestaña abierta desde antes de la
edición), el modal seguía viendo ids de `pedido_items` que ya no existen.

Fix (commit 94efe8c): el modal ahora recarga `pedido_items` directo de la base por
`pedido_id` al abrirse, en vez de confiar en el prop en memoria — así siempre usa los
ids reales y vigentes.

## 2026-10-03 — Bug: Kardex y Analítica no contaban `salida_produccion` (mismo patrón del 10-02)

El informe Kardex (`InformeKardex.jsx`) y la gráfica "Entradas vs salidas" de
Analítica (`DashboardEjecutivo.jsx`) clasificaban movimientos comparando
`m.tipo === 'entrada'` / `'salida'` de forma literal. Eso excluía en silencio
`salida_produccion` (el consumo que registran los operarios desde su pantalla —
`operario/Dashboard.jsx`), y de paso los demás tipos que el trigger
`fn_actualizar_stock()` sí reconoce (`entrada_compra`, `devolucion`,
`salida_venta`, `ajuste_inventario`, `traslado` — hoy sin uso real en el código,
pero ya contemplados por si se usan más adelante). Resultado: para cualquier
ítem con historial de `salida_produccion`, el Kardex subestimaba salidas/costeo
y el stock inicial retrotraído quedaba mal, y la gráfica mensual de Analítica
subestimaba el valor de salidas de ese mes.

Fix (commit 27d9e74): se reemplazó la comparación literal por conjuntos
`TIPOS_ENTRADA`/`TIPOS_SALIDA` que reflejan la misma lógica del trigger, en las
4 clasificaciones del Kardex y en el acumulado mensual de Analítica. Se agregó
`centro_costo` a la consulta de movimientos de Analítica.

**Patrón reafirmado**: el trigger de stock reconoce más tipos de movimiento de
los que cualquier reporte/vista nueva suele probar — cualquier código nuevo que
clasifique movimientos por `tipo` debe usar estos mismos conjuntos, no
comparar contra `'entrada'`/`'salida'` directamente.

### En diseño: costeo mensual por centro de costo (pedido de Angie, 2026-10-03)

Angie quiere ver, mes a mes, el valor de lo comprado/consumido y el valor de
inventario final — por centro de costo (Construequipos/Maquinaria, Fundición
Hierro, Fundición de Aluminio) — visible en Analítica. Decisiones ya acordadas:
valorar el consumo con `precio_costo_snapshot` (costo histórico ya guardado en
cada movimiento, no el precio actual del catálogo), desglosado por centro de
costo (no un solo total de empresa).

Pendiente antes de construir la parte de agrupación: `centro_costo` es texto
libre a nivel de movimiento (no una FK a una tabla de 3 valores) — en el código
ya se ven valores como `'MECANIZADOS'`, `'Almacén'`, `'Construequipos'`, y la
constante `CENTROS_COSTO` en `utils/formatters.js` tiene 7 valores más finos
(`Lámina, Ferretería, Mecanizado, Almacén, Motores, Fundición Hierro, Fundición
de Aluminio`). Antes de mapear esos valores a los 3 centros reales de la
empresa, se le pidió a Angie una consulta de solo lectura para ver los valores
reales y cuántos movimientos tiene cada uno — para no repetir el mismo error
de este informe (asumir un mapeo de texto sin verificar los datos reales).

También falta decidir cómo trackear el *inventario final* mes a mes hacia
atrás: hoy `stock` solo guarda el saldo actual (no hay saldos históricos por
cierre de mes), así que un "valor de inventario final" para un mes que ya
pasó requiere o bien retrotraer desde movimientos posteriores (como ya hace el
Kardex por ítem) o bien crear una tabla de snapshot mensual que se alimente al
cerrar cada mes. Sin resolver aún.

## 2026-10-03 — Costeo mensual por centro de costo (shippeado)

Nueva sección en Analítica (`DashboardEjecutivo.jsx`, `SeccionFinanciero`):
"Costeo del mes por centro de costo" — compras, consumo (costeo) e inventario
actual del mes en curso, por centro de costo real. Decisiones:

- **Valoración**: `precio_costo_snapshot` de cada movimiento (costo histórico
  ya guardado), no el precio actual del catálogo.
- **Centros**: `centro_costo` es texto libre a nivel de movimiento/ítem (no
  una FK), con variantes reales ("01 ALMACEN", "ALMACEN", "Motores",
  "MOTORES"...). Se agregó `normalizaCentro()` (quita acentos/mayúsculas/
  prefijo numérico) + `GRUPO_CENTRO_COSTO`, un mapa explícito que agrupa esas
  variantes en los centros reales de la empresa. Cualquier valor no
  reconocido cae en "Sin clasificar" — visible, nunca se descarta en
  silencio (mismo patrón de cuidado que el resto de esta auditoría).
- **Fundición Hierro vs. Aluminio**: se investigó si bodega, categoría o
  centro_costo distinguen hierro de aluminio hoy — no lo hacen (la bodega de
  Fundición solo tiene categorías "MATERIAL FUNDIDO HIERRO" y "MATERIA PRIMA"
  genérica, cero productos de aluminio en ningún lado del sistema). Por
  indicación de Angie se deja un solo centro, "Fundición Hierro", sin
  desglosar aluminio por ahora. Si se decide etiquetar aluminio por separado
  más adelante (bodega nueva, categoría nueva, o en la orden de moldeo/
  fundida), agregar su mapeo en `GRUPO_CENTRO_COSTO` en vez de dejarlo caer
  en "Sin clasificar".
- **Inventario**: el valor de inventario mostrado es el saldo de HOY, no una
  foto del cierre del mes. Pendiente: para ver el inventario final de un mes
  que ya pasó, hay que retrotraer desde movimientos posteriores (como ya hace
  el Kardex por ítem, generalizado por centro de costo) o guardar una foto
  mensual al cierre — sin resolver aún, no bloquea lo ya entregado porque hoy
  solo se consulta el mes en curso.

Commit 97e3fef.

## 2026-10-03 — Bug: Analítica recortaba en silencio al tope de 1000 filas de PostgREST

Angie reportó que la gráfica "Entradas vs. Salidas" de Analítica no mostraba
nada de septiembre. Causa: `stockQ`/`movsQ`/`allMovQ` en `DashboardEjecutivo.jsx`
no tenían `.limit()` explícito — PostgREST corta cualquier consulta sin límite
en su tope por defecto (1000 filas) sin devolver error ni aviso. Con ~4.000+
movimientos históricos y creciendo, la consulta del período (`movsQ`) se
quedaba corta, y sin `.order()` explícito el corte se quedaba con filas más
viejas, dejando fuera el mes más reciente.

Fix (commit 23af516): se agregó `.limit(50000)` a las 3 consultas de este
archivo — mismo límite que `InformeKardex.jsx` ya usa para esto mismo.

**Patrón a vigilar**: cualquier consulta nueva a `movimientos`, `stock` o
`items` sin `.limit()` explícito puede recortarse en silencio a medida que la
base de datos crece. Revisar esto en cualquier componente nuevo que liste o
agregue estas tablas.

## 2026-10-03 — Revisión del tope de 1000 filas en el resto de la app

A raíz del bug anterior, se revisaron todas las consultas a `movimientos`,
`stock` e `items` en busca del mismo patrón (consulta sin `.limit()` que
Supabase/PostgREST recorta en silencio a 1000 filas). Se encontraron y
corrigieron dos más (commit d2b8461):

- **Reportes.jsx** (pestañas Stock actual / Stock bajo / Valorización): sin
  límite — podía ocultar alertas de stock bajo o subestimar el valor total
  de inventario. Se agregó `.limit(50000)`.
- **GestionProductos.jsx**: tenía un workaround manual de dos `.range()`
  (0-999 y 1000-1999) que solo cubre 2000 filas — se reemplazó por un
  `.limit(50000)` único.

Revisado y sin el mismo problema (ya tenían `.limit()` adecuado o la
consulta es inherentemente de una sola fila): `InformeKardex.jsx`,
`AnaliticaFundicion.jsx`, `Historial.jsx`, `InventarioFisico.jsx`,
`ListaPedidos.jsx`, `GestionItems.jsx`, `Dashboard.jsx` (admin).

Nota aparte, no es el mismo bug: `Reportes.jsx` pestaña "Movimientos" usa
`.limit(200)` ordenado por fecha descendente — es un límite intencional
("últimos 200"), no un recorte accidental, pero vale la pena que Angie sepa
que esa pestaña no muestra el historial completo si filtra un rango de
fechas amplio.

## 2026-10-03 — Corrección real: el límite de filas no servía (tope del servidor)

El fix de esta mañana (`.limit(50000)`, commits 23af516/d2b8461) no resolvió
nada: Angie confirmó que septiembre (2.464 movimientos, el mes con más
movimiento) seguía sin aparecer en "Entradas vs. Salidas" después de ese
cambio. Causa real: **un `.limit()` más alto desde el cliente no puede
superar el tope de filas por request que Supabase/PostgREST impone en el
servidor** (por defecto 1000) — pedir 50000 simplemente se ignora y el
servidor sigue devolviendo máximo 1000 filas. El `.limit(50000)` de esta
mañana nunca tuvo efecto real.

Fix (commit 5210f6a): se agrega `src/utils/fetchAllPages.js`, que pagina
cualquier consulta en bloques de 1000 filas hasta traerlas todas, sin
importar el tope del servidor. Se reemplaza en los 4 archivos afectados
(`DashboardEjecutivo.jsx`, `InformeKardex.jsx`, `Reportes.jsx`,
`GestionProductos.jsx`), incluyendo el viejo doble `.range()` de
GestionProductos que tenía el mismo problema de fondo.

**Patrón a recordar**: cualquier consulta nueva a `movimientos`, `stock` o
`items` que pueda superar 1000 filas debe usar `fetchAllPages()`, nunca
`.limit(N)` con N > 1000 — ese límite no hace nada.

## 2026-10-03 — Incidente: repo de git corrupto por sincronización de iCloud Drive

Durante la sesión se cortó la conexión varias veces a mitad de operaciones
de git/esbuild. La carpeta del proyecto está dentro de Documents, que
Angie tiene sincronizado con iCloud Drive — eso generó archivos de
conflicto de sincronización dentro de `.git/` (lock files duplicados tipo
`HEAD 10.lock`, `HEAD 11.lock`...) y, más grave, corrompió un objeto real
del historial de git (`InformeNomina.jsx`), bloqueando cualquier commit
nuevo con "invalid object" / "error: Error building trees".

Se reparó clonando una copia limpia desde GitHub (`git clone` +
reutilizar las credenciales del remoto original), copiando ahí los
archivos recién editados, haciendo commit/push desde la copia limpia, y
reemplazando el `.git` corrupto de la carpeta real por el de la copia
limpia (los archivos de trabajo de Angie no se tocaron, solo el historial
interno de git). `git fsck --full` quedó sin errores después.

**Recomendación pendiente, no urgente**: un repo de git activamente usado
dentro de una carpeta sincronizada por iCloud Drive (o Dropbox/Google
Drive) es una combinación propensa a esto — iCloud puede evaluar/evictar
archivos mientras git los está escribiendo. Si se repite, lo más robusto
sería mover el clon del proyecto a una carpeta fuera de Documents/Desktop
(p. ej. `~/Proyectos` sin sincronización), y conectar esa carpeta nueva en
vez de la actual.

## 2026-10-03 (continuación) — Costeo por bodega + selector de mes específico

Angie pidió dos ajustes al costeo que se había agregado unas horas antes:

1. **Poder elegir un mes y año específico**, no solo una ventana corrediza
   ("últimos N meses"). Antes el bloque de costeo siempre mostraba el mes en
   curso (`hoy`), sin forma de ver un mes ya cerrado (ej. revisar septiembre
   estando ya en octubre).
2. **Agrupar el costeo por bodega en vez de por centro de costo.** Se
   abandona el mapeo `centro_costo → "Construequipos/Maquinaria" |
   "Fundición Hierro" | "Sin clasificar"` (texto libre, con normalización de
   acentos/mayúsculas/prefijos). `bodega_id` es una FK real y limpia tanto en
   `movimientos` (bodega_origen_id/bodega_destino_id) como en `stock`
   (bodega_id) — no hay texto que adivinar ni variantes que mapear.

### Qué cambió (`DashboardEjecutivo.jsx`)

- `procesarDatos()` ahora calcula el costeo (compras/consumo) para **todos
  los meses presentes en los movimientos cargados**, agrupado por bodega:
  `costeoPorMes = { 'YYYY-MM': { 'Nombre bodega': {compras, consumo} } }`.
  Compras se atribuye a `bodega_destino_id`, consumo a `bodega_origen_id`
  (mismo criterio TIPOS_ENTRADA/TIPOS_SALIDA ya usado para "externas" vs.
  traslados). Una bodega con id que no aparece en la lista de bodegas
  activas cae en "Bodega desconocida" (visible, nunca se descarta en
  silencio).
- El inventario de HOY por bodega se calcula aparte
  (`inventarioPorBodegaHoy`) y solo se muestra cuando el mes seleccionado en
  pantalla es el mes en curso — para un mes pasado se muestra "—", porque
  **no se guardan fotos de cierre de mes todavía** (mismo límite ya
  documentado antes, ahora más visible porque sí se puede navegar a meses
  pasados).
- `SeccionFinanciero` (el componente de la pantalla) agrega un selector de
  mes local (`useState`), con las opciones = los meses que ya vinieron en
  los datos cargados. **Importante:** ese selector solo puede mostrar meses
  dentro de la ventana del filtro "Últimos N meses" de arriba — si Angie
  quiere ver un mes más atrás del que esa ventana cubre, primero tiene que
  ampliar ese filtro (ej. de "Últimos 6 meses" a "Últimos 12 meses"), porque
  los datos de meses fuera de esa ventana ni siquiera se traen de Supabase.
  No se cambió esa ventana de carga en este ajuste — quedó como posible
  mejora futura si hace falta.

### Pendiente de diseño (sigue abierto)

El costeo histórico real de un mes cerrado (compras/consumo sí se pueden
reconstruir desde los movimientos, pero el **inventario de cierre** de un
mes pasado no, porque no se guardan fotos de stock por fecha) seguiría
necesitando una tabla de snapshots mensuales de stock si algún día se quiere
mostrar el inventario de cierre de un mes específico, no solo el de hoy.

## 2026-10-03 (continuación 2) — Inicio no coincidía con Analítica (mismo bug del tope de 1.000 filas)

Angie reportó: filtrando por bodega Almacén, el inventario que ve en
Analítica no coincide con el de Inicio. Al revisar el módulo completo en
busca del mismo patrón de error (no solo el punto que ella señaló), se
encontró que **`Dashboard.jsx` (la pantalla de Inicio) nunca recibió el
arreglo de paginación** que sí se aplicó hoy a Analítica/Kardex/Reportes/
Productos: sus dos consultas a `stock` usaban `.limit(50000)`, que el
servidor de Supabase/PostgREST sigue recortando a su tope real (1000 filas
por respuesta) sin importar el número pedido desde el cliente. Si la
empresa tiene más de 1000 combinaciones ítem+bodega en `stock` (muy
probable dado el volumen ya confirmado en `movimientos`), Inicio estaba
trabajando con una porción incompleta y desordenada del inventario — de ahí
el desajuste.

**Corregido con el mismo patrón ya establecido (`fetchAllPages()`):**
- `src/components/admin/Dashboard.jsx` — las dos consultas a `stock` (el
  desglose por bodega y la de stock bajo) ahora paginan completo. También se
  alineó la valoración con Analítica: el stock negativo ya no resta del
  valor total (`Math.max(0, cantidad_actual)`), igual que en
  DashboardEjecutivo.
- `src/components/reportes/CorteInventario.jsx` — su consulta a `stock`
  usaba `.range(0, 19999)`, que tiene el mismo problema (el rango pedido no
  cambia el tope real del servidor). Ahora pagina con `fetchAllPages()`.
- `src/components/fundicion/AnaliticaFundicion.jsx` — sus 3 consultas
  (órdenes de moldeo, fundidas, movimientos de hierro/vaceadero) usaban
  `.limit(50000)` sin paginar; con el filtro de período en "Todo el tiempo"
  (sin fecha mínima) quedaban expuestas al mismo recorte. Ahora paginan.

**Revisado y dejado igual (riesgo bajo, no se tocó):**
- `InformeNomina.jsx` usa `.limit(50000)`/`.limit(10000)` pero siempre
  acotado a un período de nómina (mes/quincena), volumen chico — no se
  encontró evidencia de que se esté recortando.
- Varias pantallas (GestionItems, RegistrarMovimiento,
  RegistrarMovimientoAlmacenista, ListaPedidos, NoConformidades) usan
  `.limit(10000)`/`.limit(2000)` para listar `items` en selectores de
  producto. Mientras el catálogo de ítems activos tenga menos de 1000 filas
  no hay problema, pero si algún día supera esa cifra, esos selectores
  empezarían a "perder" productos en silencio (los que queden después de la
  fila 1000). **Pendiente**: confirmar cuántos ítems activos hay hoy y, si
  se acerca a 1000, aplicar el mismo arreglo de paginación ahí también.

## 2026-10-05 — Inventario físico sumaba el conteo encima del stock anterior (INV-FIS-0033)

Angie notó que el inventario físico del sábado quedó "teniendo en cuenta los
movimientos antiguos": el conteo físico debe ser la verdad y el stock debe
quedar IGUAL al conteo, sin importar lo anterior.

**Causa:** `InventarioFisico.jsx` cargaba el stock con `.range(0, 9999)`, que el
servidor sigue topando a 1000 filas (mismo bug del tope de PostgREST). Los
productos fuera de esas filas aparecían con "Sistema = 0", así que la
diferencia salía igual al conteo completo y se registraba como ENTRADA encima
del stock real (stock final = stock previo + conteo). Cuando el conteo era 0
la diferencia era 0 y no se ajustaba nada (el stock previo se quedaba).
Confirmado con `diagnostico_inventario_fisico.sql`: en INV-FIS-0033 (Fundición)
13 productos con "sistema_al_contar = 0" y stock_hoy = stock previo + conteo
(ej. CHUMACERA VOLTEO: conteo 39, stock hoy 194, sobraban 155). Los demás
productos quedaron exactos. Es probable que explique también los descuadres de
INV-FIS-0026 y 0029 (ver scripts reconciliar_stock_*).

**Arreglo en código:**
- La carga de stock y de ítems por bodega ahora pagina (`fetchAllPages`).
- Al CONFIRMAR, la diferencia se recalcula contra el stock real de ese
  instante (relectura completa), no contra la foto cargada al abrir la
  pantalla → el stock queda exactamente igual al conteo aunque hayan pasado
  movimientos mientras se contaba.

**Datos ya dañados:** `correccion_inventario_fisico_INV-FIS-0033.sql` registra
salidas de corrección (referencia INV-FIS-0033) por la cantidad que sobra.
Ojo: esas salidas y las entradas erróneas originales aparecen como
compras/consumo de octubre en Analítica (costeo Fundición).

## 2026-10-05 (cont.) — Mecanizar calculaba stock sumando movimientos + ajuste a Inventario Físico

**Mecanizar (`RegistroMecanizado.jsx`):** el stock disponible se calculaba sumando
TODOS los movimientos del producto (solo 'entrada' sumaba, todo lo demás
restaba, topado a 1000 filas), sin mirar la tabla `stock`. Por eso no respetaba
inventarios físicos ni correcciones: los pines de pluma tenían 71 en `stock`
(MECANIZADOS) pero la pantalla mostraba 0 y no dejaba mecanizarlos. Ahora lee
`stock` filtrado por la bodega Mecanizados (paginado). Ninguna otra pantalla
calculaba stock sumando movimientos (grep `neto[`).

**Inventario Físico (corrige lo del lunes, ca1dc05):** se revierte el recálculo
"contra stock fresco al confirmar": habría pisado movimientos legítimos hechos
MIENTRAS se contaba (caso real: REC-WA-0051, +15 DISCO SUELTO BASE DE PLUMA,
el 28/09 durante INV-FIS-0028). La diferencia vuelve a calcularse contra el
stock cargado al abrir el conteo (ahora completo, paginado): stock final =
conteo + movimientos ocurridos durante el conteo.

**Auditoría de inventarios desde el 25/09:** 8 inventarios, 568 productos; solo
3 marcados como descuadrados y los 3 resultaron falsos positivos (cadena de
movimientos cuadra: CHUMACERA VOLTEO y CHUMACERA GRANDE consumidas por
mecanizado después del conteo; DISCO SUELTO recibió +15 después del conteo).


## Recogida de fundición: conformes por encima de lo planeado (07/10/2026)
- Antes: `guardarRecogida` exigía conformes + NC === planeadas ("Deben sumar exactamente") y bloqueaba el guardado.
- Realidad de planta: a veces salen piezas de otras fundidas y solo se sabe si son conformes o NC al pulirlas.
- Ahora: se permite conformes + NC **mayor** que lo planeado (aviso naranja informativo, no bloquea). Sigue bloqueando si la suma es **menor** (faltan piezas por contabilizar) y si hay negativos.
- Las conformes extra generan igual la entrada de inventario a Fundición; los kg de NC al vaceadero no cambian.
- Efecto en reportes: el % de conformidad por pieza/moldeador (AnaliticaFundicion, ListaOrdenesMoldeo) puede superar 100 %. Es esperado cuando entran piezas de otras fundidas.
- Pendiente de decisión: si algún día se quiere trazar de qué orden vienen las piezas extra, habría que agregar un campo (hoy no existe).

### Actualización (07/10/2026): faltantes con aclaración obligatoria
- Si conformes + NC queda **por debajo** de lo planeado, ya no se bloquea sin salida: aparece un recuadro ámbar "No salió todo lo planeado: faltan N de M" con un campo de **aclaración obligatoria** (mín. 3 caracteres) por pieza.
- La aclaración se guarda en `ordenes_moldeo_piezas.motivo_nc` con el formato `Faltante N de M: texto` (junto al motivo de calidad si lo hay, separado por ` | `). No se creó columna nueva para no exigir migración; si se quiere reportar faltantes por separado, conviene agregar `motivo_faltante` y migrar.
- Una orden con faltantes aclarados se cierra igual como "completado" y solo los conformes entran a inventario. Ojo: al digitar conformes el campo NC se autocompleta con (planeadas − conformes); si lo planeado no se moldeó (no son NC reales), hay que poner NC en 0 para que esos kg no vuelvan al vaceadero y escribir la aclaración.
- Pendiente de diseño: si la orden es de largo plazo y debe quedar abierta para seguir moldeando, eso es el flujo de avances diarios (`ordenes_moldeo_avances`), no este cierre.


## Orden de compra: subtotal, IVA 19 % y total a pagar (08/10/2026)
- Angie pidió que las "cotizaciones" de Logística muestren subtotal, IVA 19 % y total a pagar. En el código lo que genera Logística es la **orden de compra (OC)** (`ModalGenerarOC.jsx` → `utils/exportOrdenCompraPDF.js`); no existe un módulo llamado "cotizaciones". Si más adelante se crea uno distinto, reutilizar `calcularTotalesOC`.
- `calcularTotalesOC(subtotal)` (en `exportOrdenCompraPDF.js`) devuelve `{ subtotal, iva, total }` redondeado a 2 decimales; `IVA_TARIFA = 0.19` (tarifa general, Art. 468 Estatuto Tributario).
- Supuesto: los precios unitarios de la OC son **sin IVA** (vienen de `items.precio_costo`) y el IVA se suma al final sobre el subtotal.
- Se ve en: el PDF (bloque Subtotal / IVA (19%) / Total a pagar en recuadro azul), el modal de generar OC (resumen), la lista de órdenes de compra (total con IVA y detalle debajo) y el detalle del pedido (total "IVA incl.").
- Limitación conocida: el IVA se aplica siempre al 19 %. Si un proveedor no es responsable de IVA o el producto es excluido/exento, el total saldría de más. Solución futura: columna `aplica_iva` en `ordenes_compra` (migración) con casilla en el modal.
- Las OC ya generadas no guardan el IVA: se recalcula al vuelo, así que al re-descargar un PDF antiguo ya sale con IVA.


## Confidencialidad de la OC en la vista de pedidos (08/10/2026)
- Pedido de Angie: en el pedido, las otras áreas no deben ver el proveedor ni el precio de la orden de compra.
- `ListaPedidos.jsx`: solo ADMIN y LOGÍSTICA (`puedeVerDetalleOC`) ven proveedor, total con IVA y botón de PDF en "Órdenes de compra generadas". Las demás áreas (incluido CONSULTOR) ven solo el número de la OC.
- La consulta también cambió: para roles distintos de ADMIN/LOGÍSTICA ya no se trae `proveedores`, `precio_unitario` ni el nombre de quien generó; solo `id, numero, pedido_id` y, por línea, `pedido_item_id` + `cantidad` (para mostrar "En orden de compra: N · Falta pedir: N", que no es confidencial).
- La pantalla `/ordenes-compra` ya estaba disponible solo para ADMIN y LOGÍSTICA (rutas en `App.jsx`).
- **Pendiente de seguridad (no es de interfaz):** las políticas RLS de `proveedores`, `ordenes_compra` y `orden_compra_items` permiten SELECT a cualquier usuario autenticado (migración `2026-09-28_ordenes_compra.sql`). Con la app normal ya no se ve, pero alguien con conocimientos técnicos podría consultar esas tablas directo contra la API de Supabase. Para cerrarlo de verdad hay que cambiar esas políticas SELECT a solo ADMIN y LOGISTICA (y revisar que ListaPedidos siga leyendo `ordenes_compra` con la consulta reducida, que entonces se tendría que mover a una vista o función sin precios).


## Operario puede recibir sus propios pedidos (08/10/2026)
- Reporte: al operario de corte y doblez no le aparecía el botón "Recibido + Entrada" en un pedido En tránsito (PED-0112).
- Causa: `puedeRecibir` en `ListaPedidos.jsx` solo incluía ADMIN, ALMACENISTA, y LOGISTICA / JEFE_MECANIZADOS cuando son el solicitante. OPERARIO no estaba.
- Cambio: se agregó OPERARIO a ese segundo grupo (solo pedidos donde `solicitante_id` es él). La entrada de inventario va a la bodega del producto (`items.bodega_id`), que para un operario es la de su área porque los productos que puede pedir se filtran por `profile_bodegas`.
- La política RLS de `movimientos` ya permite insertar movimientos propios (`usuario_id = auth.uid()`), así que no requirió SQL. Si al probar el botón sale un error de permisos al actualizar `pedidos`, el problema sería la política de UPDATE de esa tabla (no está en `schema.sql`).
- **Ampliado el mismo día a todos los roles:** `puedeRecibir = esAdmin || esAlmacenista || p.solicitante_id === perfil?.id`. Es decir, ADMIN y ALMACENISTA reciben cualquier pedido y cualquier otro rol (JEFE_FUNDICION, JEFE_MECANIZADOS, LOGISTICA, OPERARIO, CONSULTOR) recibe los pedidos que él mismo solicitó. Nadie recibe pedidos de otro (salvo Admin/Almacén).
- Nota de caché: el teléfono del operario mostraba proveedor y precio de la OC en formato anterior (sin "IVA incl."), señal de que tenía en caché una versión vieja de la app (PWA). Hay que cerrar la app por completo y reabrirla, o borrar los datos del sitio, para que cargue la versión nueva.


## "Completar pedido" pasa a "Cerrar pedido" (09/10/2026)
- Motivo: la gente confundía "recibir" con "completar" el pedido.
- `ListaPedidos.jsx`: el botón (antes un ícono de check verde sin texto) ahora es un botón gris con candado y el texto "Cerrar pedido"; el modal se llama "Cerrar pedido PED-XXXX" y su botón "🔒 Cerrar pedido"; el texto aclara que cerrar NO registra entrada de inventario. El estado `cerrado` se muestra como "Cerrado" (pastilla, pestaña del filtro, historial "🔒 Pedido cerrado" y "🔒 Cerrado: <motivo>" en la tarjeta).
- No cambió la base de datos: el estado interno sigue siendo `cerrado`, así que no hay migración y los pedidos antiguos se ven con la etiqueta nueva.
- La pestaña "Cerrado" agrupa, como antes, los pedidos `cerrado` y `recibido` (destino final del embudo).
- Pendiente menor: en `DashboardEjecutivo.jsx` (lead time) todavía dice "pedidos completados"; es una métrica sobre pedidos terminados, se dejó igual.

## Fecha del movimiento: respetar la fecha elegida (09/10/2026)
- Reporte: al registrar entradas/salidas/transferencias "de días atrás", todo quedaba con la fecha de hoy.
- Causas encontradas: (1) `RegistrarMovimiento.jsx` (ADMIN y LOGISTICA) no tenía selector y guardaba hoy en UTC (después de las 7 p. m. en Colombia quedaba mañana); (2) la recepción de pedido con "Recibido + Entrada" (`ListaPedidos.jsx`) no mandaba `fecha_movimiento`; (3) la lista de transferencias y los "últimos movimientos" de los dashboards de bodeguero/jefe de área mostraban `created_at` (fecha de registro) en vez de `fecha_movimiento`.
- Cambios: selector "Fecha del movimiento" en el formulario de Admin/Logística y en el modal de recepción de pedido (solo cuando hay entrada); fecha por defecto en hora Colombia (`America/Bogota`); `TransferenciasPendientes` muestra la fecha del movimiento y la usa como respaldo en hora Colombia; dashboards muestran `fecha_movimiento` y, si no hay, `created_at`.
- El formulario de Almacenista/Jefes (`RegistrarMovimientoAlmacenista.jsx`) ya enviaba la fecha elegida; la transferencia Fundición→Mecanizados la guarda en `transferencias_pendientes.fecha_movimiento` y se usa al aprobar. Migración opcional `2026-10-09_transferencias_fecha_movimiento.sql` (idempotente) por si esa columna no existe en producción.
- Gotcha: `created_at` siempre es la hora real de registro (auditoría); `fecha_movimiento` es la fecha contable. Los reportes (Kardex, Historial, corte) ya usan `fecha_movimiento` con respaldo a `created_at`.

## Mecanizado: "No se encontró <producto> - MECANIZADO" (14/10/2026)
- Síntoma: el Jefe de Mecanizados tenía stock (35 und) de EJE DE CATALINA - 2 B - 1 1/2 B -1 B(2X160MM 1045) y al confirmar salía "No se encontró ... - MECANIZADO".
- Causa: `RegistroMecanizado.jsx` busca el producto destino `<nombre origen> - MECANIZADO` en la categoría "producto mecanizado" con `ilike` exacto. Falla si ese producto no existe, está inactivo o su nombre difiere (espacios alrededor de guiones/paréntesis, tildes).
- Cambio: se trae la categoría completa y se compara normalizado (mayúsculas, sin tildes, sin espacios). Si el destino existe pero está inactivo, el error lo dice; si no existe, el error sugiere nombres parecidos y cómo crearlo. Además `hoyISO()` ahora usa hora de Colombia.
- Pendiente: si el destino de verdad no existe, hay que crearlo (categoría producto mecanizado, bodega MECANIZADOS) — idea futura: crearlo automáticamente al mecanizar por primera vez.

## Salida con "Transferencia interna": "No existe en el catálogo de <bodega>: ..." (15/10/2026)
- Síntoma: el Jefe de Fundición, al sacar CORONA 1/2 BULTO LITEMIX, CORONA 1 1/2 BULTO y PLANCHA RANA CONVENCIONAL hacia ARMADO Y SOLDADURA, recibía ese error. En "Transferencia interna" el destino SÍ son bodegas.
- Causa de fondo: cada bodega tiene su propio catálogo (ids distintos para el mismo producto). Al transferir se debe crear una entrada pareada en la bodega destino, así que el producto tiene que existir allí con el mismo nombre. Si no existe (o difiere), se bloquea antes de guardar para no dejar la salida sin su entrada.
- Cambio: la comparación de nombres ahora ignora espacios, tildes y mayúsculas (igual que en Mecanizado), solo toma productos activos del destino y pagina (límite 1000 filas) — en `RegistrarMovimientoAlmacenista.jsx` y `TransferenciasPendientes.jsx`.
- Pendiente: si el producto de verdad no existe en el destino hay que crearlo ahí. Idea futura: crearlo automático con una función SECURITY DEFINER (las políticas de `items` solo dejan crear en bodegas propias).

- **Decisión (15/10/2026, opción 1):** en la salida con "Transferencia interna" (no Mecanizados), si un producto NO existe en el catálogo de la bodega destino ya no se bloquea: se registra solo la salida (como antes del 03/10) y la pantalla avisa en amarillo cuáles productos quedaron sin entrada en el destino. Los que sí existen siguen creando su entrada pareada. Motivo: ARMADO Y SOLDADURA aún no tiene perfil ni catálogo. Cuando una bodega empiece a operar, pasar a la opción 2 (crear el producto en destino con función SECURITY DEFINER). Las transferencias a Mecanizados (aprobación) siguen exigiendo catálogo.

## Pedidos: N° de movimiento de la entrada visible en el pedido (15/10/2026)
- Pedido del usuario: al dar "Recibido + Entrada", que el pedido muestre el N° de movimiento de esa entrada para poder rastrear y corregir.
- `ListaPedidos.jsx`: (1) cada recepción ahora genera UN solo N° `MOV-XX-NNNN` compartido por todas sus líneas (antes cada línea tenía uno distinto); (2) la tarjeta del pedido (al expandirla) muestra "Entradas de inventario" con N° de movimiento, # de ítems y fecha de cada entrada, leyendo `movimientos` por `pedido_id` (incluye recepciones anteriores y las registradas desde Movimientos); (3) el historial del pedido agrega " · Movimiento MOV-XX-NNNN" al registro de recibido; (4) el mensaje de éxito muestra el N°.
- El historial se escribe al final de la recepción para poder incluir el N° (si la entrada falla, queda sin N°).
- Gotcha: las recepciones previas a esta fecha tienen un N° distinto por línea; en la tarjeta salen como entradas separadas (una por línea). Los roles que por RLS no lean `movimientos` no verán la sección.

## Revertir una entrada volvía a sumar stock (15/10/2026)
- Síntoma: al revertir la entrada MOV-WA-0026 (Jefe de Mecanizados, EJE CENTRAL 1 1/2 B) se creó la salida de reversión (MOV-5075) y además una ENTRADA "REVERSIÓN PAR …" (MOV-5076) que volvió a sumar el stock.
- Causa: `buscarMovimientoPar` (Historial.jsx) rellenaba la bodega faltante con la otra (`bodega_origen_id || bodega_destino_id`). Una entrada normal (sin bodega origen) terminaba buscando un "par" con origen = destino = Mecanizados, mismo producto y cantidad → encontraba un movimiento de mecanizado (salida) que no tenía nada que ver, lo "revertía" con una entrada y lo marcaba `revertido=true`.
- Arreglo: solo hay par si el movimiento tiene bodega origen Y destino y son distintas (transferencia real). Entradas de compra/producción, salidas externas y mecanizados ya no buscan par. También protege "Eliminar".
- Datos a corregir a mano: revertir MOV-5076 (queda neto 0) y poner `revertido=false` al movimiento que fue marcado por error (ver SQL de diagnóstico `diagnostico_reversion_MOV-WA-0026.sql`).

## 2026-10-15 — Historial: paginación y errores visibles
- `Historial.jsx` ahora pagina la carga de movimientos (`.range()` + `fetchAllPages`; sin rango trae hasta 5.000, con rango todos) y también pagina el catálogo de items. Antes el servidor cortaba en 1.000 filas en silencio.
- Si la consulta de movimientos falla, se muestra el mensaje de error (antes se ignoraba y la lista quedaba vacía).
- Orden estable: created_at desc, luego id desc.
- Caso investigado: `REC-JA-0024` existía en BD (entrada, Fundición, fecha_movimiento 05/10/2026) pero no aparecía en Historial para ADMIN. RLS descartada (`movimientos_select` deja leer todo a ADMIN).

## 2026-10-16 — Pedido PED-0113 recibido por error: reversión de entradas
- Revertir una entrada desde Historial NO toca `pedido_items.cantidad_recibida` ni `pedidos.estado`: hay que corregirlos aparte (se hizo por SQL).
- `ListaPedidos.jsx`: la sección "Entradas de inventario" del pedido ahora ignora entradas con `revertido = true`.
- Se revirtieron por SQL 7 de 11 entradas (MOV-WA-0024/25/29/30/32/33/34), con movimientos `REV-<numero>`. MOV-WA-0026 ya estaba revertida. MOV-WA-0027, 0028 y 0031 NO se tocaron: su stock ya estaba en 0 (revertir las dejaba en negativo). Pendiente entender quién consumió ese material.
- Gotcha: MOV-WA-0026 aparece `revertido=true` pero su producto tiene stock 15; por revisar.

## 2026-10-16 — Informe "Ventas internas de Fundición" (para PyG por centro de costo)
- Nuevo informe en Informes > "Ventas internas de Fundición" (`/reportes/ventas-internas-fundicion`), solo ADMIN (muestra valores en COP). Exporta Excel con hojas Resumen (por destino) y Detalle.
- Criterio acordado con Angie: las salidas de Fundición a OTRAS bodegas (tipo `salida`, bodega_origen = Fundición, bodega_destino distinta) son "ventas internas" a producción; su valor se lleva como COSTO al centro de costos Construequipos.
- Solo se cuenta la SALIDA (no la entrada pareada REC- del destino) para no duplicar valor.
- Valor = cantidad × `precio_costo_snapshot` (costo guardado en el movimiento). Líneas con costo 0 se marcan "SIN COSTO" (con el costo actual del catálogo como referencia) y valen $0 en el total.
- Se excluyen movimientos revertidos (`revertido = true`), movimientos de reversión (`revertido_en` no nulo) y salidas sin bodega destino (ventas externas, consumos, correcciones).
- Fecha contable: `fecha_movimiento`, con fallback a `created_at`. Pagina con `fetchAllPages` (tope 1.000 filas de PostgREST).
- Pendiente (siguientes informes): resto de centros de costo / conciliación de inventario. Posible mejora: precio de transferencia con margen si se quiere que Fundición muestre utilidad en su PyG.

## 2026-10-16 — Informe "Balance de hierro — Fundición" (Fase 1) + fix Analítica
- Nuevo informe en Informes > "Balance de hierro" (`/reportes/balance-hierro`), solo ADMIN. Mensual (rango de meses). Exporta Excel (hojas: Balance mensual, Órdenes de moldeo, No conformes, Moldeadores, Controles + conteo físico).
- Cadena que cruza: compras/entradas de hierro (movimientos a bodega FUNDICIÓN) → hierro cargado (tabla `fundidas.hierro_colado`) → hierro DESCONTADO (salida de HIERRO COLADO al cerrar la orden en Recogida, referencia "ORD-MOL-xxxx · FUN-xxxx") → piezas buenas (conformes × peso_unitario) + NC + vaceadero (entrada de VACEADERO = kg manual + kg NC) → merma real = descontado − buenas − vaceadero (misma fórmula de Recogida) → stock sistema vs conteo físico.
- Merma esperada: % editable por Angie (vacío = histórico del rango) + tolerancia en puntos. Rojo si merma real > esperada + tolerancia.
- Productos que cuentan como hierro: se eligen en pantalla (checklist de la bodega Fundición; HIERRO COLADO siempre incluido; por defecto categoría "MATERIA PRIMA" sin carbón/caliza/ferromolido/exlac). La selección, meses, % y tolerancia se guardan en localStorage del navegador (no en BD).
- Stock de cada fin de mes: se reconstruye retrocediendo desde el stock actual con los movimientos posteriores. El trigger `fn_actualizar_stock` hace GREATEST(0, ...) en salidas/ajustes, así que si alguna vez se forzó stock a 0 aparece en la columna "Sin explicar".
- Controles: fundidas sin descontar (hierro cargado que no se descontó porque la orden no se cerró con esa fundida), órdenes cerradas sin hierro, piezas sin peso unitario, merma negativa, salidas de hierro que NO son consumo de horno, entradas sin proveedor.
- Dato clave: el hierro SOLO se descuenta del inventario al cerrar la orden de moldeo con la fundida vinculada (Recogida), no al registrar la fundida. Mientras tanto el stock de sistema está inflado.
- FIX: `AnaliticaFundicion.jsx` filtraba órdenes con estado `'completada'` pero Recogida guarda `'completado'` → la analítica de Fundición no veía ninguna orden. Ahora acepta ambos.
- Pendiente Fase 2: cruce con el pago a moldeadores (pago por kilo de pieza buena; falta el $/kg y la liquidación de nómina). Fase 3: cruce con inventario de piezas terminadas.
- (16/10/2026) Balance de hierro: la lista "Materia prima que cuenta como hierro" muestra SOLO materia prima (sin aditivos del horno ni piezas de "MATERIAL FUNDIDO"). Las piezas fundidas son salida y se calculan desde las órdenes de moldeo × peso unitario; no se escogen. Botones "Seleccionar todo" / "Quitar todo" (HIERRO COLADO siempre queda incluido).

## 16/10/2026 — Balance de hierro: solo HIERRO COLADO y VACEADERO
- Decisión de Angie: el balance cuenta únicamente dos productos de Fundición: HIERRO COLADO y VACEADERO. Se eliminó el selector de productos (ya no hay lista ni "seleccionar todo"); los IDs son fijos en `InformeBalanceHierro.jsx` (`IDS_HIERRO`).
- El VACEADERO ya no se confunde con una compra: sus entradas (cierre de orden en Recogida) van en la columna "+ Vaceadero generado" y sus salidas en "− Vaceadero que sale" (cada salida de vaceadero también aparece en Controles para revisión).
- El stock del balance = HIERRO COLADO + VACEADERO (ambos son hierro recuperable). El conteo físico se captura por producto por separado.
- La merma sigue calculándose igual: hierro descontado en órdenes − piezas buenas − vaceadero (el vaceadero se lee aparte de las órdenes, sin doble conteo).
- El Excel agrega las dos columnas de vaceadero en "Balance mensual" y las salidas de vaceadero en "Controles".

## 19/10/2026 — Stock RUEDA 5' (ALMACEN) inflado (257 vs 93 del historial)
- Causa: 07/09/2026, 4 salidas en 4 min (SAL-MG-0072/0073/0074/0076 = 259 und) con saldo de 110; el trigger no baja de 0 (GREATEST) y el stock quedó inflado. Posible error de digitación en SAL-MG-0074 (129) y duplicado 43/43.
- Corrección elegida por Angie (opción B): recalcular stock desde movimientos → `supabase/migraciones/2026-10-19_corregir_stock_rueda_5_almacen.sql` (ejecutar a mano en Supabase). Sin conteo físico previo.
- Pendiente: alerta/bloqueo en RegistrarMovimiento* cuando la salida supera el stock disponible (propuesto, sin confirmar).

## 19/10/2026 — Auditoría de stock de todos los productos
- Modelo: stock esperado = neto de movimientos + MAX(stock inicial cargado, stock inicial implícito), donde implícito = -MIN(saldo corrido). El trigger no baja de 0, por eso un saldo negativo en el historial NO significa stock inflado: casi siempre es stock inicial que se cargó directo en `stock` sin movimiento (validado: SOLDADURA MIG, carga 30 = stock 29 − neto (−1)).
- Resultado consulta general: 401 combinaciones con diferencias; 82 clase A (stock cuadra con regla del trigger; faltó registrar stock inicial/entradas) y 319 clase B. En B, desvio>0 = stock sin movimientos de respaldo (carga inicial); desvio<0 = stock MENOR al historial (anomalía real: POWER 5.5 TRIFASICO −3 und, RUEDA 5' tras corrección, POLEA ARRASTRE PLUMA LITEMIX −30, TEMPLETE INFERIOR −35, POLEA 8 X 2B −6, TRINQUETE PEQUEÑO −9, LACA ROJO −1, VISOR CARETA ESMERIL −3).
- CORRECCIÓN: la RUEDA 5' ALMACEN pudo tener ~149 und de stock inicial no registradas; al ponerla en 93 (opción B) puede haber quedado subestimada. Pendiente conteo físico.
- NO aplicar recálculo masivo por SQL: borraría stock inicial real. Corrección correcta = conteo físico + Inventario Físico (deja movimiento de ajuste).
- HIERRO COLADO / CARBÓN COKE / CARBÓN MOLIDO (FUNDICIÓN): historial muy negativo (compras/entradas no registradas por todos los caminos), tratar con el Balance de hierro.
- Script de auditoría vs carga inicial: `supabase/migraciones/2026-10-19_auditoria_stock_vs_carga_inicial_almacen.sql` (solo lectura).
- Pendiente propuesto: alerta/bloqueo en RegistrarMovimiento* si salida > stock disponible.

## 19/10/2026 — Auditoría de stock vs conteos físicos (Mecanizados / Fundición)
- Resultado: con la consulta corregida, el stock de las bodegas contadas cuadra con el último conteo confirmado + movimientos posteriores. Único caso: POLEA 2 1/2 X 2A (FUNDICIÓN), contado 0, stock 20 sin movimientos (el conteo INV-FIS-0033 mostró "Sistema: 0" por el error de paginación y no generó ajuste). Corregido con SAL-COR-261019-001 (salida de 20, ref INV-FIS-0033, costo 0).
- GOTCHA de relojes: `movimientos.created_at` guarda la hora de Bogotá etiquetada como UTC (default `NOW() AT TIME ZONE 'America/Bogota'` sobre timestamptz), mientras `inventarios_fisicos.created_at/updated_at` guardan UTC real. Para comparar entre tablas hay que sumar 5 horas a `movimientos.created_at`. Entre movimientos el orden es consistente.
- GOTCHA de comparación contra conteos: excluir los movimientos con `referencia` = número del inventario (ajustes ENT/SAL-AF y correcciones SAL-COR); ya están reflejados en "contado". Sin esto salen falsos descuadres.
- Pendiente: ALMACEN nunca se ha contado físicamente → correr auditoría vs carga inicial (`2026-10-19_auditoria_stock_vs_carga_inicial_almacen.sql`) y hacer conteo físico priorizado (POWER 5.5 TRIFASICO, LINGOTE ALUMINIO, rodamientos, motores). RUEDA 5' ALMACEN en 93 sin conteo.
- Pendiente: piezas fundidas que salen de Fundición sin entrada registrada (órdenes de moldeo sin cerrar en Recogida) → ligado al Balance de hierro y pago a moldeadores.

## 20/10/2026 — Inventario en fecha (CorteInventario.jsx) daba lo mismo que hoy
- Causas: (1) la consulta de movimientos posteriores al corte usaba `.limit(50000)` sin paginar ni ordenar: el servidor la recortaba a 1.000 filas arbitrarias, así que casi todos los movimientos posteriores NO se deshacían y el resultado salía ≈ stock de hoy. (2) El delta se acumulaba solo por producto (sin bodega) y el stock se leía solo de la bodega "de origen" del producto: lo que estaba en otras bodegas (transferencias, mecanizados) se ignoraba. (3) Los traslados se ignoraban. (4) El corte comparaba `created_at` (hora de Bogotá mal etiquetada como UTC) contra un corte convertido a UTC → desfase de 5 h.
- Corrección: todo con `fetchAllPages` (items, movimientos posteriores, stock); cálculo por (producto, bodega) con las mismas reglas del trigger (entradas suman en destino, salidas restan en origen, traslado y ajuste); filtro de corte por `fecha_movimiento` (o fecha de created_at si no tiene) sin convertir zona horaria; `HOY` en hora Colombia; aviso cuando salen productos negativos en esa fecha (salidas registradas antes que su entrada); el banner muestra cuántos movimientos posteriores se deshicieron.
- Límite conocido: el método parte del stock de hoy y deshace movimientos. Si el trigger aplicó el piso de 0 en algún momento (salida > saldo), el valor histórico puede quedar un poco por encima del real. Los conteos físicos son la referencia.
- Riesgo detectado (no tocado): hay consultas con `.limit(N)` mayor a 1.000 sin paginar (items en GestionItems, RegistrarMovimiento*, ListaPedidos, NoConformidades; InformeNomina, ListaFundidas). Solo fallan si esas tablas superan 1.000 filas; revisar el conteo de items.

## 20/10/2026 — Catálogo de productos cortado a 1.000 (1.561 items, 1.389 activos)
- Problema: el servidor de Supabase corta cada consulta a 1.000 filas aunque el código pida `.limit(10000)`. El catálogo ya pasa de 1.500 productos, así que las pantallas que traían items SIN filtrar por bodega mostraban solo los primeros 1.000 por orden alfabético (el resto no aparecía para seleccionar/gestionar).
- Corregido con `fetchAllPages` (orden estable por nombre + id): GestionItems (admin), RegistrarMovimiento (ADMIN/sin bodega fija), ListaPedidos (catálogo de pedidos), NoConformidades, operario/Dashboard, y RegistrarMovimientoAlmacenista (3 consultas por bodega).
- Se dejó igual: GestionProductos (ya trae 2 páginas de 1.000 → cubre hasta 2.000; migrar a fetchAllPages si el catálogo crece), RegistroMecanizado, GestionPaquetes, CrearOrdenMoldeo, GestionBOM (filtran por una sola bodega; revisar si alguna bodega supera 1.000 items).
- Regla: toda consulta que pueda superar 1.000 filas debe usar fetchAllPages; `.limit(N)` no sirve.
- Conteo de items activos por bodega (20/10/2026): ALMACEN 706, MECANIZADOS 379, FUNDICIÓN 213, FERRETERIA 45, MOTORES 29, CORTE Y DOBLEZ 17 (total 1.389). Ninguna bodega supera 1.000, así que las pantallas que cargan una sola bodega (RegistroMecanizado, GestionPaquetes, CrearOrdenMoldeo, GestionBOM) no están afectadas. Revisar si ALMACEN se acerca a 1.000.

## 21/10/2026 — Caso RESORTES DE RANA (ALMACEN): stock inflado por orden de registro, y causa del "piso de 0"
- Carga inicial 322. Historial: entradas 100 (24/08) y 100 (03/09); el 09/09 se registraron 3 salidas seguidas (SAL-MG-0087/0088/0089 = 207+207+208 = 622) ANTES de la entrada MOV-MG-0056 (+200) del mismo día; luego +200 (30/09), −60 y −50 (07/10, sin referencia ni OF). Según el historial deberían quedar 190; el sistema muestra 290 porque el trigger no baja de 0 (se "comió" 100 unidades al registrarse la salida antes que la entrada). Dicen que físicamente hay ~50 (pendiente conteo).
- Hipótesis general: el 09/09 se registró en lote mucho consumo antes de las entradas del mismo día; muchos productos de ALMACEN tienen su primer saldo negativo el 2026-09-09 (RODAMIENTOS, CAUCHOS/BUJE DE RANA, CHUMACERAS, RESORTES DE RANA...). Por eso la auditoría contra carga inicial (v2) calcula `perdido_por_piso` = MAX(0, inicial implícito − carga inicial) y `stock_segun_historial` = carga + neto.
- Pendiente: conteo físico de RESORTES DE RANA; preguntar al almacenista por las salidas del 09/09 y las del 07/10 (sin OF ni destino); evaluar hacer obligatorio referencia/OF/destino en salidas de material.

## 22/10/2026 — Pedido recibido por el operario seguía "En tránsito" (PED-0151)
- Síntoma: el operario de corte pulsaba "Recibido + Entrada": la entrada de inventario (MOV-CP-0015) quedaba registrada pero el pedido seguía En tránsito.
- Causa: la política RLS UPDATE de `pedidos` ("marcar recibido") solo permite ADMIN, LOGISTICA, ALMACENISTA, JEFE_AREA, JEFE_FABRICACION y JEFE_FUNDICION. OPERARIO / JEFE_MECANIZADOS (aunque sean el solicitante) no podían actualizar `pedidos`; un UPDATE bloqueado por RLS no da error (0 filas), y el código no lo verificaba: la pantalla se actualizaba en local, se creaba la entrada y se escribía el historial. `pedido_items` tiene política ALL para autenticados, por eso las cantidades sí se guardaban.
- También afectaba cerrar y editar pedidos del propio solicitante (cerrar parecía funcionar y no cerraba; editar cambiaba los productos pero no observaciones/prioridad).
- Cambio en BD (manual): `supabase/migraciones/2026-10-22_pedidos_update_solicitante.sql` (política UPDATE para el solicitante, sin reabrir cerrados).
- Cambio en app (`ListaPedidos.jsx`): `confirmarRecibido` actualiza primero `pedidos` verificando con `.select('id')` que se modificó una fila; si no, muestra error y NO crea la entrada. Igual verificación en `cerrarPedido` y `guardarEdicion`.
- Regla: tras un UPDATE bajo RLS verificar filas afectadas (`.select()` y revisar longitud), no solo `error`.

## 2026-10-22 — Números de pedido duplicados (PED-0151) y numeración correlativa

- **Síntoma:** dos pedidos distintos con `numero = 'PED-0151'` (Mateo Giraldo, cerrado, y Camilo Perales, en tránsito). Un `UPDATE … WHERE numero='PED-0151'` falló con 21000.
- **Causa:** `generarNumero()` calculaba `count(*) + 1`; al borrarse un pedido el conteo quedó atrás y repitió un número. `pedidos.numero` no tiene UNIQUE.
- **Fix:** nuevo `src/utils/siguienteNumero.js` (MAYOR sufijo + 1, con `fetchAllPages`). Usado en pedidos (PED), órdenes de compra (OC) y no conformidades (NC). Si falla se muestra error y no se crea el registro.
- **Datos:** `supabase/migraciones/2026-10-22_corregir_ped_0151_duplicado.sql` (opera por id: marca recibido el pedido de Camilo `b9cccc2f-…` y lo renumera). El pedido `773f1040-…` no se toca.
- **Pendiente:** correr PASO 0 del SQL; si no hay más duplicados, crear `UNIQUE (numero)` en `pedidos` (y revisar `ordenes_compra`, `no_conformidades`).
- **Gotcha:** nunca operar pedidos por `numero` mientras no exista el UNIQUE; usar `id`.

### 2026-10-22 — Renumeración ejecutada (11 pedidos con número repetido)
Pedido de Camilo `b9cccc2f-…` marcado `recibido` (22/10/2026); sus líneas ya estaban completas (el UPDATE de `pedidos` era lo que bloqueaba el RLS). Renumerados (id → número nuevo; entre paréntesis el número viejo):
- daccd628 → PED-0194 (PED-0001, 08/08, 48 líneas) · 63920aeb → PED-0195 (PED-0063) · 8f5f58fb → PED-0196 (PED-0063, Camilo, en tránsito)
- 744eb42b → PED-0197 (PED-0064) · e088edaf → PED-0198 (PED-0065) · 88ef1cce → PED-0199 (PED-0064)
- 3de56965 → PED-0200 (PED-0065) · b5841ca0 → PED-0201 (PED-0066) · ce5f1e87 → PED-0202 (PED-0070, Camilo, en tránsito)
- 6f1e418e → PED-0203 (PED-0080) · b9cccc2f → PED-0204 (PED-0151, Camilo, OC-0032)
El más antiguo de cada grupo conservó su número. Siguiente número libre: PED-0205.

### 2026-10-22 — Pedidos atascados en "en tránsito" y entradas dobles
- Por el mismo fallo RLS, pedidos ya recibidos seguían "en tránsito" (PED-0196, 0070, 0202, 0085, 0162, 0066, 0204). Se marcaron `recibido` por SQL (por id) tras comprobar que `cantidad_recibida` = `cantidad` en todas sus líneas. Los parciales (0100, 0101, 0110, 0137, 0145, 0173) estaban bien.
- **PED-0066 (William, Mecanizados): entrada registrada dos veces el 16/09/2026 10:00:42 y 10:00:43** (11 líneas, doble clic/doble envío). Se revirtieron las 11 repetidas por SQL (misma lógica que `revertir()` de Historial: salida `REVERSIÓN MOV-WA-00xx` + `revertido=true`, a nombre de Angie). Efecto en stock (con piso 0): PLUMA LITE 11→1, PLUMA 300KG 10→0, PIÑON ATAQUE 2B 5→0; el resto ya estaba en 0. Esos 3 requieren conteo físico en Mecanizados.
- **PED-0112 (Camilo): LAMINA CALIBRE 12 con 2 entradas de 10 (MOV-CP-0003 el 13/10 y MOV-CP-0013 el 14/10) para 10 pedidas.** Camilo confirmó que repitió la recepción porque el pedido no cambiaba de estado. MOV-CP-0013 revertida por SQL (22/10/2026); stock Corte y Doblez 119 → 109; PED-0112 marcado `recibido`.
- `confirmarRecibido` ahora tiene guarda síncrona con `useRef` contra doble clic.
- Pendiente: `generarNumero()` de movimientos en `Historial.jsx` (reversiones) también es count+1; `movimientos.numero` no es único. Revisar si conviene `siguienteNumero`.

### 2026-10-22 — Mecanizado: "No existe el producto destino …" (jefe de Mecanizados)
- **Regla de la app:** `RegistroMecanizado.jsx` busca el destino como `<nombre del origen> - MECANIZADO` en la categoría de productos mecanizados (`bff5d482-…`), comparando sin espacios/tildes. Si el nombre del origen difiere en una letra, no lo encuentra.
- **Casos corregidos por SQL (por id):**
  - Orígenes con palabra repetida: `TUBO DE OLLA 2B 2 B (…X440MM)` → `TUBO DE OLLA 2B (…X440MM)`; `TUBO REGLA REGLA TIPO ESCALERA (…X225MM)` → `TUBO REGLA TIPO ESCALERA (…X225MM)`.
  - Destino sin sufijo: `POLEA RADIADA 10 X 2B MANZANA 4"` (cat. mecanizados, id e7cc8c34-…) → agregado ` - MECANIZADO`.
  - 6 orígenes con stock en MECANIZADOS sin par destino: se crearon `PIÑON CORONA ANDAMIO MACIZO`, `POLEA RADIADA 10 X 2B / 12 X 2B / 14 X 2B MANZANA 2"`, `18 X 2B MANZANA 2 1/2"`, `20 X 2B MANZANA 3 1/2"` + ` - MECANIZADO` (copiando categoría/bodega/unidad/centro de costo de un destino existente; `precio_costo` y `stock_minimo` = 0 → revisar costo).
- **Auditoría de nombres (SQL de control):** destinos sin origen y orígenes con stock en MECANIZADOS sin destino → ahora 0 filas. Repetir cada vez que se cree un producto nuevo a mecanizar.
- **Pendiente:** mensaje de error más claro / crear el destino desde la pantalla; `numeroMec` (MEC-XXXX) sigue siendo count+1 de movimientos MEC-%.

### 2026-10-22 — Inventario Físico con fecha de conteo anterior a hoy
- **Problema:** `InventarioFisico.jsx` comparaba el conteo contra el stock de HOY aunque la "Fecha del conteo" fuera anterior; al aplicar, el stock quedaba = conteo viejo y se perdían los movimientos posteriores (ej.: conteo de lámina del 03/10 cargado el 22/10).
- **Cambio:** si `fecha < hoy`, el conteo se asume hecho a PRIMERA HORA de esa fecha (decisión de Angie): la columna *Sistema* = stock actual − efecto neto de movimientos con `fecha_movimiento >= fecha` (o sin fecha y `created_at >= fechaT00:00:00`), es decir, los movimientos de ese mismo día y posteriores se suman después del conteo. Reglas del trigger iguales a `CorteInventario`. La diferencia = físico − sistema al corte. El movimiento de ajuste queda con `fecha_movimiento = fecha del conteo` y motivo "(conteo del AAAA-MM-DD)". El stock actual queda = conteo + movimientos posteriores (el trigger aplica la diferencia al stock de hoy).
- **UI:** banner azul con cuántos movimientos se deshacen, aviso ámbar si hay productos con salidas por encima del stock a esa fecha (Sistema = 0), botón "Aplicar" deshabilitado mientras calcula, y en el modal columna "Hoy: antes → quedará". `guardarBorrador` ahora también guarda `fecha`.
- **Límite conocido:** si el conteo en realidad se hizo a media o a última hora del día, los movimientos previos al conteo ese mismo día se sumarán de más. Un conteo con fecha de HOY se toma contra el stock actual (como antes). El piso en 0 del trigger puede dejar diferencias pequeñas si hubo salidas mayores al stock. Ojo: el ajuste queda fechado en la fecha del conteo, pero `CorteInventario` de esa misma fecha lo incluye (corte al cierre del día).
- **Gotcha:** `rows[].cantidad_sistema` ahora se deriva en `itemsConCalculo` (las filas guardan `stock_hoy`). Los borradores viejos con fecha pasada se tratan como conteo pasado: revisar la fecha al reabrirlos.

### 2026-10-22 — INV-FIS-0034 (láminas, Corte y Doblez, conteo del 03/10) corregido
- Se confirmó el 22/10 (16:30 Bogotá) con la lógica ANTERIOR: Sistema = stock de hoy y stock final = conteo, así que se borraron los movimientos del 03/10 en adelante.
- Corrección por SQL: 8 entradas `ENT-AF-0424…0431` (referencia `INV-FIS-0034`, fecha 22/10/2026) = conteo + movimientos netos desde el 03/10 (excluyendo los ajustes del propio inventario) − stock de hoy: +18 (1/4 4X8), +10 (1/8 120X600), +20 (2,5 120X3), +3 (3/16 120X600), +26 (4 MM 120X600), +2 (4MM 4X8), +70 (CAL 12 120X600), +180 (CAL 18 4X8). Supuesto de Angie: el conteo se hizo a primera hora del 03/10.
- Los ajustes originales (13 movimientos SAL-AF-0163…0173 y ENT-AF-0422/0423) y las 8 correcciones quedaron fechados el 22/10, por lo que "Inventario en fecha" del 03/10 no mostraba el conteo (mostraba el stock del sistema previo al conteo). Se pusieron los 21 movimientos con `referencia = 'INV-FIS-0034'` en `fecha_movimiento = 2026-10-03`: el neto de cada par ajuste+corrección es exactamente conteo − sistema al inicio del 03/10. Con el módulo nuevo (push 22/10) los conteos con fecha pasada ya se fechan solos en el día del conteo.

### 2026-10-25 — Renombrar bodegas/categorías sin romper la lógica
- **Regla:** la lógica de la app reconoce Fundición y Mecanizados por ID (`src/utils/bodegasCatalogo.js`: `BODEGA_FUNDICION_ID`, `BODEGA_MECANIZADOS_ID`, `CAT_PRODUCTO_MECANIZADO_ID`, `esBodegaFundicion()`, `esBodegaMecanizados()`), nunca por nombre. Los textos guardados (`centro_costo`, `destino`, `bodega_nombre`) son solo informativos; al escribirlos se usa el nombre vivo (`nombreBodega(id)`). Las políticas RLS usan roles (`get_my_rol()`) y `bodega_id`, no nombres.
- **Trigger en BD (`supabase/migraciones/2026-10-25_sincronizar_nombre_bodega.sql`):** al renombrar una bodega actualiza `items.centro_costo`, `movimientos.centro_costo/destino`, `no_conformidades.bodega_nombre` e `inventario_fisico_items.bodega_nombre`. Falta confirmar que se ejecutó ("Success") y correr la prueba con rollback.
- **Pendiente:** `InformeVentasInternasFundicion.jsx` (línea ~46) todavía filtra bodegas con `esFundicion(nombre)`; pasar a ID si solo hay una bodega de Fundición. Renombrar categorías: las categorías se referencian por id (p. ej. `bff5d482-…` mecanizados); revisar que no queden comparaciones por nombre.

### 2026-10-25 — Revisión de LINGOTE ALUMINIO (bodega ALMACEN)
- **Hallazgo:** stock actual 2.358 kg = entradas desde el 07/09 (504+548+629+757 = 2.438) − 80 de la única salida posterior. Las 5 salidas de agosto (13–31/08: 192, 206, 189, 200, 150 = 937 kg) se registraron con el stock en 0 y el trigger (piso `GREATEST(0, …)`) no restó nada: ese lingote existía físicamente pero nunca fue cargado como inventario.
- **Consumo no registrado:** desde el 09/09 no hay salidas. Ritmo de agosto ≈ 49 kg/día; entradas desde 07/09 ≈ 58 kg/día. Si el consumo siguió igual, el stock real sería una fracción de 2.358 kg (≈ $24.759.000 a $10.500/kg potencialmente sobrevalorados). Estimación, falta conteo físico.
- **Trazabilidad:** todas las entradas son de BRAYAN ALUMINIO, sin pedido/OC; las salidas (todas de Mateo Giraldo, SAL-MG) no tienen destino, motivo ni OF. SAL-MG-0056 (fecha 20/08) se registró el 26/08.
- **No hay flujo de consumo de aluminio en la app:** no existe ítem de lingote de aluminio en Fundición; las piezas de aluminio (LINGOTE RECTANGULAR PANADERIA, etc.), CHICHARRON ALUMINIO y PASTILLA ALUMINIO tienen 0 movimientos. El ítem `ALUMINIO` (ALMACEN, 661,9 kg) tiene 1 movimiento del 30/08 (carga inicial): por confirmar si es el mismo material con otro nombre.
- **Pendiente:** conteo físico de LINGOTE ALUMINIO y ALUMINIO (almacén + patio/fundición) y ajuste por Inventario Físico con acta firmada; definir cómo se registra el consumo (salida con destino/OF obligatorios, o descuento automático al registrar fundida de aluminio por peso de pieza + merma); costo de piezas de aluminio de sep–oct sin material cargado.

### 2026-10-26 — Consecutivos por conteo de filas que quedaban (mismo bug que PED-0151)
- **Hallazgo:** tres pantallas seguían numerando con "cantidad de filas + 1", que repite números en cuanto se borra una fila (el mismo error que duplicó PED-0151):
  - `Historial.jsx` → `generarNumero()` de las reversiones contaba TODOS los movimientos (de cualquier prefijo) → `MOV-NNNN`. Como Historial permite eliminar movimientos, cada eliminación hacía que la siguiente reversión repitiera un número ya usado.
  - `RegistroMecanizado.jsx` → `MEC-NNNN` contaba filas con `MEC-%`, pero cada registro inserta varias filas con el mismo número: los consecutivos saltaban (MEC-0001, MEC-0007…) y, si se eliminaban filas, podía repetirse uno existente.
  - `InventarioFisico.jsx` → `INV-FIS-NNNN` contaba inventarios; repite si alguno se borra (hoy solo por SQL).
- **Corrección:** las tres usan `siguienteNumero()` (max+1). `movimientos.numero` e `inventarios_fisicos.numero` NO tienen UNIQUE en BD, así que duplicados históricos no se detectan solos.
- **Pendiente:**
  - Revisar en Supabase si ya hay duplicados: `select numero, count(distinct created_at) from movimientos where numero ~ '^(MOV|MEC)-[0-9]+$' group by numero having count(distinct created_at) > 1;` (MEC repite número por diseño dentro de un mismo registro).
  - Los generadores con iniciales (`ENT-XX-`, `SAL-XX-`, `TRF-`, `MOV-XX-`) toman el último con `order('numero', desc)` por texto: al pasar de `-9999` a `-10000` el orden de texto deja `9999` como "mayor" y se repetiría `-10000`. No urge hoy; migrar a `siguienteNumero()` o a una secuencia en BD antes de llegar ahí.
  - Dos usuarios guardando al mismo segundo pueden sacar el mismo número (se calcula en el navegador). La solución de fondo es una secuencia/función en Postgres.

### 2026-10-26 — Diseño limpio (igual al de la app de OF, inspirado en Linear)
- Colores nuevos en `tailwind.config.js` (los mismos de la app de OF): `feisen-fondo`, `feisen-borde`, `feisen-borde-suave`, `feisen-texto`, `feisen-texto-2`, `feisen-azul-suave`, `feisen-rojo-suave`. Fondo general `#F7F8FA`.
- Menú lateral compacto (ítem activo en azul suave, sin bloque azul fuerte), iniciales del usuario y rol en texto. Ítems con `grupo` se muestran bajo un título: **Catálogos** (Paquetes, Configuración) para Admin y **Fundición** (Fundidas, Moldeo, Recogida, Nómina, Analítica, BOM) para Jefe de Fundición. Para agrupar un ítem nuevo basta agregarle `grupo: '<Título>'` en `Layout.jsx`.
- En todas las pantallas: tarjetas blancas con borde fino `border-feisen-borde` y `rounded-xl` en vez de sombra (`shadow-sm`); bordes de inputs `border-gray-300` → `border-feisen-borde`. Modal y Alerta con bordes y fondos suaves. Para pantallas nuevas seguir ese patrón: `bg-white rounded-xl border border-feisen-borde`.
- Para revisar el diseño sin iniciar sesión: `vite.demo.config.mjs` (fuera de git, en `.git/info/exclude`) usa un Supabase falso; `?rol=ADMIN|JEFE_FUNDICION|ALMACENISTA…` en la URL cambia el rol.

## Módulo: Recursos Humanos — Fase 1: fichas de colaborador (2026-10-26)

Inspirado en la ficha de colaborador de Buk. Pedido por Angie para que la coordinadora de RRHH maneje su
trabajo desde la app; se construye por fases ("sobre la marcha").

- **Rol nuevo `RRHH`** (label "Recursos Humanos", fila en tabla `roles`). Este rol SOLO ve el módulo de
  personas (`/rrhh/empleados`), sin inventario. ADMIN también lo ve en su menú ("Colaboradores") y puede usar
  "Ver como Recursos Humanos" en la vista previa. Para la coordinadora: crear su usuario en Configuración →
  Usuarios con rol RRHH (no necesita bodegas).
- **Tablas:** `empleados` (una fila por persona; datos personales, laborales, seguridad social, pago,
  emergencia, tallas de dotación, `foto_path`, `jefe_id` autorreferencia, `usuario_id` opcional para un
  futuro autoservicio) y `empleado_documentos` (adjuntos por tipo). Código `EMP-0001` con `siguienteNumero`
  (max+1). `numero_documento` es UNIQUE. No se borran empleados: se marcan `estado='retirado'` con fecha y
  motivo (como en Buk).
- **Seguridad:** RLS en ambas tablas y en el bucket → solo `ADMIN` y `RRHH`. El bucket `rrhh` es **privado**
  (salarios, cédulas, contratos): siempre `createSignedUrl(s)`, nunca `getPublicUrl` (a diferencia del bucket
  `remisiones`, que es público).
- **Fechas DATE:** se parsean como fecha local en `catalogosRRHH.js` (`new Date('YYYY-MM-DD')` las toma en
  UTC y en Colombia muestra el día anterior).
- **Alertas:** contratos con `fecha_fin_contrato` a ≤45 días (o vencidos) se listan arriba en el listado y
  en el encabezado de la ficha.
- Catálogos (áreas, tipos de contrato, tipos de documento adjunto…) están fijos en
  `src/components/rrhh/catalogosRRHH.js`; si la coordinadora necesita editarlos, pasarlos a tablas.
- Migración: `supabase/migraciones/2026-10-26_rrhh_empleados.sql` (correr a mano en SQL Editor).
- **Rediseño estilo Buk (2026-10-26, pedido de Angie):** ficha con franja de color y foto grande, datos
  rápidos, menú lateral de secciones y tarjetas que se editan por separado. Se quitó "Profesión" de la vista
  (la columna `profesion` sigue en la base, sin uso) y "Contacto de emergencia" pasó a ser una tarjeta dentro
  de Información personal (ya no es pestaña aparte). Listado en tabla con encabezados.
- **Foto:** botón "Subir foto" visible en la ficha y opcional al crear el colaborador. Se reduce a máx.
  800 px JPEG en el navegador antes de subirla (`subirFotoEmpleado` en `catalogosRRHH.js`); si el navegador
  no puede leer el formato (p. ej. HEIC en Chrome) se sube el original.
- **Tipos de contrato de Feisen (definidos por Angie, 2026-10-26):** `Indefinido`, `Término fijo` (con
  `duracion_meses`; la fecha fin se sugiere = ingreso + N meses − 1 día, con tope al último día del mes, y es
  editable por prórrogas) y `Contratista`, que lleva `tipo_vinculacion`: `destajo` (pago por piezas) o `dia`
  (pago por días trabajados). `salario_base` se muestra como "Salario / honorarios" (para "al día" = valor
  del día). Se quitó el auxilio de transporte de la ficha (columna sin uso). Los valores de la fase 1
  ('Término indefinido', 'Obra o labor', etc.) se migraron en `2026-10-26_rrhh_tipos_contrato.sql`.
- **Certificación bancaria en Pago (2026-10-26):** tarjeta en la sección Pago que muestra la más reciente de
  `empleado_documentos` con `tipo='Certificación bancaria'` (sin tabla nueva). "Reemplazar" sube una nueva; las
  anteriores quedan como historial en la pestaña Documentos.
- **Checklist de documentos (2026-10-26, definido por Angie):** la pestaña Documentos muestra 10 documentos
  de ingreso (`DOCUMENTOS_REQUERIDOS` en `catalogosRRHH.js`) con estado entregado/pendiente y barra "X de 10".
  Un ítem cuenta como entregado si hay al menos un archivo con ese `tipo` (se permiten varios: p. ej. EPS,
  AFP, ARL y Caja en "Certificados de afiliación"). El resto (Otrosí, Hoja de vida, Certificación bancaria,
  Otro) va en "Otros documentos". Tipos de la fase 1 renombrados con
  `2026-10-26_rrhh_checklist_documentos.sql` (opcional: sin ella esos archivos solo salen en "Otros").
  Gotcha: el tipo del archivo a subir se guarda en un `useRef`, no en estado, porque se lee en el `onChange`
  del input de archivo compartido.
- **Estética limpia (2026-10-26, pedido de Angie):** el módulo sigue el estilo del menú lateral (Layout.jsx):
  sin franja de color ni bloques de color, íconos grises finos (`strokeWidth 1.8`), texto compacto, estados
  con punto de color, botones `rounded-lg` y el azul suave solo para lo activo. Las clases están centralizadas
  en `src/components/rrhh/estilos.js` (cambiar ahí cambia todo el módulo). En celular el menú de secciones de
  la ficha es horizontal y se desplaza solo hasta la sección activa.
- **Organigrama por cargos (2026-10-26, pedido de Angie):** tabla `cargos` (puestos de trabajo) con
  `cargo_padre_id` (a quién reporta) y `plazas`; el organigrama se dibuja con cargos, no con personas, para
  ver vacantes. Cada cargo tiene perfil requerido, asignación salarial (rango min–max), manual de funciones
  (lista + PDF en `cargos/{id}/` del bucket rrhh), criterios de evaluación de desempeño con peso %, EPP,
  capacitación y herramientas a entregar; las listas son JSONB. Rutas `/rrhh/organigrama` (árbol / lista) y
  `/rrhh/organigrama/:id` (ficha del cargo). `empleados.cargo_id` enlaza al colaborador y el texto
  `empleados.cargo` se mantiene sincronizado con el nombre (al guardar la ficha y al renombrar el cargo).
  La migración `2026-10-26_rrhh_cargos_organigrama.sql` crea los cargos que ya existían como texto.
  Un cargo solo se elimina sin personas ni cargos que le reporten; "Reporta a" excluye al propio cargo y
  a sus subordinados (evita ciclos). Las tarjetas editables (`Bloque`, `CampoEditable`, listas) viven en
  `FichaComun.jsx` y las usan la ficha del colaborador y la del cargo.
  **Pendiente:** la evaluación de desempeño solo define criterios por cargo; falta registrar las
  evaluaciones por persona, y las entregas reales de EPP/herramientas (con firma) por colaborador.
- **Áreas (2026-10-26):** 'Almacén' y 'Logística' se unieron en 'Almacén y Logística' y se quitó 'Calidad'
  (no existe por ahora). Solo afecta el área de RRHH, no bodegas ni roles. Migración
  `2026-10-26_rrhh_areas_almacen_logistica.sql`. Los selects de la ficha muestran igual un valor guardado
  que ya no está en el catálogo ("ya no está en la lista") para no perderlo al editar.
- **Registro de novedades (2026-10-26, pedido de Angie):** tablas `novedades` (tipo incapacidad / permiso /
  vacaciones / licencia + subtipo, fechas, días u horas, remunerado, y para incapacidades entidad, número,
  diagnóstico y prórroga) y `novedad_soportes` (archivos en `novedades/{id}/` del bucket rrhh). Código
  NOV-0001. Página `/rrhh/novedades` con filtros por persona, tipo, vinculación (contrato + modalidad del
  contratista, `vinculacionDe()`) y periodo; indicadores (ausentes hoy, días por tipo, sin soporte), vista
  "Por persona" y exportación a Excel (`exportarNovedades`). También pestaña "Novedades" en la ficha.
  Días sugeridos: vacaciones en días **hábiles lunes a viernes sin festivos de Colombia** (antes lunes a sábado; cambiado el 2026-10-26)
  (`festivosColombia()` calcula fijos, Ley Emiliani y los de Pascua; verificado contra el calendario 2026);
  el resto en días calendario. Siempre editables. Sábado: no es hábil en Feisen (confirmado 2026-10-26). Una novedad que cruza el borde del periodo filtrado cuenta todos sus días.
  Incapacidades y licencias se marcan "sin soporte" mientras no tengan archivo.
  **Ideas siguientes:** saldo de vacaciones por persona (15 días hábiles por año trabajado − disfrutadas),
  aprobación de permisos por el jefe, y que el colaborador solicite desde su usuario.
- **Calendario RRHH (2026-10-26, pedido de Angie):** `/rrhh/calendario`, vista mensual (lunes a domingo)
  con capas que se prenden/apagan: novedades, cumpleaños y fin de contrato; festivos de Colombia marcados.
  Panel lateral con el detalle del día (clic en una novedad la abre para editar; "+ Novedad" registra en
  ese día) y próximos cumpleaños (30 días). En Colaboradores hay un recordatorio de los cumpleaños de los
  próximos 7 días. Sin tablas nuevas: usa `empleados.fecha_nacimiento`, `fecha_fin_contrato` y `novedades`.
  Nacidos un 29-feb celebran el 28 en años no bisiestos (`cumpleEnAnio`). Si una ficha no tiene fecha de
  nacimiento, no aparece.
- **Festivos de Colombia (2026-10-26, pedido de Angie):** `festivosColombia(anio)` devuelve un Map fecha →
  nombre (18 festivos; verificado 2026). El calendario muestra el nombre en cada día y la lista de festivos
  del mes. En el formulario de novedades se avisa qué festivos caen en las fechas y si se cuentan o no.
  Conteo: vacaciones y licencia de **luto** (Ley 1280/2009, 5 días hábiles) en días hábiles lunes–viernes sin
  domingos ni festivos (`conteoNovedad`); incapacidades, maternidad/paternidad y el resto en días calendario.
- **Preaviso de contratos a término fijo (2026-10-26, pedido de Angie):** recordatorio 35 días antes del
  vencimiento (`DIAS_RECORDATORIO_PREAVISO`); el plazo legal para el preaviso de no prórroga es 30 días antes
  (CST art. 46, `DIAS_PREAVISO_LEGAL`). Se ve en el calendario (evento "Preaviso" y lista "Preavisos por
  dar" con los días que quedan hasta el plazo), en "Contratos que vencen pronto" de Colaboradores y en el
  encabezado de la ficha. Se calcula con `fecha_fin_contrato`: si el contrato se prorroga, basta con
  actualizar esa fecha. **No hay forma de marcar "preaviso entregado"**; el recordatorio sigue hasta el
  vencimiento (posible mejora: guardar fecha de entrega y la carta como documento).
  **Resuelto el mismo día:** columnas `empleados.preaviso_fecha_entrega`, `preaviso_para_fin` (la fecha fin a
  la que corresponde) y `preaviso_documento_id` (carta en `empleado_documentos`, tipo 'Preaviso de no
  prórroga'). Se registra desde el encabezado de la ficha o desde "Preavisos por dar" en el calendario
  (`ModalPreaviso.jsx`); al registrarlo sale de pendientes. Si el contrato se prorroga y cambia la fecha fin,
  el registro deja de aplicar y el recordatorio vuelve para el nuevo vencimiento. Si la fecha de entrega es
  posterior al plazo legal se avisa (el contrato se entiende prorrogado). La carta es opcional al registrar
  ("falta la carta"). Migración `2026-10-26_rrhh_preaviso_entregado.sql`.
- **Nómina quincenal (2026-10-26, pedido de Angie; reemplaza el Excel "NOM 15 OCT.xlsx"):** el Excel tenía
  por quincena hojas "C" y "F" con bloques por grupo y columnas: 3 pares cantidad × valor, Otros, Dto. tiempo o
  pieza dañada, Subsidio a SS, Total devengado, Seguridad, Anticipo, Dotación/herramienta, Total a pagar y firma
  (había conceptos sumados a mano dentro de las fórmulas). Decisiones de Angie: (1) piezas de destajo
  **sugeridas desde producción y editables**; (2) "Subsidio a SS" = parte de la seguridad social que Feisen le
  reconoce al contratista (270.500 o 150.000) y "Seguridad" = la planilla que Feisen paga y le descuenta;
  (3) **sin deducciones de ley** (salud/pensión) ni auxilio de transporte legal — eso lo hace el contador;
  (4) en "al día" las otras columnas son horas extra × valor hora y un auxilio fijo por quincena (1 × 130.000).
  Modelo: `nomina_periodos` (quincena, borrador/cerrada), `nomina_liquidaciones` (una por persona, con totales
  guardados), `nomina_piezas`, `nomina_tarifas` (valor por pieza, por ítem — la pieza moldeada y la mecanizada
  son ítems distintos por la regla de un ítem por bodega) y `nomina_alias` (nombre escrito en producción →
  colaborador). Valores por persona en la ficha (Pago → "Valores para la nómina"). Forma de pago según
  contrato (`modalidadDe`): contratista destajo / contratista al día / resto fijo (por defecto la mitad del
  salario base). Producción: moldeo = `ordenes_moldeo_avances` (cantidad moldeada por fecha, moldeador en
  `ordenes_moldeo_piezas.asignado_a`); mecanizado = movimientos `entrada` con motivo "Mecanizado por: …"; las NC
  de recogida se muestran como referencia para el descuento. Emparejamiento de nombres: alias guardado o
  colaborador único que contenga todas las palabras.
  **Días laborales = lunes a viernes sin festivos** (`esDiaLaboral`): verificado contra todas las quincenas
  2026 del Excel (p. ej. 1–15 oct = 10, 16–30 sep = 11). Ojo: las vacaciones de Novedades siguen contando el
  sábado como hábil — **resuelto:** Angie confirmó que en Feisen no se trabaja el sábado; `diasHabiles` ahora es lunes a viernes sin festivos, igual que la nómina.
  Días sugeridos a los de "al día" = días laborales − días con novedad no remunerada. Excel de la planilla con
  una hoja por forma de pago + detalle de piezas (`exportarNominaQuincena`). Calculos verificados contra
  filas reales del Excel (Barboza 2.508.500/2.038.000; Benítez 1.859.700).
  La migración `2026-10-26_rrhh_nomina.sql` también da a RRHH permiso de LECTURA en items, ordenes_moldeo,
  ordenes_moldeo_piezas, ordenes_moldeo_avances, movimientos y bodegas (políticas permisivas adicionales).
  **Pendientes nómina:** desprendible de pago en PDF por persona, cargar el histórico 2026 del Excel, y
  revisar qué columnas usa la planilla real de "Fijo" (había valores sumados a mano en fórmulas).
- **Nómina: huellero, desprendible y destajo manual (2026-10-26, pedido de Angie):**
  • **Destajo manual:** se quitó la sugerencia de piezas desde producción (moldeo/mecanizado); RRHH ingresa las
    piezas y al escribir una pieza con tarifa el valor se llena solo. La migración
    `2026-10-26_rrhh_nomina_huellero.sql` borra las piezas de origen moldeo/mecanizado de quincenas en borrador
    y ajusta los totales guardados. Las políticas de lectura de producción para RRHH quedan sin uso.
  • **Huellero:** RRHH sube el archivo (Excel/CSV con "Nombre" y "Fecha/Hora"; el real trae el nombre recortado
    a ~14 letras, p. ej. "DAGOBERTO NEUT", y a veces la fecha como número de serie de Excel). Reglas de Angie:
    L–J 7:30–17:30, V 7:30–16:00; temprano y tarde cuentan; desde 15 min = 0,5 h redondeado a la media hora
    (`horasDeMinutos`, por tramo); sábado = extra normal; domingo/festivo = recargo 100 % (se paga al doble
    del valor hora, columna `horas_extra_recargo`). Marcas repetidas a <3 min se unen; un día con una sola
    marca queda "incompleto" (antes de 12:00 = entrada, si no = salida). El resultado se guarda como
    SUGERENCIA en `nomina_liquidaciones.huellero` (no cambia lo pagado); RRHH verifica autorización y usa
    "Aplicar horas extra" / "Usar N días". Nombres: `nomina_alias` ahora guarda nombres del huellero;
    emparejamiento automático si todas las palabras coinciden y la última puede venir recortada (único).
    CSV se lee con `raw: true` (si no, "01/10/2026" se interpretaba como 10 de enero).
  • **Hallazgo:** comparado con la columna manual de su archivo NOM15OCTU (365 días-persona), la regla dicha
    coincide en 167 y "solo medias horas completas hacia abajo" en 236; hay además turnos distintos (p. ej.
    12:45–21:00) y extras no autorizadas. Se implementó la regla dicha y Angie la confirmó (2026-10-26): desde 15 min = 0,5 h, redondeado a la media hora.
  • **Desprendible de pago** en PDF (`src/utils/desprendiblePagoPDF.js`): uno por persona desde la
    liquidación o todos los de la vista desde la planilla; logo/NIT reutilizados de `exportOrdenCompraPDF.js`.
- **"Servicios adicionales" para contratistas (2026-10-26, decisión de Angie):** a los contratistas (destajo y al
  día) la nómina, el desprendible y el Excel les dicen "servicios adicionales" en vez de "horas extra" y no
  mencionan "recargo" (`etiquetasPago`/`esContratista` en `nominaCalculo.js`); el personal fijo sigue con "horas
  extra". **Advertencia dada a Angie:** el nombre no cambia la naturaleza de la relación. Horario fijo, control
  con huellero, pago por días/horas, recargo dominical del 100 % y seguridad social pagada y descontada por
  Feisen son indicios de contrato realidad (art. 53 C.P., arts. 23–24 CST). Se le recomendó revisarlo con un
  abogado laboral (formalizar a quienes cumplen horario —el destajo es legal como salario por unidad de obra,
  art. 132 CST— o pactar con los contratistas por entregables, sin horario ni huellero).
- **Cambiar fechas de una nómina (2026-10-26):** en borrador, "Cambiar fechas" mueve la quincena a otro
  año/mes/quincena (`cambiarQuincena`): recalcula los días sugeridos de los de "al día", recalcula totales y
  borra la sugerencia y el archivo del huellero (eran de las fechas anteriores); piezas, valores y demás se
  conservan. Si se sube un huellero de otras fechas, la tarjeta dice de qué fechas es el archivo y ofrece
  mover la nómina a esa quincena y cargarlo de una vez. Motivo: Angie creó la nómina del 16–31 y su archivo
  era del 1–15.
- **Valor hora automático y aprobación con envío de desprendibles (2026-10-26, decisiones de Angie):**
  • Valor hora desde el valor del día (`valoresHora`, `HORAS_DIA = 8.4`): adicional = día ÷ 8,4 × 1,25 y
    domingo/festivo = día ÷ 8,4 × 2 (Angie: el 100 % es sobre la hora NORMAL), truncado a $100. Fórmula
    verificada en el Excel NOM: hasta la 1.ª quincena de julio 2026 dividían por 9; desde la 2.ª de julio por
    8,4 (42 h ÷ 5 días). Fijo: día = quincena ÷ 15. Se llena solo en la ficha y en la liquidación al cambiar
    el valor del día/fijo; siempre editable. Nueva columna `valor_hora_recargo` (empleados y liquidaciones);
    las liquidaciones viejas sin ella usan el doble de la hora adicional (`valorHoraRecargo`).
  • Flujo: borrador → cerrada (RRHH) → **aprobada (solo ADMIN, trigger `fn_nomina_periodo_aprobacion`)**. Al
    aprobar, la app genera el PDF de cada persona (~65 KB, logo con alias) y llama la Edge Function
    `enviar-desprendible` uno por uno; quedan `email_enviado_a/_en/_error` por liquidación, con "Enviar
    pendientes" y "Quitar aprobación". Correo = `email_corporativo` o `email_personal` de la ficha.
  • **Configuración pendiente (Angie / quien maneje el dominio):** crear cuenta en Resend, verificar el
    dominio feisen.com.co (registros DNS que da Resend), crear API key; en Supabase → Edge Functions →
    Secrets: `RESEND_API_KEY`, `NOMINA_REMITENTE` (p. ej. `Feisen Nómina <nomina@feisen.com.co>`) y opcional
    `NOMINA_RESPONDER_A`; desplegar la función `supabase/functions/enviar-desprendible/index.ts`
    (Dashboard → Edge Functions → nueva función con ese código, o `supabase functions deploy enviar-desprendible`).
    Migración `2026-10-26_rrhh_nomina_aprobacion.sql`.
- **RRHH maneja la bodega "Administración" y hace pedidos (2026-10-26, pedido de Angie):** categorías
  Dotación, Papelería y Aseo, creadas dentro de la bodega Administración (cada categoría pertenece a una bodega). El rol RRHH ahora tiene Productos, Movimiento (pantalla de
  almacenista), Historial y Pedidos, limitados a sus bodegas por `profile_bodegas` como los jefes de área;
  área de los pedidos = 'ADMINISTRACION'. Migración `2026-10-26_rrhh_bodega_administracion.sql`: crea la
  bodega y categorías si no existen (comparando sin tildes), asigna la bodega a los usuarios RRHH y agrega
  RRHH a las políticas de items por bodega (copiadas de `produccion_ensamble`). Si se crea otro usuario RRHH
  después, asignarle la bodega en Configuración → Usuarios.
- **Evaluación de desempeño (2026-10-26, inspirado en Buk):** `desempeno_ciclos` (periodo, peso objetivos vs
  competencias, autoevaluación opcional, escala 1–5 editable, competencias transversales) y
  `desempeno_evaluaciones` (una por persona, con "foto" de los ítems: criterios del cargo con peso +
  competencias transversales + del cargo; nota del evaluador y de autoevaluación; resultado ponderado,
  calibración con justificación, potencial, fortalezas/oportunidades, comentario del colaborador, plan de
  acción). Resultado = objetivos (promedio ponderado por peso) × % + competencias (promedio) × %; si una parte
  no tiene ítems, cuenta la otra completa; el resultado usa la nota del evaluador (la autoevaluación es
  referencia). Matriz de talento 9-box: desempeño (<60 % bajo, <80 % medio, ≥80 % alto) × potencial. Rutas
  `/rrhh/desempeno`, `/:cicloId`, `/:cicloId/:evalId`; pestaña "Desempeño" en la ficha con historial y
  evolución; Excel (`exportarDesempeno`). Las registra RRHH/ADMIN (los operarios no tienen usuario).
  **Ideas siguientes:** que los jefes evalúen desde su propio usuario, evaluación de pares/ascendente,
  objetivos individuales por persona, PDF de la evaluación para firmar.
- **Pendientes / próximas fases sugeridas:** historial de cambios de cargo y salario, familiares /
  beneficiarios, vacaciones y ausencias (incapacidades, permisos), carga masiva desde Excel, exportar
  listado a Excel, autoservicio del empleado (enlazando `usuario_id`).

### 2026-10-26 — Menú del Admin por módulos
- Decisión de Angie: el Admin navega por módulos desplegables en el menú lateral (no una pantalla de tarjetas). Arriba quedan Inicio y Analítica general; abajo, separada, Configuración.
- Reparto: **Inventarios** (Productos, Movimiento, Historial, Inventario físico, Kardex, Corte de inventario) · **Logística** (Pedidos, Órdenes de compra) · **Mecanizados** (Registro, Paquetes) · **Fundición** (Fundidas, Moldeo, Recogida, BOM, Nómina, Analítica, Balance de hierro, Ventas internas) · **Recursos Humanos** (Colaboradores) · **Calidad** (No conformidades). El grupo "Catálogos" desapareció.
- Cómo se arma (`Layout.jsx`): en `NAV_ADMIN` cada ítem lleva `modulo: '<Nombre>'` (el ícono del módulo está en `MODULOS`); `abajo: true` lo manda al final. Para sumar un submódulo nuevo basta agregar la línea con su `modulo`. Al entrar a una pantalla se abre solo su módulo.
- Ítem activo: coincidencia exacta, o subruta (`/fundidas/nueva`, `/rrhh/empleados/:id`) si ningún otro ítem coincide exacto — así `/analitica/fundicion` no marca también Analítica general.
- El hub `/reportes` (Informes) ya no está en el menú del Admin: sus informes quedaron repartidos en Inventarios y Fundición; la ruta sigue existiendo.

### 2026-10-26 — Acceso de Zaray Ariza (coordinadora RRHH) al módulo
- Síntoma: entraba a la app pero el módulo de RRHH le salía vacío. Las tablas de RRHH filtran por RLS (`get_my_rol()` IN ADMIN/RRHH) y, si el rol no coincide, devuelven 0 filas sin error.
- Se corrió `supabase/migraciones/2026-10-26_rrhh_acceso_zaray.sql`: su perfil (recursoshumanos@feisen.com.co) quedó con `rol = 'RRHH'`. El rol se lee al iniciar sesión: tiene que cerrar sesión y volver a entrar.
- Si aun así ve la lista vacía, revisar `SELECT count(*) FROM empleados` (si es 0, no hay colaboradores cargados todavía).

## Ensamble = planillas de producción y números de máquina (04/11/2026)

**Reemplaza** las órdenes de ensamble (OE) y las recetas del 26/10 (sección de abajo, que queda como
historia): Angie explicó el proceso real y las OE duplicaban las OF.

**Proceso real:** el jefe de planta ve las OF y reparte el trabajo; cada contratista llena una planilla de
papel (tarea + cantidad; en máquinas completas, el número de cada máquina) y el jefe la recibe y firma. A
veces entregan solo una parte (pedal, cabina…). RRHH usa la planilla para el destajo; ventas usa el número
de la máquina en la factura y para saber a quién se vendió y quién la hizo.

**Decisiones de Angie (04/11):** William (JEFE_ENSAMBLE) pasa la planilla a la app (los contratistas no
tienen usuario); la planilla **nunca** va contra una OF; las piezas sueltas **no** llevan número; el número
de máquina es un **consecutivo único de la empresa**; por ahora **no** mueve inventario.

- **Migración** `supabase/migraciones/2026-11-04_planillas_produccion.sql`: `planillas_produccion` (PP-0001,
  contratista = `empleados.id`, fecha → quincena), `planilla_lineas` (tarea = `nomina_tarifas.id` + copia del
  nombre, cantidad, `modelo` si es máquina completa, `liquidacion_id` cuando RRHH la carga) y
  `seriales_maquina` (serial único sin importar mayúsculas/espacios, modelo, quién la armó + copia
  `hecha_por`, estado disponible/despachada, `of_entrega_id` / `item_of_id`). Permisos con `mi_nivel`
  (`ensamble_puede()`, `rrhh_puede()`, `of_puede_crear()`).
- **William no lee `empleados` ni `nomina_tarifas`** (RLS de RRHH): usa `ensamble_contratistas()` y
  `ensamble_tareas()` (SECURITY DEFINER), que dan solo nombres — **los valores de las tarifas no salen de
  RRHH**. El valor se pone cuando RRHH carga las piezas.
- **Bloqueos:** una planilla no se edita ni se borra si alguna tarea ya está en nómina o alguna máquina ya se
  despachó (RLS; el borrado en cascada no pasa por RLS, por eso la política de la planilla lo revisa). Editar
  = borrar líneas y volverlas a crear (los seriales se recrean con el mismo número).
- **Nómina** (`LiquidacionPersona.jsx`): si el contratista tiene tareas de planillas de la quincena sin
  cargar, sale "Traer a las piezas": suma por tarea, pone el valor de la tarifa y `origen = 'planilla'` (se
  amplió el CHECK de `nomina_piezas.origen`). Al **guardar** la liquidación se marcan con
  `marcar_lineas_planilla()`; si no se guarda, siguen pendientes. Sigue siendo un paso manual de RRHH, en
  línea con la decisión del 26/10 de no sugerir piezas automáticamente.
- **Ventas** (`of/ModalEntrega.jsx`): al registrar una entrega se escogen los números despachados (primero los
  del mismo modelo que el producto de la OF; se puede buscar otros). Opcional y nunca más que la cantidad.
  Va por `asignar_seriales_entrega()`. `ModalReversarEntrega.jsx` deja escoger cuáles vuelven a planta
  (`liberar_seriales()`).
- **Pantallas:** `/ensamble` (planillas) y `/ensamble/seriales`; ventas ve la misma trazabilidad en
  `/of/seriales` ("Números de máquina"). El menú no la repite a quien la tiene en Ensamble.
- **Pendiente / a revisar con Angie:** la salida de Mecanizados a "Soldadura y Armado" crea entrada en la
  bodega ARMADO Y SOLDADURA (cambio del 26/10) pero ya nada la consume; al 04/11 no ha generado ninguna
  entrada (las piezas no están catalogadas allá). El primer número de máquina lo escribe William; desde ahí la
  app propone el siguiente.

## Módulo: Producción y Ensamble (26/10/2026)

Decisiones de Angie: el módulo maneja órdenes + inventario; las piezas que Mecanizados manda a
"Soldadura y Armado" entran con stock a la bodega de Ensamble; lo usa un rol nuevo `JEFE_ENSAMBLE`;
el avance se registra a diario y la orden se cierra a mano.

- **Migración** `supabase/migraciones/2026-10-26_produccion_ensamble.sql` (correrla a mano en el SQL
  Editor): rol `JEFE_ENSAMBLE` en `roles`; tablas `recetas_ensamble` (1 por máquina, `item_id` = la
  máquina terminada), `receta_ensamble_items` (componente + cantidad por máquina),
  `ordenes_ensamble` (OE-0001, estado abierta/cerrada/anulada) y `ordenes_ensamble_avances`
  (fecha, cantidad, `numero_salida`/`numero_entrada` de los movimientos que generó). RLS: todos leen;
  ADMIN y JEFE_ENSAMBLE administran; los avances solo se insertan (no se editan ni se borran porque ya
  movieron inventario). **Aplicada el 04/11/2026** con el conector de Supabase (la corrida manual no
  había quedado). Se le quitó la sección que re-creaba las políticas de `items`: en la base ya incluían
  JEFE_ENSAMBLE y además RRHH, y re-crearlas desde este archivo le habría quitado el permiso a RRHH.
- **Bodega de Ensamble**: `BODEGA_ENSAMBLE_ID = '7f0e4d7e-8c85-40d3-84c5-7857e26f624a'`
  ("Producción y Ensamble") en `utils/bodegasCatalogo.js`. El ID salió de este mismo archivo (sección de
  stock invisible); la migración trae un SELECT para confirmarlo.
- **Dónde entra la máquina terminada**: en la bodega del renglón de `items` elegido como máquina en la
  receta (no hay ID fijo de "Producto Terminado"). Cada componente se descuenta de la bodega de SU
  renglón de `items` (normalmente Ensamble, pero puede ser Almacén para motores/tornillería).
- **Avance diario** (`ensamble/ensambleDatos.js → registrarAvance`): valida stock de todos los
  componentes (bloquea si falta alguno), crea una salida `SAL-XX-nnnn` (tipo `salida`, un renglón por
  componente, `destino = "Ensamble OE-xxxx"`) y una entrada `REC-XX-nnnn` (tipo `entrada`) de las
  máquinas con `precio_costo_snapshot` = costo de materiales de la receta. Se hace desde el cliente con
  inserts sucesivos, igual que el resto de la app: si falla a mitad, el mensaje dice qué quedó creado.
- **Mecanizados → Soldadura y Armado** (`RegistrarMovimientoAlmacenista.jsx`): ahora crea la entrada
  pareada en la bodega de Ensamble, con el mismo emparejamiento por nombre que las transferencias
  internas de Fundición. Si la pieza no existe en el catálogo de Ensamble, solo se registra la salida y
  sale el aviso amarillo "Sin entrada en…" — **hay que crear en Ensamble los renglones de las piezas
  mecanizadas** (mismo nombre) para que su stock suba allá.
- **Pantallas**: `/ensamble` (órdenes + avance) y `/ensamble/recetas`; ADMIN las ve en el menú
  "Producción y Ensamble". JEFE_ENSAMBLE: Inicio, Ensamble, Recetas, Productos, Historial, Movimiento,
  Pedidos (área `PRODUCCION`, igual que OPERARIO) y Calidad.
- **Usuario**: William Roa tiene rol JEFE_ENSAMBLE y la bodega ARMADO Y SOLDADURA (así se llama hoy la
  bodega `7f0e4d7e…`). No existe bodega de "Producto Terminado": las máquinas entran a la bodega del renglón
  que se elija como máquina en la receta.
- **Pendientes**: (3) catalogar en Ensamble las piezas que llegan de
  Mecanizados y las máquinas terminadas; (4) cargar las recetas reales. Sin reversa de avances por ahora:
  un avance equivocado se corrige con un movimiento manual de ajuste.
- **Demo local** sin tocar la base: `vite.ensamble-demo.config.mjs` (fuera de git, en
  `.git/info/exclude`) con un Supabase falso en el scratchpad de la sesión. El navegador del panel solo
  llega por `http://[::1]:5177` (Vite escucha en IPv6).

## 2026-10-27 — Rol CONSULTOR (usuario Ventas): stock e historial solo de MOTORES
- Usuario `ventas@feisen.com.co` (y Leidy Franco) tienen rol **CONSULTOR** con bodega asignada MOTORES. No existe un rol "VENTAS".
- La RLS deja a CONSULTOR leer todo el stock/movimientos: la restricción por bodega es **solo en el front** (`bodegasPermitidas`).
- Causa de "ve todos los productos": con el modo "ver como" del ADMIN, `bodegasPermitidas` es null (admin) y la vista de consultor mostraba todo. Ahora `src/components/consultor/useBodegasConsulta.js` usa MOTORES en ese caso.
- Vista de stock con búsqueda, filtro por categoría y "solo con existencias"; cada producto enlaza a su historial.
- CONSULTOR ahora tiene **Historial** (solo lectura, sin precios): movimientos que entran/salen de sus bodegas y selector de productos solo de esas bodegas.
- Decidido (Angie, 2026-10-27): CONSULTOR **no** tiene Pedidos. Solo Stock + Historial de MOTORES (ningún consultor había creado pedidos). `verTodo` en ListaPedidos aún incluye esConsultor, pero la ruta ya no existe para ese rol. Leonardo Cardozo es CONSULTOR sin bodegas → no ve stock ni historial.

## 2026-10-27 — Rediseño de inventario (propuesta) y skill de UX
- Skill de UX del proyecto: `.claude/skills/ux-feisen/SKILL.md` (principios, estética `feisen-*`, patrones de pantalla, referentes y checklist). Usarla en cada pantalla nueva o rediseñada.
- Hallazgo: 1.398 de 1.421 productos activos **no tienen `stock_minimo`**, por eso las alertas de stock bajo casi nunca saltan (329 agotados, solo 10 "bajo mínimo"). La propuesta incluye un mínimo sugerido por consumo de 90 días, aprobado en lote.
- Propuesta del módulo 1 (Productos y stock), maqueta navegable: https://claude.ai/artifact/9QJKnxahqXpvxVNhYg2LRL. Orden propuesto: 1 Productos y stock · 2 Inicio/tablero · 3 Movimientos · 4 Pedidos y compras.
- Ajustes de Angie a la propuesta (2026-10-27): cada perfil ve **solo su bodega asignada**; **solo ADMIN** ve todas las bodegas y el valor por bodega; filtro por categoría + búsqueda por palabras del nombre (sin tildes, cualquier orden) para quien no sabe la categoría.
- Brecha en la app actual a corregir al implementar: en `GestionProductos.jsx` LOGÍSTICA ve todas las bodegas (`!esAdmin && !esLogistica`). Leonardo Cardozo (CONSULTOR) no tiene bodega asignada.

## 2026-10-27 — Módulo Productos y stock rediseñado (implementado)
- `GestionProductos.jsx` con el diseño de la propuesta: indicadores que filtran (Agotados / Bajo el mínimo / Sin mínimo), aviso de mínimos, franja "Valor por bodega" (solo ADMIN), búsqueda por palabras del nombre sin tildes (`utils/busqueda.js`), filtro por categoría con conteos, chips de estado, tabla en escritorio y tarjetas en celular, panel de detalle (`DetalleProducto.jsx`).
- **Logística ya no ve todas las bodegas**: se quitaron las excepciones `!esLogistica` en Productos. Solo ADMIN ve todo y el valor del inventario. Costo unitario lo siguen viendo ADMIN, ALMACENISTA y LOGÍSTICA (como antes).
- Ojo: la RLS de `items`/`stock` deja LEER todo a cualquier autenticado; la restricción por bodega es del front (`bodegasPermitidas`). La escritura sí está limitada por bodega en la RLS.
- Mínimo sugerido (`utils/consumo.js`): salidas no revertidas de los últimos 90 días desde las bodegas visibles (incluye traslados), cobertura de 15 días → `ceil(consumo/90*15)`. Se aprueba en lote en `ModalMinimosSugeridos.jsx` o por producto en el panel. El historial de movimientos empezó hace menos de 90 días, así que al principio el sugerido queda algo bajo.
- La búsqueda del Consultor (Ventas) usa el mismo `coincideBusqueda`.

## 2026-10-28 — Paquetes también para Almacén
- `paquetes` ahora tiene `bodega_id` (migración `supabase/migraciones/2026-10-28_paquetes_por_bodega.sql`; los 21 paquetes existentes quedan en MECANIZADOS según la bodega de sus piezas). **El front nuevo depende de esa columna**: ya aplicada en Supabase el 2026-10-28 con el conector (21 paquetes → MECANIZADOS, 0 piezas en otra bodega).
- `GestionPaquetes.jsx`: pestañas Mecanizados / Almacén. Mecanizados sigue limitado a "Producto Mecanizado"; Almacén puede usar cualquier producto activo de su catálogo. Búsqueda con `coincideBusqueda`. Sigue siendo solo ADMIN (RLS y menú); en el menú pasó de "Mecanizados" a "Inventarios" (la ruta sigue siendo `/mecanizados/paquetes`).
- `RegistrarMovimientoAlmacenista.jsx`: carga los paquetes activos de la bodega del usuario (`bodega_id = bodega.id`) y muestra el mismo selector (`selectorPaquete`) en la salida de producción interna de Mecanizados y en la salida estándar (Almacén). Si la bodega no tiene paquetes, el selector no aparece.
- `BODEGA_ALMACEN_ID` agregado a `utils/bodegasCatalogo.js`.

## 2026-10-28 — Editar movimiento: ahora se puede cambiar el producto
- Pedido de Angie: corregir una salida de Mecanizados registrada con el producto equivocado; la edición (solo ADMIN, `Historial.jsx`) solo dejaba cambiar cantidades y datos.
- El modal de edición tiene un campo **Producto** con buscador (`coincideBusqueda`), limitado al catálogo de la bodega del movimiento (`bodegaDelMovimiento`: origen en salidas, destino en entradas). Al elegir otro producto, el precio de costo del movimiento pasa al del producto nuevo (editable).
- Al guardar con producto cambiado: primero se actualiza el movimiento; luego se deshace el efecto en el producto anterior (−cantidad vieja) y se aplica completo en el nuevo (+cantidad nueva), con el mismo criterio de `ajustesStockPorTipo`. Si el producto nuevo no tenía renglón en `stock` para esa bodega, se crea. Queda en `movimientos_ediciones` como "Producto: viejo → nuevo".
- Ajuste (mismo día): Angie no logró cambiar el producto en tablet (REC-WA-0107) — el campo parecía texto lleno y la lista flotante (`absolute`) quedaba oculta dentro del modal con scroll. Ahora es el producto actual + botón **"Cambiar producto"** que abre buscador y lista **en línea** (no flotante). Gotcha: en modales con `overflow-y-auto`, evitar listas desplegables absolutas.
- Transferencias: el otro lado (p. ej. REC- en Soldadura y Armado) tiene su propio `item_id` y **no** se cambia solo; la pantalla avisa con el número del movimiento par para editarlo también.
- **Bug encontrado (corregido solo en editar):** la tabla `stock` no tiene columna `id` (PK = `item_id, bodega_id`), pero `aplicarAjustesStock()` buscaba/actualizaba por `id` → siempre fallaba con el aviso "el stock no se pudo ajustar". Editar cantidades nunca ajustó el stock (hubo 2 ediciones de cantidad: 2026-09-10 y 2026-10-01, MOV-WA--0020). Editar ahora usa `aplicarAjustesEdicion()` por llave compuesta.
- **Eliminar movimiento (corregido el mismo día, a pedido de Angie):** el trigger `trg_revertir_stock_on_delete` buscaba la bodega por `centro_costo = bodegas.nombre` (27 de 6.485 movimientos no coincidían con ninguna bodega → no se habría revertido el stock) y solo conocía 'entrada'/'salida'. Migración `2026-10-28_revertir_stock_on_delete_por_bodega_id.sql` (aplicada con el conector): ahora deshace exactamente lo de `fn_actualizar_stock` usando `bodega_origen_id`/`bodega_destino_id`, `SECURITY DEFINER`. `eliminarMovimiento()` ya **no** ajusta stock (antes lo intentaba con la función rota y mostraba siempre el aviso de error); el par de una transferencia se elimina y su propio trigger lo revierte. **Regla: el stock al eliminar lo maneja SOLO el trigger; al editar, solo el front (`aplicarAjustesStock` por llave compuesta), porque no hay trigger de UPDATE.** Las eliminaciones pasadas que no revirtieron no se pueden rastrear (las filas ya no existen).

## 2026-10-28 — Propuesta visual de Movimientos (maqueta)
- Diagnóstico: Productos y stock ya usa el diseño nuevo; Registrar movimiento, Historial, Inventario físico, Kardex, Corte y Paquetes siguen con el estilo viejo (colores sueltos `gray-*`/`blue-*`, emojis como íconos, títulos en azul negrita, tablas que no caben en celular).
- Orden propuesto: piezas comunes (encabezado, badge, panel lateral, aviso, estado vacío) + Registrar movimiento → Historial → Inventario físico → Kardex/Corte.
- Maqueta navegable de Registrar movimiento e Historial (datos de ejemplo de Almacén): https://claude.ai/artifact/DRxaqL8ULtAJ4YCg995u6o
  - Registrar: Salida/Entrada como dos botones, paquetes como tarjetas con "¿para cuántas máquinas?", líneas con − / +, alerta roja si se pide más de lo que hay, botón fijo abajo con resumen, aviso corto al guardar y formulario limpio.
  - Historial: un movimiento = una fila ("X y 11 más"), agrupado por día, chips con conteo, panel lateral de detalle, Editar/Eliminar en menú ⋯ y eliminar con confirmación en la misma pantalla.
- El aviso que se cierra solo se haría propio (sin librería nueva) salvo que Angie apruebe Sonner.

## 2026-10-28 — Registrar movimiento e Historial rediseñados (implementado)
- Piezas comunes nuevas en `src/components/shared/ui.jsx`: `EncabezadoPagina`, `ChipBodega`, `Segmentado`, `Contador` (− / +), `PanelLateral` (drawer, Esc/X/fuera), `useAviso` (aviso abajo que se cierra solo; hecho en casa, sin librería) y `useAtajoBuscar` (tecla "/"). Usarlas en las próximas pantallas (Inventario físico, Kardex, Corte).
- `RegistrarMovimientoAlmacenista.jsx`: misma lógica de guardado (validaciones, transferencias, Fundición, Mecanizados, pedidos, firmas). Cambia la forma:
  - Salida/Entrada como selector grande; los subtipos de Fundición/Mecanizados también.
  - Productos: buscador con resultados en línea (`coincideBusqueda`) + una tarjeta por producto con − / +. Se carga el `stock` de la bodega para mostrar "Disponible", "Quedan" y pintar en rojo la línea que pide más de lo que hay (la validación del servidor antes de guardar sigue igual).
  - Paquetes como tarjetas + "¿para cuántas máquinas?". **Ahora SUMAN a la lista** (antes la reemplazaban), para sacar varios paquetes en una salida.
  - Botón principal fijo abajo (sticky, encima de la barra del celular) con el resumen. Botón azul siempre (antes rojo en salidas / naranja en producción: rojo queda solo para problemas).
  - Al guardar: aviso "Salida SAL-XX-0143 registrada · Ver" y el formulario queda limpio arriba. Los errores suben la pantalla para verse.
  - Gotcha: `space-y-*` del contenedor le pone margin-top a los hijos `fixed` (panel, aviso) → se usan con `!mt-0`.
- `Historial.jsx`: misma lógica (editar, revertir, eliminar, par de transferencia). Lista agrupada por día y por número (una fila por movimiento: "X y 11 más", cantidad con signo), chips con conteo (Todos/Salidas/Entradas/Editados), fechas en un chip, búsqueda por palabras sin tildes, panel lateral con datos, productos y firmas. Las acciones de admin van por línea en el menú ⋯ del panel. Al refrescar ya no se pone toda la pantalla en "Cargando".
- Se quitó el filtro por producto con lista desplegable (la búsqueda ya encuentra por producto); el `?item=` de la URL sigue funcionando como chip que se quita con la x.
- Revisión local sin base: `vite.mov-demo.config.mjs` (fuera de git) con un Supabase falso en `.claude/demo-mov/supabase-mock.js` (también fuera de git; el scratchpad de la sesión se borra solo); abrir `http://[::1]:5178/movimientos?rol=ADMIN`, `/reportes/inventario-fisico`, `/reportes/kardex`, `/reportes/corte`.

## 2026-10-28 — Inventario físico rediseñado (implementado)
- `reportes/InventarioFisico.jsx` (ruta `/reportes/inventario-fisico`, solo ADMIN). Misma lógica de guardado, corte por fecha pasada y aplicación de ajustes; cambia la forma:
  - Lista: "En curso" (borradores, con botón Continuar) arriba y "Confirmados" abajo; tocar uno abre el panel lateral con contados, con diferencia y la lista (diferencias primero). El título se sigue editando en línea.
  - Conteo: barra de avance "Contados X de Y · %", "Con diferencia" (toca y filtra) y valor neto; chips Todos / Sin contar / Con diferencia; bodega y categoría como chips-select; búsqueda por palabras sin tildes.
  - Cada producto: Sistema, campo Contado grande (teclado numérico) y diferencia: **rojo si falta, ámbar si sobra, "Igual" si coincide** (antes azul/rojo/verde). **Enter pasa al siguiente producto** para contar rápido.
  - Se pintan 150 productos a la vez con "Mostrar 150 más" (antes ~1.400 inputs de golpe, lento en celular).
  - Barra fija abajo: contados/diferencias + Guardar borrador + Aplicar correcciones (azul; antes rojo). Al confirmar sin fallos vuelve a la lista con aviso; si hay fallos se queda el error a la vista 5 s como antes.
  - El resumen con valores (faltante/sobrante por producto) quedó plegable debajo de la lista.

## 2026-10-28 — Kardex e Inventario a una fecha rediseñados (implementado)
- `reportes/InformeKardex.jsx` (`/reportes/kardex`): mismo cálculo y mismo Excel. Periodos rápidos (Este mes, Mes pasado, Últimos 30 días, Este año) además de las fechas; filtros en una sola franja; 4 indicadores neutros (Valor al inicio, Entradas, Salidas, Valor al final; en "$29,9 M" con el valor exacto al pasar el mouse); búsqueda; chips **Con movimiento** (por defecto: oculta los productos quietos) / Todos; tabla en escritorio y tarjetas con Inicio · Entradas · Salidas · Traslados · Final en celular; 200 filas a la vez. Ya no usa verde/rojo para entradas/salidas (no son problemas).
- `reportes/CorteInventario.jsx` (`/reportes/corte`, título "Inventario a una fecha"): mismo cálculo y Excel. Resumen en tarjeta blanca (se quitaron la franja azul y el total con degradado azul→rojo), búsqueda por producto/categoría, chips Con stock / Todos, bodegas plegables con subtotal, stock en rojo solo cuando es 0 y "hoy X" debajo cuando cambió.
- Con esto el módulo Inventarios queda completo en el diseño nuevo (Logística incluido, ver abajo).

## 2026-10-28 — Registrar movimiento de LOGÍSTICA rediseñado (implementado)
- `movimientos/RegistrarMovimiento.jsx` (perfil LOGÍSTICA): mismo guardado (un producto por movimiento, número MOV-XX-NNNN, validación de stock, pedido → recibido, foto de remisión, firma). Cambia la forma: Salida/Entrada grande, fecha compacta, buscador por palabras con existencias, tarjeta del producto elegido con − / + y alerta roja si no alcanza, destinos como botones, bloques "De dónde viene" / "¿A dónde va?", botón fijo abajo y aviso al guardar (se quitó la pantalla de éxito de 2,5 s). Carga el `stock` de sus bodegas para mostrar "Hay X · quedan Y".
- Sigue siendo de **un solo producto** por movimiento (el de Almacén permite varios). Pasarlo a varios es un cambio de lógica aparte.

## 2026-10-28 — Pedidos: paso automático a "En camino" y seguimiento por etapas (implementado)
- Pedido de Angie: que al generar la OC el pedido pase solo a tránsito, y ver en qué etapa van los pedidos (tipo Amazon/Shein) arriba, como filtro. Se hicieron 2 maquetas (A: flechas de proceso, B: barra de reparto + tarjetas); **eligió la B**. Maqueta: https://claude.ai/artifact/3FLGdx9umkvm5HeJsKYGJT
- `ModalGenerarOC.jsx`: nuevo campo **Fecha estimada de llegada**. Al generar la OC, si el pedido estaba `pendiente` pasa a `en_transito`; `numero_oc` se llena (o se le suma) con el número real (OC-00XX) y se registra en `pedido_historial` (`en_transito` u `oc_generada` si ya iba en camino). Si la actualización falla, la OC queda creada y se avisa para marcarlo a mano.
- Botón "En tránsito" → **"Compra directa"** (solo para lo que se compra sin OC): pide quién compra y la fecha; guarda `numero_oc = 'Compra directa · <quién>'` (sin cambiar la base). Hallazgo: 11 de 25 pedidos en tránsito eran compras sin OC ("NO HAY OC COMPRA EFRAIN"…).
- `ListaPedidos.jsx`: arriba `EtapasPedidos` (barra de reparto + tarjetas Por comprar / En camino / Llegó una parte / Recibidos, que filtran). Filtro por defecto "Pedidos en curso" (antes "Todos"). **Atrasado** = en camino o parcial con `fecha_estimada_llegada` < hoy: etiqueta roja en el pedido, conteo en rojo y van primero. Se quitaron las dos alertas sueltas (más de 3 días pendientes / incompletos): quedaron dentro de las tarjetas.
- Etiquetas: "En tránsito" → "En camino", "Parcial ⚠️" → "Llegó una parte" (el valor en la base no cambia).
- Corrección de datos (OK de Angie, 2026-10-28): PED-0215 (OC-0085) y PED-0216 (OC-0083), que tenían OC y seguían `pendiente`, pasaron a `en_transito` con su número de OC y nota en el historial (sin usuario ni fecha estimada). Script: `supabase/migraciones/2026-10-28_pedidos_con_oc_a_en_camino.sql`.
- El cuerpo de la tarjeta de cada pedido sigue con el diseño viejo; solo se agregaron las etiquetas de llegada/atraso.

## 2026-10-28 — Fichas de pedido más limpias + un solo "Recibir" (implementado)
- Pedido de Angie: las fichas se veían amontonadas. Maqueta aprobada: https://claude.ai/artifact/UDogswpyh9gYmaU5Ysv9qQ
- `ListaPedidos.jsx` → `TarjetaPedido` nueva: ícono de etapa, **qué se pidió** (producto, no el número), quién · área · cómo se compró, y **en qué va** en palabras (`estadoPedido`: "Por comprar · hace 6 días", "Atrasado 47 días", "Llegó 3 de 6", "Recibido · 22 oct"). Solo la etiqueta **Urgente** (se quitaron "Normal", "6d", "Pendiente" repetido, foto, observación y el texto de OC de la ficha).
- **Un solo botón** con el paso que sigue (`accionPrincipal`): Generar OC (Admin/Logística, pedido por comprar) o Recibir. Lo demás en el menú ⋯ (`MenuAcciones`, se abre hacia arriba si no cabe): ver detalle, editar, compra directa, otra OC, cerrar, eliminar. Permisos iguales a antes (`permisosDe`).
- Tocar la ficha abre `DetallePedido` (panel lateral): estado grande, acciones, productos con lo recibido/faltante/sobrante, observación, foto, OCs (proveedor/precio/PDF solo Admin/Logística, igual que antes), entradas al inventario e historial (se recarga al abrir).
- "Recibido + Entrada" y "Solo recibir" → **un solo "Recibir"** con casilla "Crear entrada al inventario" marcada por defecto (91 de 95 pedidos recibidos en 45 días tuvieron entrada). La lógica de `confirmarRecibido` no cambió; la casilla solo cambia `conEntrada`.
- El texto libre viejo de `numero_oc` ("NO HAY OC COMPRA EFRAIN") se muestra como "compra efrain"; si hay OC de la app se muestra su número en vez del texto libre.

## 2026-10-28 — Propuesta módulo 2: Inicio de gerencia (Inicio + Analítica unidos)
- Decisión de Angie: Inicio y Analítica se unen en un solo tablero con lo crítico de cada módulo (Inventarios, Logística, Mecanizados, Fundición, RR. HH., Calidad). Maqueta: https://claude.ai/artifact/1Ewvc5BSpbGutCVth7u6FV
- Estructura: "Requiere tu atención" (pendientes de todos los módulos, por gravedad) → una tarjeta por módulo → "Análisis detallado" (las pestañas actuales de Analítica).
- Hallazgos de datos (2026-10-28): tabla `fundidas` vacía; órdenes de moldeo canceladas o sin avances; 13 pedidos en tránsito con fecha estimada vencida (el peor, PED-0007, 47 días); nómina 2.ª quincena de octubre en borrador; los movimientos MEC no guardan `precio_costo_snapshot` (valor de mecanizado = 0).
- Ajustes v2 de Angie al Inicio (2026-10-28): pendientes descartables con ×; Inventarios con valor total y por bodega (barras o mosaico), pareto por almacén y rotación; piezas mecanizadas por persona; Fundición con producido y no conforme; ausencias en RR. HH.; selector de periodo (7 días, 15 días, último mes, mes puntual, año). La sección "Análisis detallado" desaparece: su contenido quedó repartido en los módulos.
- Valor del inventario: contar solo productos **activos** ($462,2 M el 2026-10-28). La cifra anterior ($493,8 M) incluía inactivos.
- Mecanizados: el operario se guarda como texto libre en `movimientos.motivo` ("Mecanizado por: Wilmer y miguel", "Sanches", "Hernendes"…). Para medir piezas por persona hay que normalizar; al implementar, cambiar a un selector de colaboradores del área (empleados) y guardar el id.
- RR. HH.: tabla `novedades` vacía a la fecha; la tarjeta de ausencias muestra un estado vacío que explica qué se verá.

## 2026-10-28 — Inicio de gerencia implementado (Inicio + Analítica unidos)
- Nuevo `src/components/admin/inicio/`: `InicioGerencia.jsx` (pantalla), `datosInicio.js` (cargas y cálculos), `operarios.js` (normaliza el operario escrito a mano en mecanizado).
- Rutas ADMIN: `/` y `/dashboard` → InicioGerencia; `/analitica` redirige a `/dashboard`; se quitó "Analítica" del menú (se mantiene `/analitica/fundicion`). `admin/Dashboard.jsx` y `admin/DashboardEjecutivo.jsx` quedaron sin uso: se pueden borrar cuando se confirme que no hace falta nada de ellos (DashboardEjecutivo tenía provisión NIIF por inventario >180 días).
- Periodo (7/15 días, último mes, mes puntual, año) guardado por navegador en `localStorage` (`inicio-periodo`). Pendientes ocultados con × en `inicio-ocultas`; la clave de cada pendiente incluye su cifra, así que vuelve si la situación cambia.
- Rotación: último movimiento (no revertido) de cada producto en cada bodega; se trae todo `movimientos` (pocas columnas, paginado). Si la tabla crece mucho, pasar este cálculo a una vista/RPC en Supabase.
- Operarios de mecanizado: cada palabra del texto se asocia al colaborador más parecido (nombre o apellido, tolera "Sanches", "Hernendes", "Hern", "miguelpiñ"); se priorizan los del área Mecanizados. Lo que no coincide (p. ej. "Nelson") se muestra tal cual. Sigue pendiente cambiar el registro a un selector de colaboradores.

## 2026-10-28 — Mecanizado: el operario se elige de una lista
- `RegistroMecanizado.jsx` usa `SelectorOperarios.jsx`: botones con los colaboradores activos del área Mecanizados (varios a la vez = trabajo en pareja), buscador para otras áreas y "Agregar «X» (no está en la lista)" para contratistas o personas aún no registradas (p. ej. "Nelson", que aparece en registros viejos pero no está en RR. HH.).
- Se sigue guardando en `movimientos.motivo` como "Mecanizado por: Wilmer Yesid Triana y Jose Miguel Piraneque" (nombres + primer apellido); no se agregó columna.
- La lista viene de la función `operarios_mecanizado()` (migración `2026-10-28_operarios_mecanizado.sql`, aplicada con OK de Angie): SECURITY DEFINER, devuelve solo id/nombres/apellidos/área de los activos **del área Mecanizados** (decisión de Angie: Mecanizados solo ve a su gente) y solo a ADMIN, RRHH y JEFE_MECANIZADOS. La tabla `empleados` sigue cerrada para el resto (probado: Jefe de Mecanizados ve 8 por la función y 0 en la tabla; Ventas ve 0). Si la función falla, el campo vuelve a texto libre para no bloquear el registro.
- `admin/inicio/operarios.js` primero busca el nombre completo exacto (registros nuevos) y luego hace la búsqueda aproximada (registros viejos); así "Triana" de Wilmer no se le atribuye a José Miguel Piraneque Triana.
- Pendiente aparte: los movimientos MEC se guardan con `precio_costo_snapshot: 0`, así que el kardex/valor de lo mecanizado sale en $0.
- Transferencias Fundición → Mecanizados: el ADMIN no tenía esta pantalla en el menú (solo los jefes de Fundición y Mecanizados). Se agregó en Mecanizados → Transferencias, con ruta `/transferencias` para ADMIN. El admin ve todas, sin botones de aprobar: aprobar/rechazar sigue siendo de Mecanizados, que recibe las piezas.

## 2026-10-29 — Paquetes por máquina cortados en Registrar movimiento
- Las tarjetas de "Sacar un paquete por máquina" estaban en una franja con scroll horizontal y barra oculta: en computador no se podía llegar a las de la derecha (quedaban cortadas) en ninguna bodega (Mecanizados, Almacén…). Ahora es una grilla que se acomoda (1 columna en celular, 2–3 en computador) y el nombre se ve completo.
- Revisado el mismo patrón en otras pantallas: los chips de filtro de Historial, Kardex e Inventario físico siguen deslizando en celular, pero en computador ahora pasan a la siguiente línea en vez de esconderse.
- Regla: no usar franjas con `overflow-x-auto` + barra oculta para opciones que el usuario debe poder elegir en escritorio.
- Buscador de productos en Registrar movimiento (almacenista/jefes y admin): mostraba solo los primeros 8 resultados ("Mostrando 8 de 163"). Ahora muestra todos (tope de 200 solo por rendimiento) en una lista con desplazamiento y el conteo arriba; en salidas van primero los que tienen existencias.
- Mismo error revisado en otros buscadores que cortaban sin avisar (operario: 15; recetas de ensamble, BOM, crear orden de moldeo, paquetes: 40; pedidos: 30; historial: 50): todos subidos a 200, ya tenían lista con desplazamiento.
- Varios paquetes en la misma salida (pedido de Angie, 2026-10-29): ya se sumaban, pero no se notaba. Ahora cada tarjeta muestra "Agregado × N" y debajo sale "En esta salida: Rana × 2 · Pluma × 1". Las piezas repetidas entre paquetes se suman en una sola línea. El resumen es solo de pantalla (no se guarda en el movimiento) y se limpia al guardar o al vaciar la lista.

## 2026-10-29 — Rediseño de Registrar mecanizado (propuesta aprobada por Angie)
- Misma estética que Registrar movimiento: EncabezadoPagina, bloques blancos con etiquetas de 11 px, Contador − / + compartido, aviso que se cierra solo y barra fija abajo con botón azul "Registrar mecanizado" (antes rojo).
- Tocar una pieza la agrega con cantidad 1 (si ya está, suma 1); la cantidad se ajusta en la misma fila. Ya no hay panel de cantidad aparte.
- Buscador con coincideBusqueda (palabras sueltas, sin tildes), todas las coincidencias, primero las que tienen existencias; las agotadas se ven con "Ver N sin existencias".
- Los productos destino "<nombre> - MECANIZADO" se cargan al abrir la pantalla: si falta o está inactivo, la fila sale en rojo al agregarla y el botón queda bloqueado (antes el error salía al guardar). Se perdió la sugerencia de "nombres parecidos" que daba el error viejo.
- Nuevo bloque "Registrado hoy": salidas MEC de hoy (fecha_movimiento = hoy, no revertidas) con quién y cuánto; total de piezas del día en el encabezado.
- El catálogo de piezas ahora usa fetchAllPages (antes una sola consulta, tope 1000).
- Lo guardado no cambia: mismo número MEC, par salida/entrada por pieza, motivo "Mecanizado por: …" y precio_costo_snapshot 0 (pendiente conocido).

## 2026-10-29 · Carga de productos EQUIPMASTER STORE (bodega MOTORES)
- 12 productos creados en MOTORES › EQUIPMASTER STORE con precio de costo $0 (la lista no traía costos; ajustar desde Productos).
- Stock inicial cargado con la entrada ENT-AF-0433 (referencia "INVENTARIO EQUIPMASTER"). Script: `supabase/migraciones/2026-10-29_equipmaster_store_motores.sql`.
- Gotcha: `items` no tiene campo de serial; el serial vive en `movimientos.serial_motor`. Cuando hay varias unidades, los seriales van juntos en la entrada separados por " - ". Se buscan desde el Historial.

## 2026-10-29 — Rediseño de Configuración + desactivar usuarios (aprobado por Angie)
- Pantalla `config/GestionConfig.jsx` con la estética nueva: pestañas con conteo (Usuarios, Bodegas, Categorías, Roles), botón principal según la pestaña y panel lateral (PanelLateral) para crear/editar en vez de modales.
- Usuarios: aviso arriba de quien no tiene bodega (hoy Leonardo Cardozo), búsqueda, filtro por rol, tabla en escritorio / tarjetas en celular. Al elegir el rol se explica qué ve (`QUE_VE`); sin al menos una bodega no deja guardar (rol ≠ ADMIN). Al crear, como `crear-usuario` solo responde { ok }, se busca el perfil por nombre para guardarle las bodegas de una vez.
- Bodegas en tarjetas (productos activos, categorías, personas). Eliminar solo aparece si no tiene productos; si no se puede, sugiere desactivarla.
- Categorías agrupadas por bodega con su número de productos; "vacía" si no tiene, y solo esas muestran Eliminar.
- Roles: personas por rol y qué ve; las etiquetas de color pasan a un punto de color (el rojo queda para problemas).
- **Desactivar usuario** (profiles.activo): migración `2026-10-29_usuarios_desactivar.sql` (aplicada). get_my_rol() devuelve NULL si el usuario está desactivado (todas las políticas por rol le niegan acceso) y la app cierra su sesión al cargar o al entrar ("Tu usuario está desactivado…").
- **Hueco de seguridad cerrado**: la política profiles_update_own (para "Mis listas") dejaba a cualquier usuario cambiarse su propio rol (p. ej. a ADMIN) o reactivarse. El trigger `trg_proteger_campos_perfil` solo deja cambiar rol, activo, acceso_costeo y almacen a un ADMIN activo, y el admin no puede desactivarse ni quitarse el rol a sí mismo. Probado en transacción revertida con Ventas y el admin.
- Pendiente conocido: las lecturas abiertas a cualquier autenticado (items, stock) no dependen del rol, así que un usuario desactivado con una sesión vieja aún podría leerlas hasta que la app lo saque; la app lo saca al recargar. Para cortar del todo habría que bloquearlo también en Auth (ban) desde una Edge Function.

## 2026-10-29 · Motores con seguimiento por serial (bodega MOTORES)
- Tabla `motor_seriales` (una fila por motor físico): serial, estado disponible/despachado, entrada_mov_id, salida_mov_id, numero_of. Migración `supabase/migraciones/2026-10-29_motor_seriales.sql`.
- Todo producto de la bodega llamada "MOTORES" (`esBodegaMotores` en `src/components/shared/seriales.jsx`) entra y sale de a 1 unidad por serial: N filas de movimiento con el mismo número.
  - Entrada (Registrar movimiento y Recibir pedido con entrada): un campo de serial por unidad; no deja seriales vacíos, repetidos o ya disponibles en bodega.
  - Salida: se tocan los seriales disponibles; la OF es obligatoria. Si el producto no tiene seriales cargados (los 29 viejos de MOTORES CONSTRU) o hay más stock que seriales, se escriben a mano.
- Trigger `trg_motor_seriales_sync`: al eliminar/revertir una salida el motor vuelve a disponible; al eliminar/revertir una entrada se quita el serial (si no ha salido); al corregir el serial de una entrada en el Historial se corrige en la tabla. Corregir el serial de una SALIDA en el Historial no cambia qué motor quedó despachado.
- La validación es solo en pantalla: ajustes de inventario físico y transferencias de MOTORES no piden serial ni OF.
- ENT-AF-0433 se partió en una línea por motor (25 seriales); el stock no cambió.

## 2026-10-29 · Salida de Almacén: lo último agregado queda de primero
- En `ListaProductos` (RegistrarMovimientoAlmacenista) el producto que se agrega, o al que se le suma +1, pasa al primer lugar de la lista y se resalta 1,6 s. Las piezas de un paquete también quedan de primeras. Así se ajusta la cantidad sin bajar por toda la lista.

## 2026-10-29 · Paquetes de la salida con buscador (opción A)
- El bloque de paquetes (Almacén y Mecanizados) ya no muestra una tarjeta por paquete (Almacén tiene 25): es un buscador. Al escribir aparecen solo los paquetes que coinciden; cada toque en el + suma el paquete de una máquina (el botón muestra ×N). Los agregados quedan como etiquetas con una × que quita sus piezas de la lista (cantidad × máquinas).
- Ya no hay contador de "¿para cuántas máquinas?": se toca el + tantas veces como máquinas.
- Maqueta con las opciones: https://claude.ai/artifact/X4shvJwJp9ZPJkJykctuQE

## 2026-10-29 · Módulo Órdenes de fabricación (traído de la app "APP OF")
- Objetivo: tener las OF en el ERP para después conectar lo que se fabrica con cada orden. La app de OF (Supabase `qzvmnrfzcmqnbrkllbpl`, carpeta `../APP OF`) sigue en uso hasta el día del cambio.
- Migración `supabase/migraciones/2026-10-29_ordenes_fabricacion.sql` (aplicada): `ordenes_fabricacion`, `items_of`, `of_producciones`, `of_entregas`, `of_productos`, `of_clientes` (prefijo `of_` donde el nombre era genérico), secuencia `of_numero_seq`, triggers `trg_of_sumar_produccion` / `trg_of_sumar_entrega` (iguales a los de la app de OF), bucket público `of-adjuntos`, columna `profiles.centro_costo_of` (protegida por `proteger_campos_perfil`).
- Permisos: `of_puede_editar()` decide quién crea/edita OF, clientes, productos y registra despachos; hoy solo ADMIN. Registrar fabricado: ADMIN o quien tenga `centro_costo_of` igual al del producto. Lectura: cualquier usuario activo.
- Pantallas en `src/components/of/` (copia de la app de OF con sus propios Modal/Alerta/formatters en `of/shared/`), rutas `/of/...`, módulo "Ventas" en el menú de ADMIN (se llamaba "Órdenes de fabricación"; Angie lo renombró el 29/10). Las consultas usan alias (`producciones:of_producciones`, `entregas:of_entregas`) para no tocar el resto del código.
- `AuthContext`: `esComercial` y `esJefeArea` están fijos en `false` y `centroCosto` sale de `centro_costo_of`, hasta definir los roles.
- **Roles pendientes (Angie, sábado 31/10):** decisión tomada = un solo rol por persona (COMERCIAL, JEFE_VENTAS, JEFE_AREA nuevos). Al hacerlo: ajustar `of_puede_editar()`, `esComercial`/`esJefeArea`, rutas y menú por rol. Ojo: la política `profiles_select` del ERP solo deja ver el propio perfil a quien no es ADMIN, así que para otros roles saldrá "—" en "Creado por / Registrado por" (en la app de OF todos veían todos los perfiles).
- **Día del cambio: HECHO el 2026-11-03** (ver detalle abajo). Plan original: copiar los datos con los mismos ids, cambiando `creado_por` / `registrado_por` al usuario del ERP por correo (Viviana Novoa y William Roa todavía no tienen usuario en el ERP); cargar `items_of` con `producido`/`entregado` y luego producciones/entregas con los triggers desactivados para no sumar dos veces; copiar los 47 adjuntos al bucket `of-adjuntos` y reescribir `archivo_oc_url`; dejar `of_numero_seq` en el último número; en la app vieja mostrar un aviso con el enlace al ERP.
- Revisión local sin login: `vite.of-demo.config.mjs` (excluido de git) con un Supabase falso que sirve una copia de 35 OF reales.
- Dashboard va de primero en el menú de Ventas (2026-11-03)
- **Dashboard de Ventas solo para Leidy (2026-11-10, pedido de Angie):** la ruta `/of/dashboard` (pestañas Pedidos y Dashboard de ventas) la abre solo JEFE_VENTAS (y ADMIN), sin importar el nivel en 'of': nuevo `rutasRoles` en `modulos.js` + `rolAbreRuta()` dentro de `puedeRuta`, así que desaparece del menú, de la barra del celular y de las rutas de los demás. Asesores (COMERCIAL, hoy nivel Todo) y LOGISTICA (Registra) ya no lo ven. Es solo de pantalla: los datos de OF los siguen leyendo en Órdenes; la facturación de Odoo ya estaba limitada en la base (`ventas_puede_ver`).
- **Resumen solo con OF activas (2026-11-04):** Ventas › Resumen ya no muestra OF canceladas ni despachadas completas, y de las activas solo los productos que aún tienen algo por despachar (la columna «Despachado» queda como lo ya entregado de esos pedidos activos). Con los datos del 2026-11-04 pasó de 195 productos a 60, en 60 OF activas.
- **Demoras de las OF (2026-11-03):** Dashboard › Pedidos (OF) tiene «¿Qué tanto nos estamos demorando?» (`DemorasOF.jsx`, debajo de los indicadores): OF atrasadas hoy (promesa vencida y sin salir completas, con días de atraso y si falta fabricar o despachar), cuántas salieron tarde y su atraso promedio, mes a mes (% a tiempo y días orden → última entrega, últimos 6 meses) y por área (días de la orden a quedar fabricado). Las reversiones no cuentan como entrega ni fabricación. Al 2026-11-03 había 28 OF atrasadas (la más vieja, 119 días). Dashboard de ventas de Odoo para Leidy: `ventas_puede_ver()` = ADMIN o JEFE_VENTAS (`2026-11-03_ventas_ver_jefe_ventas.sql`, aplicada) y `veVentasOdoo` en la app. Probado: Leidy lee las filas de `ventas_odoo`, Fabián no. «Actualizar desde Odoo» también lo ve Leidy (mismo `veVentasOdoo`; la función `ventas-odoo` ya lo permite por `ventas_puede_ver()`).
- **Ventas ve quién creó/registró (2026-11-03, `2026-11-03_profiles_ver_ventas.sql`, aplicada):** `profiles_select` solo dejaba ver el propio perfil (o todo a ADMIN) y a Leidy le salía «Creado por: —». Nueva política `profiles_select_ventas` = `mi_nivel('of') <> 'no'`: todo el que tiene acceso a las OF (asesores, gerente de ventas, jefes de área, Mateo, despachos) ve quién creó/registró, para saber a qué asesor preguntar. Probado como William Roa y Alexander (ven los creadores) y Efraín, sin OF (no ve). Primero fue solo `of_puede_crear()`; se amplió el mismo día por pedido de Angie.
- **Inicio y menú de ventas (2026-11-03):** quien tiene OF con Registra o Todo (asesores y gerente de ventas) entra a `InicioVentas.jsx`: botón «Crear orden de fabricación» y «Salen hoy» (OF no canceladas con promesa hoy y algo por despachar; primero las que aún tienen algo sin fabricar) más un aviso con las OF atrasadas. Menú: Inicio, luego el grupo Ventas completo (no se sube «Órdenes de fabricación» aparte como a los jefes) y después Inventarios. Inventario solo de su bodega MOTORES: `2026-11-03_ventas_inventario_motores.sql` (COMERCIAL 'productos' 've'; JEFE_VENTAS sin historial), aplicada. Los tres tienen solo la bodega MOTORES en `profile_bodegas`. Nota: al 2026-11-03 COMERCIAL ya tiene 'of' en 'todo' (lo cambió alguien desde Configuración, no esta migración).
- **Resumen › OF por producto (2026-11-03):** al tocar un producto en Resumen se abren las OF relacionadas (con cliente). En la app vieja era solo ADMIN (Leidy lo era); ahora lo ven ADMIN y quien tiene OF con Registra o Todo (`esComercial`: Leidy, Fabián, Viviana). Jefes de área y despachos siguen sin verlo porque muestra clientes.
- **Cotización obligatoria al crear OF (2026-11-03):** `NuevaOrden.jsx` no deja guardar una OF nueva sin número de cotización (al editar sigue siendo opcional, porque hay 15 OF viejas sin cotización). Respaldo en la base: `2026-11-03_of_cotizacion_obligatoria.sql` (trigger BEFORE INSERT `trg_of_exigir_cotizacion`), aplicada y probada. Gotcha: una prueba de INSERT que se deshace igual gasta números de `of_numero_seq` (el default se evalúa antes del trigger); en pruebas, poner `numero` fijo o hacer `setval` a `max(numero)` después.
- **App OF vieja bloqueada (2026-11-03):** solo muestra «Esta app ya no se usa» con el botón «Ir al ERP», y su base (proyecto `qzvmnrfzcmqnbrkllbpl`) quedó de solo lectura para anon/authenticated, adjuntos incluidos (ver `APP OF/supabase/2026-11-03_bloquear_escritura.sql`). Los datos siguen ahí para consulta.
- **OF a la mano en celular/tablet (2026-11-03):** para quien no es ADMIN y puede abrir `/of/ordenes`, `Layout.jsx` pone «Órdenes de fabricación» de segundo en el menú (tras Inicio) y «OF» de segundo en la barra inferior del celular, en vez de dejarlas al final en el grupo Ventas. La barra se corta en 6 botones: a jefe de fundición y de mecanizados se les cae Calidad de la barra (sigue en el menú ☰).
- **Permisos tras el traspaso (2026-11-03, `2026-11-03_of_entregas_y_repuestos.sql`, aplicada):** en la app vieja Fabián registraba 961 de 1.021 entregas (868 en OF creadas por Leidy o Viviana) y Mateo la fabricación de repuestos. Ahora: entregas y su reversión con nivel Registra o Todo en **cualquier** OF (`of_entregas_insert` = `of_puede_crear()`; en la app `puedeDespacharOF`); editar/cancelar sigue siendo solo de las propias con Registra. ALMACENISTA tiene 've' en 'of' y Mateo `centro_costo_of = 'repuestos'` (queda como jefe de área). Probado con RLS haciéndose pasar por cada uno (transacción deshecha). Leidy (JEFE_VENTAS) ya no registra fabricación: antes lo hacía como ADMIN; si lo necesita, ajustar aparte.

### 2026-11-03 · Traspaso definitivo de la app de OF al ERP (hecho)
- **Conteos (origen = destino, verificados):** 507 OF (números 1–507), 995 `items_of`, 1.070 producciones → `of_producciones`, 1.021 entregas → `of_entregas`, 957 productos → `of_productos`, 300 clientes → `of_clientes`. Mismos UUID. Huella md5 fila por fila igual en las 6 tablas; `producido`/`entregado` iguales item por item; sumas iguales (producciones netas 10.442, entregas netas 9.562; items: producido 10.407, entregado 9.561, pedido 12.800). La última OF del origen es del 2026-10-30; al terminar se revisó otra vez el origen y no había nada nuevo ni modificado.
- **Columnas:** las 6 tablas tienen las mismas columnas en ambos lados. Única diferencia: en la app de OF las cantidades son `numeric(18,2)` y en el ERP `numeric` sin escala (mismo valor, se ve "5" en vez de "5.00"). La tabla `profiles` de la app de OF (rol y `centro_costo` por persona) no se copió: el ERP tiene sus propios perfiles y el área de OF va en `profiles.centro_costo_of`, que se asigna en Configuración › Usuarios.
- **Usuarios:** `creado_por` / `registrado_por` se cambiaron al id del ERP buscando el mismo correo (`lower(email)` en `auth.users`) para los 8 usuarios que aparecen (ventas@, williamrroa.1219@, gerentecomercial@, construequipos.f25@, williamangulocadena@, cmgiraldo729@, analistaprocesoscf@, angie.franco1005@). Ningún usuario quedó en null que no lo fuera en el origen (los null que hay son de la carga inicial: 187 clientes y 930 productos sin creado_por, igual que en la app de OF).
- **Triggers:** producciones y entregas se cargaron con `trg_of_sumar_produccion` / `trg_of_sumar_entrega` desactivados dentro de la misma transacción (todo o nada) y quedaron activos de nuevo (verificado).
- **Secuencia:** `of_numero_seq` quedó en 507 (is_called = true): la próxima OF del ERP será la 508.
- **Cómo se copió:** lectura del origen con el conector de Supabase (solo SELECT), usuarios remapeados en un script local, filas subidas a una tabla temporal `_traspaso_of_tmp` del ERP (solo INSERT para anon, con un token) y pasadas a las tablas reales en una sola transacción. La tabla temporal ya se borró.
- **Adjuntos: copiados el 2026-11-03** (con OK de Angie). Los 47 archivos están en el bucket `of-adjuntos` con los mismos nombres (tamaños verificados uno por uno). Se subieron con una política temporal de storage para anon limitada a esos 47 nombres (`of_adjuntos_traspaso_tmp`), que se borró apenas terminó la subida. `archivo_oc_url` de las 46 OF con adjunto ya apunta a `lgfacrhpaxzvvklztqxv…/of-adjuntos/…` (ninguna quedó con la URL vieja). El objeto `1786469337207_ORDEN DE COMPRA CTG 417 FEISEN.pdf` no lo usa ninguna OF. Ya no se depende del proyecto viejo para los adjuntos.
- **App vieja:** tiene un aviso azul arriba en todas las pantallas (también en el login) con enlace a https://erpfeisen.netlify.app/of/ordenes; no bloquea nada (commit `bfc967a` en `feisen-ordenes-fabricacion`). Ojo: lo que se registre en la app vieja desde hoy NO llega al ERP.

## Logística elige la categoría antes del producto (2026-10-29)
- En `RegistrarMovimiento.jsx` (Logística/Admin) el bloque Producto empieza con la categoría (chips). Para LOGISTICA es obligatoria: sin categoría no aparece el buscador ("Primero elige la categoría…") y el registro no se deja guardar. En MOTORES son EQUIPMASTER STORE y MOTORES CONSTRU.
- Al elegir categoría se listan de una vez todos sus productos (no hace falta escribir); el buscador busca dentro de ella. Cambiar de categoría suelta el producto si no es de esa categoría.
- Solo se muestran categorías de las bodegas del usuario que tengan productos activos; si hay una sola, queda elegida sola. Para ADMIN es un filtro opcional con "Todas".

## 2026-10-29 · Dashboard de ventas dentro de Ventas › Dashboard
- Ventas › Dashboard (ancho máximo max-w-5xl, centrado) tiene dos vistas: **Pedidos (OF)** (el dashboard de la app de OF) y **Dashboard de ventas** (lo que era el artefacto "Dashboard Ventas": Resumen, Análisis, Cargar informe y Tutorial). La vista elegida se recuerda en el navegador (`feisen-of-dashboard`). Componente `src/components/of/DashboardVentasOF.jsx`.
- El tablero es el código del artefacto casi sin cambios: HTML en `of/ventas/plantilla.html` (importado con `?raw`), JS en `of/ventas/montarDashboardVentas.js` (se monta sobre un div; limpia sus listeners al salir) y CSS en `of/ventas/ventas.css`, todo con prefijo `.dv` para no tocar el resto del ERP. Sin modo oscuro y con la letra Inter del ERP. Imágenes del tutorial en `public/ventas-tutorial/`.
- Gotcha: el módulo JS NO puede llamarse `dashboardVentas.js` junto a `DashboardVentas.jsx` — macOS no distingue mayúsculas y `import './DashboardVentas'` terminaba cargando el .js.
- Datos: tabla `ventas_odoo` (migración `2026-10-29_ventas_odoo.sql`), una fila por empresa + mes + cliente + producto. `origen='base'` = las 1.716 filas con que se armó el artefacto (abr – 27 oct 2026, Feisen 969 + FC 747, total $4.828.319.523, incluye notas crédito); `origen='odoo'` = meses subidos en "Cargar informe". Subir un mes llama `ventas_cargar_mes()`, que borra y reemplaza ese mes de esa empresa (todo o nada).
- Permisos: ver y cargar solo ADMIN (`ventas_puede_ver()`); ajustar cuando se definan roles (Leidy = JEFE_VENTAS).
- Octubre se trata como mes parcial (al 27) mientras tenga filas 'base' (constantes `BASE_DAYS`/`BASE_M` del script). Al subir octubre completo desde Odoo deja de ser parcial.
- El artefacto en claude.ai sigue existiendo con sus propios datos; desde ahora los meses se deben subir en el ERP (lo que se suba al artefacto no llega al ERP).
- No probado con el ERP real: la subida de un Excel de Odoo (el lector es el mismo del artefacto, ahora guarda en Supabase).

## 2026-10-29 · Módulo Costeo (traído de la app "APP COSTEO")

- La app de costeo (`../APP COSTEO`, costeofeisen.netlify.app, repo `costeo-feisen`) ya usaba **esta misma base** (tablas `costeo_*`, vista `costeo_resumen`), así que no hubo copia de datos: solo se trajeron las pantallas.
- Pantallas en `src/components/costeo/` (copia de la app de costeo, React 19 → corre igual en React 18) con sus utilidades en `costeo/utils/`. Rutas: `/costeo` (fichas; `?catalogo=pieza` para piezas), `/costeo/fichas/:id` (`?tab=mano_obra|cif|equipos|piezas|tiempos|resumen`), `/costeo/etapas`, `/costeo/cif`, `/costeo/equipos`. Módulo "Costeo" en el menú de ADMIN.
- **Solo ADMIN por ahora** (decisión de Angie): las rutas van con `rolEfectivo === 'ADMIN'` porque el bloque de rutas del final también atiende roles sin bloque propio. La RLS de las tablas sigue siendo `rol = 'ADMIN' or acceso_costeo` — Julián Acuña tiene `acceso_costeo = true` pero hoy no ve el módulo en el ERP.
- **Colores**: en la app de costeo `feisen-gris` era el gris oscuro de texto; en el ERP es un gris claro de fondo. Al copiar se cambió `text-feisen-gris` → `text-feisen-texto-2` y `bg-feisen-gris-claro` → `bg-feisen-gris`. Ojo si se vuelve a copiar algo de esa app.
- La planilla imprimible de Tiempos reales necesita las reglas `.planilla-impresion` / `@media print` que se agregaron al final de `src/index.css`.
- El "enlace para celular" de Tiempos reales ahora es `/costeo/fichas/<id>?tab=tiempos` del ERP.
- **Pendiente** (Angie lo dejó para después): el permiso "solo registrar tiempos" para jefes de área (`profiles.acceso_tiempos`, `SoloTiemposApp`, funciones `costeo_tiempos_fichas/contexto`). Su SQL (`APP COSTEO/supabase/permiso_solo_tiempos.sql`) **nunca se aplicó**; `TiemposTab` ya trae el modo `soloRegistro` por si se retoma.
- La app vieja de costeo quedó mostrando solo un aviso con el enlace al ERP (los enlaces viejos `?ficha=…&tab=…` llevan a la misma ficha).
- **Aplicado 2026-10-29** (OK de Angie): `costeo_resumen` con `security_invoker = true` y sin permisos para `anon` (`supabase/migraciones/2026-10-29_costeo_resumen_security_invoker.sql`). Antes cualquiera con la llave pública podía leer costos y márgenes.

## 2026-10-29 · Se retira la app de costeo vieja
- Decisión de Angie: el costeo vive solo en el ERP (módulo Costeo, solo ADMIN). Julián (acceso_costeo) y los jefes de área que registraban tiempos en la app vieja **se quedan sin acceso** a propósito.
- Repo `angiefranco1005/costeo-feisen` **archivado** en GitHub (solo lectura; se puede desarchivar). La carpeta local `../APP COSTEO` se conserva.
- Sitio `costeofeisen.netlify.app`: pendiente de borrar en Netlify (requiere que Angie inicie sesión).
- Las tablas `costeo_*` y la vista `costeo_resumen` **no se tocan**: son de esta misma base y el módulo del ERP las usa.

## 2026-10-29 · Copia local de la Edge Function `actualizar-usuario`
- La función que cambia correo/contraseña desde Configuración estaba desplegada en Supabase (versión 1) pero **sin copia en el repo**. Se bajó tal cual a `supabase/functions/actualizar-usuario/index.ts` (sin cambios; lo desplegado y el repo son iguales).
- Ojo: comprueba `profiles.rol = 'ADMIN'` pero no `activo`. Hoy no es un hueco práctico (un admin desactivado es sacado por la app), pero si se vuelve a desplegar conviene usar `get_my_rol()`.
- En Supabase quedan además `rapid-worker` y `smart-action`: mismo contenido entre sí, la app no las llama (pruebas viejas). Candidatas a borrar con OK de Angie.
- `enviar-desprendible` está en el repo pero aún **no** está desplegada.

## 2026-10-29 · Dashboard de ventas: buscador y fichas de cliente / producto
- En Análisis de ventas, Producto y Cliente son buscadores propios (`buscador()` en `montarDashboardVentas.js`; se descartó `<datalist>` porque el navegador mostraba la lista completa). No muestran nada hasta escribir; luego hasta 8 coincidencias sin importar tildes ("pinon" encuentra PIÑON), con flechas + Enter o clic. Esc o salir del campo sin elegir deja el filtro anterior; borrar el texto quita el filtro.
- Al elegir un cliente aparece su **ficha**: total comprado, meses con compras, última compra, todo lo que compra (de mayor a menor, con unidades y %) y **lo que no ha comprado** (productos que otros clientes sí compran, ordenados por venta total).
- Al elegir un producto aparece su **ficha**: quién lo compra más y **qué clientes no lo compran** (clientes activos en el periodo, ordenados por sus compras totales).
- Las fichas respetan la empresa y el mes elegidos; tocar una fila filtra por ese producto o cliente. Código: `fichas()` en `of/ventas/montarDashboardVentas.js`.

## 2026-10-29 · Íconos Phosphor (duotone + light) y fuera los emojis
- Decisión de Angie, tras ver la propuesta comparativa: íconos de **Phosphor** (`@phosphor-icons/react` 2.1.7, MIT) en lugar de lucide-react. **Duotone** en el menú (módulos, ítems y barra inferior del celular) y en los indicadores del inicio de gerencia / dashboard ejecutivo; **light** en todo lo demás (botones, tablas, formularios).
- **Todo ícono se importa de `src/components/shared/iconos.jsx`**, nunca directo de `@phosphor-icons/react` ni de `lucide-react`. Ese archivo exporta los íconos con los nombres que tenían en lucide (`Package`, `AlertTriangle`, `Loader2`…) apuntando a su equivalente Phosphor, así las pantallas no cambiaron. Peso por defecto `light`; menos de 16 px pasa a `regular` para que no se pierda; `strokeWidth` se ignora. Para un ícono nuevo, agregarlo al `MAPA` de ese archivo.
- El menú ya no repite dibujos: Historial (reloj), Movimiento (flechas), Kardex (tabla), Corte (calendario con check), Transferencias (intercambio), BOM (árbol), Recetas (libro), Ventas (apretón de manos), Calidad (sello), etc.
- `lucide-react` sigue en package.json pero ningún archivo la usa; se puede desinstalar.
- Se quitaron ~60 emojis de 20 pantallas (Pedidos, Recogida, Calidad, inicio del operario, Calendario OF, dashboards…). Donde el emoji daba información se cambió por el ícono equivalente; en etiquetas, opciones de lista y mensajes solo se quitó (el color o el aviso ya dicen el significado). Se dejaron ✓ ✗ ✕, que son signos de texto. **Regla: no usar emojis en la interfaz.**
- Visto en la vista local (menú admin, Pedidos, inicio, Calidad, Recogida, Calendario OF, celular). Aviso viejo sin relación: NoConformidades tiene un `<button>` dentro de otro (React lo advierte en consola).

## 2026-10-29 · Planilla de inventario físico para imprimir
- Botón "Planilla para imprimir" en Inventarios → Inventario físico. Se elige bodega (y opcionalmente una categoría) y sale una hoja carta vertical para contar en papel: N°, producto, unidad, casilla en blanco "Cantidad contada" y Observaciones, agrupada por categoría, con 8 filas en blanco al final para lo que no esté en la lista y firmas de quien contó y quien revisó.
- **Conteo a ciegas** (decisión de Angie): la hoja NO muestra la cantidad del sistema. Lo contado se digita después en un conteo normal de la app, que es la que muestra las diferencias.
- Se imprime con `window.print()` (o "Guardar como PDF"), igual que la planilla de tiempos de Costeo: `PlanillaInventario.jsx` se monta fuera de #root con `.planilla-impresion`. Usa una página con nombre (`@page vertical` + clase `planilla-vertical` en index.css) porque la regla general de impresión es carta horizontal.

## 2026-10-29 · Letra del menú lateral (Inter ajustada)
- Decisión de Angie tras ver la propuesta (se descartó IBM Plex Sans). Se mantiene Inter.
- `src/index.css` (toda la app): suavizado de letra activado (`-webkit-font-smoothing: antialiased`; antes en Mac se veía gruesa) y rasgos de Inter `cv11` («a» de un solo piso), `ss01` (números abiertos), `cv05` («l» con cola).
- Menú (`Layout.jsx`): opciones en peso normal (gris 700, ícono gris 500); la activa en blanco con borde fino, azul y negrita. Títulos de sección («Módulos», «Vista previa», grupos) en mayúsculas 11 px con espaciado. Submenús cuelgan de una línea vertical y la opción activa lleva una marca azul de 2 px. «Producción y Ensamble» se muestra como «Ensamble» solo en el menú (`NOMBRE_EN_MENU`).

## 2026-10-29 · Ícono de la app con el logo
- El manifest pedía `icons/icon-192.png` y `icon-512.png`, pero **esos archivos nunca existieron**; solo había un `favicon.svg` provisional (una «F» en degradado). Por eso, al instalar el ERP en el computador o el celular, salía esa «F» en lugar del logo.
- Se copiaron los íconos de la app de OF (mismo logo del cubo Feisen) a `public/icons/` (`icon-192.png`, `icon-512.png`, `favicon.png`) y se quitó el SVG provisional.
- Quien ya tenga el ERP instalado puede seguir viendo la «F» hasta que el sistema refresque el ícono; si no cambia, desinstalar y volver a instalar la app.

## 2026-10-29 · Módulo Mantenimiento de equipos de planta
- Migración `supabase/migraciones/2026-10-29_mantenimiento.sql` (**aplicada** con OK de Angie). Tablas `mant_equipos`, `mant_tareas` (plan preventivo por fechas), `mant_ordenes` (OT correctivas y preventivas), `mant_orden_costos` (repuestos del inventario, compras aparte y servicios externos). Bucket público `mantenimiento` para fotos.
- **Permisos (RLS):** ADMIN todo. Los demás roles (menos CONSULTOR y RRHH) ven los equipos de sus bodegas y los de área *General* (`bodega_id` NULL), su plan y sus órdenes, y pueden **reportar fallas** (solo insertar correctivas `reportada` a su nombre). Los costos están en otra tabla solo ADMIN, así los jefes nunca los ven. Probado en transacción deshecha: jefe de Mecanizados ve 1 de 2 equipos, no reporta en Fundición, no edita ni cierra, ve 0 costos; Ventas no ve nada.
- **Número OT-0001** lo pone un trigger (max+1 con candado), no la app: los jefes no ven todas las órdenes y el cálculo en el navegador se repetiría.
- **Preventivas:** `mant_generar_preventivas()` crea la orden 7 días antes de `proxima_fecha`; no hay cron, la llama la app cada vez que alguien abre Mantenimiento. No duplica (salta tareas con orden abierta). Al cerrar, la próxima fecha se cuenta desde el día en que se hizo.
- **Cerrar orden:** `mant_cerrar_orden()` (solo ADMIN, todo en una transacción): guarda costos, descuenta repuestos con una salida `MNT-0001` (precio_costo del ítem, motivo «Mantenimiento OT-…», destino «Mantenimiento: equipo»), guarda el tiempo parado y deja el equipo Operando si no le queda otra orden que lo tenga parado.
- **Equipo parado:** al reportar con «sí, está parado», un trigger marca el equipo Parado y empieza a contar `inicio_paro`.
- **Costeo:** `mant_equipos.costeo_equipo_id` es opcional; si está, el presupuesto anual (`mantenimiento_anual`) sale de Costeo. Se dejó tabla propia (no columnas en `costeo_equipos_planta`) porque Costeo tiene valores sensibles y RLS solo ADMIN/acceso_costeo, y los jefes necesitan ver los equipos.
- Menú: módulo «Mantenimiento › Equipos de planta» para ADMIN; ítem «Mantenimiento» para los jefes de Fundición, Mecanizados y Ensamble (no está en su barra inferior del celular, sí en el menú ☰).
- Decisiones por defecto (Angie no las definió, se pueden cambiar): cierra órdenes solo ADMIN (no hay rol Mantenimiento); los repuestos salen por defecto de ALMACEN pero se puede elegir otra bodega; los equipos se crean a mano (no había Excel).
- Pendiente / después: preventivos por horas de uso (horómetro), indicador de cada cuánto falla un equipo, foto en la ficha del equipo (la columna `foto_url` ya existe).

## Rediseño de pantallas de Fundición (29-oct-2026)

Las 7 pantallas de `src/components/fundicion/` (Fundidas, Registrar fundida, Órdenes de moldeo, Nueva orden,
Recogida, BOM, Analítica) se pasaron a la guía `ux-feisen`: `EncabezadoPagina`, un solo botón azul, chips de
filtro con conteos, búsqueda por palabras sin tildes (`coincideBusqueda`), detalle en `PanelLateral`,
`Contador` − / + para cantidades, barra de guardar fija abajo en celular y avisos con `useAviso`. Solo tokens
`feisen-*` (ámbar = atención, rojo = problema). **Las llamadas a Supabase quedaron idénticas** (comparadas
línea por línea contra el commit anterior). Cambios menores de comportamiento:
- Moldeo: órdenes en curso con más de 7 días van arriba en "Requieren atención". "Ver canceladas" pasó a
  ser un chip. Ya no se puede registrar avance en una orden cancelada.
- BOM: quitar una pieza pide confirmación.
- Registrar fundida: tras guardar, el formulario se limpia y muestra aviso (antes, pantalla de éxito).
- Recogida: los contadores solo aceptan números (antes se podía guardar NaN escribiendo "3,5" o letras).
- Demo local para revisar diseño sin tocar la base: `npx vite --config vite.fundicion-demo.config.mjs`
  (puerto 5182, datos inventados en `.claude/demo-fundicion/supabase-mock.js`, `?rol=ADMIN` cambia el rol).

**Errores de lógica encontrados en la revisión (1 y 2 corregidos; el resto pendiente de decisión):**
1. ~~Guardados no atómicos~~ **Corregido (29-oct):** siguen siendo varios pasos (sin transacción en la base),
   pero reintentar ya no duplica. Registrar fundida guarda la fundida pendiente y el botón pasa a "Reintentar
   descuento" (solo inserta los materiales); Nueva orden reutiliza la orden ya creada y solo inserta máquinas/
   piezas si no existen; Recogida revisa antes de cada movimiento si ya existe uno vigente con la misma
   referencia (entrada de piezas `ORD-MOL-xxxx`, salida de hierro `ORD-MOL-xxxx · FUN-xxxx`, entrada de
   vaceadero). Si se abandona tras el fallo, queda lo guardado (p. ej. una orden sin piezas), como antes.
   La solución de fondo sería una función RPC en Postgres con transacción (requiere migración).
2. ~~Hierro descontado dos veces~~ **Corregido (29-oct):** en Recogida, una fundida cuyo hierro ya se descontó
   en otra orden aparece deshabilitada ("hierro ya descontado en ORD-MOL-xxxx") y al guardar se vuelve a
   revisar en la base. Decisión: el hierro de una fundida se carga completo a UNA sola orden; si una colada
   alimentó varias órdenes, las demás se registran "Sin vincular".
3. Números consecutivos (`generarNumero`/`generarNumSalida`: último + 1) pueden repetirse si dos personas
   guardan al mismo tiempo.
4. BOM y Cancelar orden ignoran el error de Supabase: si la base rechaza el cambio, la pantalla igual lo muestra.
5. Nueva orden y Editar orden permiten piezas con cantidad 0 o vacía.
6. Analítica: la paginación de movimientos de hierro/vaceadero no tiene `.order()` (con más de 1000 filas puede
   saltar o repetir), y los movimientos se filtran por `fecha_movimiento` mientras las órdenes por `fecha`.
7. Fundidas: `hierro_colado_contaminado` se muestra pero el formulario nunca lo llena; no se valida
   hora fin > hora inicio.

## 2026-10-29 · Permisos por rol editables (Configuración › Permisos) — etapa 1
- Pedido de Angie: ver y editar desde la app qué ve cada rol, pensando en sumar operarios y más gente.
- Tabla `rol_permisos` (rol × módulo → `no`/`ve`/`registra`/`todo`), migración `2026-10-29_rol_permisos.sql` (**aplicada** con OK). Se cargó con lo que cada rol veía ese día, así que nada cambió al activarla. Todos la leen; solo ADMIN la edita; ADMIN no se guarda (siempre todo) y Configuración es solo ADMIN.
- Catálogo de módulos en `src/permisos/modulos.js` (clave, rutas, niveles que la pantalla soporta). **Para un módulo o ruta nueva: agregarla ahí y en `PANTALLAS` de App.jsx**; si no, nadie fuera de ADMIN la ve.
- `App.jsx` ya no tiene un bloque de rutas por rol: genera las rutas desde los permisos (`puede(modulo)` del AuthContext). Inicio según rol: ADMIN gerencia, CONSULTOR su tablero, RRHH va a Colaboradores, quien registra movimientos ve el tablero de bodega, el resto va a su primera pantalla; sin módulos ve un aviso.
- **Efecto colateral bueno:** antes cualquier rol sin bloque propio (p. ej. el rol `RECURSOS_HUMANOS` de la tabla roles, o uno creado nuevo) caía en las rutas de ADMIN. Ahora no ve nada hasta que se le den módulos.
- `Layout.jsx`: se conserva el menú curado de cada rol, filtrado por sus permisos, y se le agregan agrupados los módulos que se le den y no estaban en su lista.
- Niveles que de verdad cambian algo dentro de la pantalla: Productos (Ve = solo consulta; `puedeEditar`) y Pedidos (Todo = gestiona los de todas las áreas, lo que antes era «ser Logística»). En el resto el módulo es sí/no y lo de adentro sigue dependiendo del rol.
- **Etapa 2 pendiente:** las políticas RLS (118 en 64 tablas) siguen por rol fijo. Si se le da a un rol algo que no tenía, la matriz lo marca con ⚠ porque la pantalla puede salir vacía. Pasar las RLS a `rol_permisos`, módulo por módulo, cada lote con OK de Angie.
- Roles de la tabla `roles` que hoy no usa nadie: `RECURSOS_HUMANOS` (duplicado de RRHH). `JEFE_ENSAMBLE` lo usa el código pero no está en la tabla roles.
- **2026-10-30 · Limpieza de roles** (`2026-10-30_limpieza_roles.sql`, **aplicada** con OK): se borró `RECURSOS_HUMANOS` (0 usuarios, sin RLS ni permisos) y se agregó `JEFE_ENSAMBLE` a la tabla `roles` (amarillo) para poder asignarlo. Decisión: se siguen usando roles como plantillas de cargo (rol = qué hace, bodega = dónde); excepciones por persona solo si aparece un caso real. Consultor y los roles nuevos de OF (COMERCIAL, JEFE_VENTAS, JEFE_AREA) quedan para la definición del 2026-10-31.
- **2026-10-30 · OF por la matriz + rol Asesor comercial** (`2026-10-30_of_permisos_comercial.sql`, **aplicada** con OK; probada antes en transacción revertida simulando a Fabián). Primer módulo de la **etapa 2**:
  - Función `mi_nivel(modulo)` (ADMIN → 'todo'; si no, `rol_permisos` del rol; inactivo → 'no'). Reutilizarla para los siguientes módulos.
  - OF: `of_puede_editar()` = nivel 'todo' (todas las OF); `of_puede_crear()` = 'registra' o 'todo'; `of_puedo_editar_orden(id)` = 'todo', o 'registra' y `creado_por = auth.uid()`. Así quedaron las RLS de `ordenes_fabricacion`, `items_of`, `of_entregas` (entrega/reversión solo en OF que puede editar), `of_clientes`/`of_productos` (crear y renombrar con 'registra'; borrar solo ADMIN) y el bucket `of-adjuntos` (borrar: 'todo' o el dueño del archivo). Registrar fabricación no cambió (ADMIN o centro de costo).
  - Decisión de Angie: **el asesor ve todas las OF y solo edita las que él creó**. En la app OF vieja COMERCIAL editaba todas.
  - Rol `COMERCIAL` («Asesor comercial», verde) con `of = registra`. Todavía **sin personas**: pasar a Fabián (y crear a Viviana) cuando Angie diga.
  - En la app: el módulo `of` ofrece Registra/Todo y tiene `rlsPorMatriz` (la matriz no muestra ⚠). `AuthContext` expone `puedeEditarOF(orden)`; `esComercial` = no ADMIN con OF en Registra o Todo (vista comercial). Lista, calendario (arrastrar) y editar (`/of/nueva?editar=`) respetan las propias. La pestaña «Dashboard de ventas» (facturación Odoo) se ve solo para ADMIN porque `ventas_puede_ver()` es solo ADMIN; si los asesores deben verla, cambiar esa función.
  - Ojo: con 'registra' el asesor puede actualizar columnas de sus `items_of` (igual que en la app OF vieja); la pantalla no lo permite, pero la base sí.
- **2026-10-30 · OF nivel «Ve»: despachos y jefes de área** (`2026-10-30_of_despachos_y_areas.sql`, **aplicada** con OK).
  - Angie había creado un *usuario* (Alexander Sanchez) con rol Consultor, no un rol; por eso «no salía» en Permisos. Ojo: editar la columna Consultor cambia a todos los consultores.
  - Módulo `of` con niveles Ve/Registra/Todo y `rutasNivel` (Nueva OF, Dashboard, Productos OF y Clientes piden Registra). `puedeRuta(ruta)` en `AuthContext` arma menú y rutas con eso (`nivelAbreRuta` en `modulos.js`).
  - Ve **sin área** (`profiles.centro_costo_of` vacío) = `ofDespacho`: la vista «Pedidos en producción y despacho» de la app OF (sin cliente ni botones). Ve **con área** = `esJefeArea`: solo productos de su centro y registra/reversa fabricación (RLS `of_producciones_insert` por centro).
  - Nuevo campo «Área en las órdenes de fabricación» en Configuración › Usuarios (guarda `centro_costo_of`, solo ADMIN por el trigger `proteger_campos_perfil`).
  - Rol `DESPACHOS` (of ve, productos ve) → Alexander (bodega MOTORES). LOGISTICA, JEFE_FUNDICION y JEFE_MECANIZADOS con of = ve. Julián → Fundición Hierro, William Angulo → Poleas (aluminio).
  - William Roa (usuario nuevo, Jefe Ensamble, bodega ARMADO Y SOLDADURA): `2026-10-30_of_william_roa.sql` (**aplicada** con OK) da JEFE_ENSAMBLE of = ve y le pone área Construequipos (= producción). No ve Fundición Hierro, Poleas ni Repuestos.
  - Pendiente seguridad: el SELECT de las tablas de OF sigue abierto a cualquier usuario activo (`get_my_rol() IS NOT NULL`); ocultar el cliente es solo de pantalla. Cerrarlo a `mi_nivel('of') <> 'no'` cuando se confirme que ninguna otra pantalla lee OF.

## 2026-10-29 · Ventas: traer el mes directo de Odoo (FC)

- FC está en Odoo Online `https://fc-sas.odoo.com`, base `fc-sas`, **Odoo 19 Enterprise**. Feisen está en Odoo.sh (pendiente).
- Función `supabase/functions/ventas-odoo`: con la API JSON-2 de Odoo 19 lee `account.invoice.report` (publicadas, `out_invoice`, fecha de factura en el mes), agrupa por cliente + producto (quita el código `[..]` del producto) y devuelve las filas. No guarda: el tablero muestra el mismo resumen que con el Excel y guarda con `ventas_cargar_mes`. Solo quien pasa `ventas_puede_ver()`.
- Clave: secreto de Supabase `ODOO_FC_APIKEY` (clave API de un usuario de Odoo con acceso a Contabilidad). Odoo Online solo permite la API en el plan Personalizado (Custom).
- Botón "Traer de Odoo" en Cargar informe.
- Función desplegada en Supabase. Pendiente: la actualización diaria automática.
- Feisen conectado (2026-10-29): `https://construequiposfranco.odoo.com`, base `snva-proyectos-master-construequipos-main-28681200` (Odoo 19 Enterprise, nombre de base de Odoo.sh), secreto `ODOO_FEISEN_APIKEY`. El botón se ve para las dos empresas.
- Primera prueba (FC, sep 2026): solo facturas dio $260.020.055; el tablero (datos de origen) tenía $258.670.055 = Total Ingresos del estado de resultados, que resta notas crédito (~$1.350.000). Decisión de Angie: **"Traer de Odoo" resta las notas crédito** (`out_refund`, que en `account.invoice.report` ya viene con valor y cantidad negativos) y el resumen dice cuánto restó. El Excel del tutorial sigue trayendo solo facturas: para FC usar el botón.
- **Actualización automática cada 15 min** (migración `2026-10-29_ventas_odoo_auto.sql`, aplicada 2026-10-29): `pg_cron` job `ventas-odoo-auto` → `net.http_post` a la función con header `x-cron-token` (token aleatorio en Vault `ventas_odoo_cron`, validado con `ventas_cron_token_ok`, solo service_role). La función trae el mes en curso (hora Colombia) de Feisen y FC, y el anterior los días 1–5; guarda con `ventas_cargar_mes` (ahora también acepta service_role), archivo "Automático · Odoo". Si Odoo devuelve 0 filas no borra nada. La función se desplegó con `verify_jwt = false` (hace su propia verificación: token de cron o `ventas_puede_ver()` con el JWT del usuario).
- Primera corrida OK: oct 2026 Feisen 156 filas / $498.165.864; FC 117 filas / $277.600.710. Respuestas de cada corrida en `net._http_response`; log de la función en Supabase.
- El tablero trata el mes calendario en curso como parcial (al día de hoy, con proyección); `MD` ahora es el número de días del mes real.

## 2026-10-30 · Claves API de Odoo vencidas (Ventas automático y Finanzas)
- Desde al menos las 2:45 a. m. (hora Colombia) del 30/10, Odoo rechaza (401) las claves `ODOO_FEISEN_APIKEY` y `ODOO_FC_APIKEY` en las dos empresas: la actualización automática de Ventas lleva horas fallando (se ve en `net._http_response`, que solo guarda ~6 horas).
- Causa probable: las claves se crearon el 29/10 con duración corta (Odoo 19 pide la duración al crear la clave API). **Al crear claves nuevas, elegir "Persistente" (o 1 año)** y guardarlas en Supabase › Edge Functions › Secrets con el mismo nombre; no hace falta volver a desplegar las funciones.

## 2026-10-30 · Módulo Finanzas (solo ADMIN, datos de Odoo en vivo)
- Menú **Finanzas**: Resultado por centro (`/finanzas/resultado`), Cartera (`/finanzas/cartera`), Cuentas por pagar (`/finanzas/por-pagar`) y Flujo de caja (`/finanzas/flujo`). Código en `src/components/finanzas/`. Módulo `finanzas` con `soloAdmin` en `permisos/modulos.js`.
- No guarda nada en Supabase: cada pantalla llama a la función `finanzas-odoo` (solo lectura, `verify_jwt` + `ventas_puede_ver()`), acciones `resultado` (empresa, mes) y `pendientes` (empresa). Tarda 1–2 s por empresa. Selector Feisen / FC / Ambas (se recuerda en `feisen-finanzas-empresa`).
- **Centros** = cuentas analíticas de Odoo (un plan por empresa, los mismos 5: Aluminio, Construequipos, Hierro, Mantenimientos, Repuestos). FC llama "CONSTRU" a Construequipos: `normCentro()` los une en "Ambas".
- **Resultado por centro** (decisiones de Angie, 30/10): ventas (facturas de cliente − notas crédito, sin IVA) menos **solo compras a proveedores** (facturas de proveedor − notas crédito, sin IVA). No usa las cuentas contables (nómina, clase 7, costo de ventas contable quedan fuera). Lo que no tiene centro en Odoo se **reparte según las ventas del mes** de cada centro (se muestra cuánto). "Ambas" suma las dos empresas sin eliminar lo que se compran entre ellas. Sep 2026: compras Feisen $326,8 M ($33,9 M sin centro), FC $136,4 M (todo con centro); ventas Feisen $540,3 M.
- Feisen registra compras de materia prima a la 140500 (inventario): igual cuentan como compra del mes, porque el criterio es "lo comprado".
- **Cartera / por pagar**: líneas abiertas de cuentas por cobrar / por pagar (`reconciled = false`), por tercero y edad (al día, 1–30, 31–60, 61–90, +90 según `date_maturity`). Saldo negativo = anticipo a favor.
- **Flujo de caja**: saldo contable de las cuentas de los diarios banco/caja (sin tarjetas de crédito) + cobros − pagos por semana según vencimiento, 8 semanas; lo vencido en su fila, con casilla para sacarlo de la proyección.
- **Datos para revisar en Odoo (30/10):** (1) la cuenta "BANCO" de FC (111001) da **$1.476 M** y su caja $68,6 M: parece que no se registran los pagos o la conciliación está atrasada → el saldo de bancos de "Ambas" no es real hasta corregirlo. (2) Varias facturas de Feisen vencen el mismo día que se emiten (sin plazo de pago), así que aparecen vencidas en cartera. (3) Hay pendientes muy viejos que parecen saldos iniciales de la migración (p. ej. FERREOXI, 1.188 días; MAQUIEQUIPOS, 215 días).
- **Flujo de caja sin bancos de FC (decisión de Angie, 30/10):** mientras contabilidad organiza el banco de FC, el saldo de hoy solo suma bancos y caja de Feisen (`BANCOS_OMITIDOS = ['fc']` en `FlujoCaja.jsx`; FC se lista tachado). Los cobros y pagos de FC sí entran en la proyección. Cuando FC esté conciliado, vaciar esa lista.
- Pendientes: tendencia de varios meses en Resultado; quitar ventas entre Feisen y FC en "Ambas" si se necesita consolidado real; permisos para contabilidad cuando haya rol.
- **Pendiente (decidido 2026-10-30, más adelante con Leidy):** "Crear cotización en Odoo" desde el ERP (opción elegida por Angie): el ERP crea la cotización en Odoo como borrador (`sale.order`), con precios de la lista de precios que ya tienen. Implica que la conexión pase de solo leer a escribir en Odoo; definir qué roles la usan. Otro pendiente conversado: apartado de costos (recomendado empezar por margen por producto/cliente; revisar antes que los costos de producto en Odoo estén bien cargados).
- Botón **"Actualizar desde Odoo"** (barra de pestañas del tablero, solo ADMIN): llama la función con `accion: 'actualizar'`, que corre lo mismo que la tarea de cada 15 min y recarga el tablero. Al lado muestra hace cuánto fue la última actualización automática.
- **2026-10-30 · Sin subir Excel** (pedido de Angie): se quitaron las pestañas "Cargar informe" y "Tutorial: descargar informes" con el lector de Excel, "Traer de Odoo" por mes, sus estilos y `public/ventas-tutorial/`. El tablero queda con Resumen y Análisis, y la única acción manual es "Actualizar desde Odoo" (mes en curso de las dos empresas). La función `ventas-odoo` conserva el modo por mes (`{empresa, mes}`, solo lee) por si se necesita cargar un mes viejo; `ventas_cargar_mes` y los datos 'base' se quedan.
- 2026-10-30: se compararon abril–septiembre 'base' contra Odoo (función con token de cron, `{meses:[...], guardar:false}`): **los totales coinciden** en las dos empresas (diferencias de centavos por redondeo); los datos 'base' ya eran ventas netas de notas crédito. Para cargar meses viejos: misma llamada con `guardar` omitido (ver `net._http_response`).
- 2026-10-30: por pedido de Angie se reemplazaron abril–septiembre de Feisen y FC con datos de Odoo (mismos totales). Desde ahí **no quedan filas 'base'**: los 14 meses (abr–oct × 2 empresas) son `origen='odoo'`, "Automático · Odoo".

## Nuevo módulo: Manuales de procedimiento (2026-10-30)

Biblioteca de manuales, procedimientos, instructivos, formatos y políticas por área, con versión vigente e historial. Ruta `/manuales`, componentes en `src/components/manuales/`, migración `supabase/migraciones/2026-10-30_manuales.sql` (**ya aplicada** en Supabase el 2026-10-30).

- **Modelo**: `manuales` (código único tipo `PR-FUN-001`, título, tipo, área, responsable, próxima revisión, `version_actual`, `activo`) + `manual_versiones` (una fila por archivo subido, con "qué cambió" y "vigente desde"). `version_actual = 0` = creado sin archivo. Archivos en el bucket privado `manuales` (50 MB máx.), se abren con enlace firmado de 5 min.
- **Áreas**: catálogo fijo en `manuales/comun.js` (`AREAS`, texto libre en la base): agregar un área no requiere migración. El código se sugiere solo con tipo + área (`codigoSugerido`).
- **Permisos por la matriz (etapa 2, `rlsPorMatriz`)**: módulo `manuales`, niveles `ve` (consulta los activos) y `todo` (crea, sube versiones, marca obsoleto). La migración le dio `ve` a **todos** los roles de la tabla `roles`. Los obsoletos no se borran: la RLS los oculta a quien solo tiene `ve`.
- **Menú**: ítem suelto "Manuales" en `NAV_ADMIN`, puesto al final de la lista a propósito — si va arriba desplaza la barra inferior del celular del admin (se arma con los 5 primeros ítems).
- **Flujo de aprobación (ISO 9001 §7.5, migración `2026-10-30_manuales_aprobacion.sql`, aplicada el 2026-10-30)**: cada versión pasa por `borrador → en_revision → revisada → aprobada`. Elabora `registra`/`todo`; revisa `todo` y nunca quien elaboró; aprueba **solo ADMIN** (si no elaboró, puede revisar y aprobar en un paso). Devolver exige comentario y regresa a borrador. Los cambios de estado van solo por la función `manual_version_accion` (SECURITY DEFINER); por RLS directo solo se crea el borrador y quien lo elaboró le cambia el archivo o lo descarta. Un solo borrador abierto por documento (índice único parcial) para que los números de versión no salten. Al aprobar, la próxima revisión se corre a un año desde la vigencia.
- **Gotcha — solo hay un ADMIN**: si Angie elabora un documento, otra persona con nivel `todo` en Manuales tiene que revisarlo antes de que ella lo apruebe. Hoy nadie más tiene `todo`: hay que dárselo a quien haga de Calidad.
- **«Ya está aprobado en papel»** (`cargar_aprobado`, solo ADMIN): para cargar de una vez los documentos que ya estaban firmados. Queda `aprobado_externo` y el listado maestro lo dice.
- **Listado maestro** (botón en la pantalla, nivel `todo`): Excel con código, versión vigente, elaboró/revisó/aprobó, próxima revisión y estado (`exportarListadoMaestro` en `utils/exportExcel.js`).
- **«Leído y entendido» (migración `2026-10-30_manuales_lecturas.sql`, aplicada el 2026-10-30)**: `manuales.dirigido_a` = roles que deben leerlo (vacío = todos; ADMIN nunca, es quien aprueba). `manual_lecturas` guarda una confirmación por persona y versión: al aprobarse una versión nueva vuelve a quedar pendiente. Solo se confirma la versión vigente de un documento activo; no se edita ni se borra.
- **Gotcha — nombres de personas**: las RLS de `profiles` solo dejan ver el propio perfil (o todos a ADMIN). Un join `profiles!…(nombre)` le devuelve null a cualquier otro rol. Por eso los nombres de elaboró/revisó/aprobó salen por `manual_nombres(ids)` (`ponerNombres` en `manuales/comun.js`), y la lista de quién leyó por `manual_lecturas_estado` / `manual_lecturas_resumen` (SECURITY DEFINER, solo nivel `todo`). La primera entrega del flujo usaba el join y no se habría visto con un revisor que no fuera ADMIN.
- **Avisos**: contador azul junto a «Manuales» en el menú = por leer + trámites que le tocan (aprobar, revisar, devuelto) + revisiones vencidas (nivel `todo`), de `manuales_mis_avisos()`. Se recarga en cada pantalla (Layout se monta por ruta) y cuando Manuales dispara el evento `manuales-cambio`. En la pantalla, la bandeja «Te toca» incluye «Por leer» y «Revisión vencida», y el indicador muestra cuántas revisiones vencen en 30 días.
- **Pendiente para ISO**: aviso por correo (resumen semanal con Resend, como la nómina); enlazar los documentos desde las no conformidades y desde Costeo/Ensamble.
- **Documentos escritos en la app — asistente guiado (2026-11-03, migración `2026-11-03_manuales_contenido.sql`, aplicada)**: una versión es un archivo subido (`archivo_path`) o un documento escrito en la app (`contenido` jsonb); un CHECK exige uno de los dos. La estructura de cada tipo (partes, ayuda, consejos, ejemplos y revisiones automáticas) vive **solo** en `manuales/estructura.js`; de ahí salen el asistente (`Asistente.jsx`), la vista en pantalla (`VistaDocumento.jsx`), el PDF (`utils/documentoManualPDF.js`, jsPDF) y el Word (`utils/documentoManualWord.js`, librería `docx` 9.12 agregada con OK de Angie). Los tres recorren los mismos bloques de `documento.js`. Los formatos no pasan por bloques: salen como hoja en blanco para imprimir.
- **Diagrama de flujo**: se arma solo desde el paso a paso (`diagrama.js`): SVG en pantalla y PNG (vía canvas) para PDF y Word. Las decisiones salen en rombo con su salida «No».
- **Guía ISO** (`plantillasIso.js` + `GuiaIso.jsx`): 20 documentos sugeridos para una planta como Feisen con plantilla prellenada; el texto [entre corchetes] es lo que el área debe completar y el asistente no deja enviar a revisión mientras quede alguno. `manuales.plantilla` guarda de qué plantilla salió para marcarla en la guía. Las temperaturas de colada, montos y tiempos de las plantillas están entre corchetes a propósito: son valores de ejemplo que Fundición/Gerencia deben confirmar.
- **Gotcha — macOS no distingue mayúsculas**: `GuiaIso.jsx` y `guiaIso.js` chocaban en el build; por eso los datos se llaman `plantillasIso.js`.
- **Gotcha — `fixed` dentro del panel lateral**: `PanelLateral` usa transform (animación), así que un overlay `fixed inset-0` dentro de él queda encerrado en el panel. El Lector se monta con `createPortal` en `document.body`.
- **Lo editado en el Word no vuelve a la app** (lo dice el pie del documento): el documento controlado es el de la app; para cambiarlo se hace una versión nueva, que parte de la vigente.

## 2026-10-30 · Conteo cíclico semanal (Inventario físico)
- Tarjeta "Conteo cíclico · semana del …" encima de la lista de conteos (solo ADMIN, como toda la pantalla). Por bodega sugiere `ceil(productos / 13)` productos a la semana (todo el inventario cada ~3 meses); MOTORES `ceil(productos / 4)` (cada mes). Barra con el % del inventario contado (confirmado) en los últimos 90 días.
- Selección (`src/utils/conteoCiclico.js`): primero los que no tienen conteo confirmado dentro del ciclo; entre ellos sorteo ponderado sin reemplazo (`-ln(u)/peso`, peso = 1 + ln(1 + movimientos 90 días)), con `u` sacado de un hash de `semana|item_id`. Solo usa datos de antes del lunes → la lista no cambia en la semana aunque se vayan confirmando conteos. Sin tablas nuevas.
- "Contar" abre un conteo normal restringido a esa lista (estado `soloKeys` del editor), con título `Conteo cíclico · BODEGA · semana AAAA-MM-DD`. Ese título es el que amarra el borrador a la selección: al "Seguir" se recalcula la lista de esa semana. Si se le cambia el título, el borrador se abre con todos los productos (no se pierde nada).
- Avance "x de N": productos de la lista con cantidad en cualquier conteo (borrador o confirmado) fechado desde el lunes. El ícono de impresora saca la planilla a ciegas solo con esa lista.

## 2026-10-30 · Conteo cíclico pasa a mensual y arranca en noviembre
- Angie sintió muy poco tiempo y la gente no alcanza: ahora sale **una lista al mes** (cambia el día 1) y todo el inventario se cubre **cada 6 meses** (MOTORES cada 2 meses). Con el inventario de hoy: Almacén 103, Mecanizados 66, Fundición 36, Motores 21, Ferretería 8, Corte y doblez 3 por mes.
- Arranca el **1 de noviembre de 2026** (`INICIO_CICLICO` en utils/conteoCiclico.js); antes de esa fecha la tarjeta solo muestra el aviso.
- Título del conteo ahora `Conteo cíclico · BODEGA · mes AAAA-MM` (reemplaza el formato semanal, que nunca se llegó a usar). Barra de cobertura: % contado (confirmado) en los últimos 6 meses. Lo de la entrada anterior (semanal) queda reemplazado por esto.

## 2026-10-30 · Conteo cíclico se aplaza a 2027
- Angie decidió implementarlo desde **enero de 2027**: `INICIO_CICLICO = '2027-01'`. Hasta entonces la tarjeta de Inventario físico solo muestra "El conteo cíclico arranca el 1 de enero de 2027". La primera lista sale el 1 de enero; no hay que tocar nada más ese día.

## 2026-11-03 · Inventario físico: % de diferencia por conteo
- Cada conteo muestra **contados**, **con diferencia** y el **% con diferencia sobre lo contado** (no sobre toda la bodega): en la lista (debajo de la fecha), en el panel de detalle (3 tarjetas) y mientras se cuenta (tarjeta "Con diferencia" y barra de abajo). Función `resumenConteo` en InventarioFisico.jsx; lo que quedó sin cantidad no entra, y la diferencia se redondea a 3 decimales como en el resto de la pantalla.
- La lista trae `inventario_fisico_items` de los 100 conteos visibles en una consulta aparte (pocas miles de filas); sin tablas ni vistas nuevas.

## 2026-11-03 · Pedidos con varias OC y compra directa por línea
- Un pedido ya podía tener varias OC (`ordenes_compra.pedido_id`, una por proveedor; el modal solo propone lo que falta). En la base hay varios así: PED-0214, PED-0193, PED-0179, PED-0151, PED-0130 (4 OC). Lo que faltaba era verlo y poder mezclar con compra directa.
- Columna nueva `pedido_items.cantidad_compra_directa` (migración `supabase/migraciones/2026-11-03_pedido_items_compra_directa.sql`, OK de Angie). Falta por comprar de una línea = cantidad − máx(en OC + compra directa, recibido). Solo se calcula si el pedido tiene alguna OC de la app o compra directa por línea (los viejos con texto libre en `numero_oc` no dicen qué cubre qué) y no está pendiente, recibido ni cerrado (`faltaComprar` en ListaPedidos.jsx).
- Ficha: aviso «Falta comprar N de M productos» y botón «Otra OC» junto a Recibir. Detalle: lo mismo + «Compra directa», y por línea «en OC · compra directa · sin comprar». Menú ⋯: «Compra directa de lo que falta».
- Compra directa: ahora pide qué líneas (todas marcadas); guarda la cantidad en cada línea, suma «Compra directa · quién» a `numero_oc` en vez de reemplazarlo y deja historial `compra_directa`. Desde pendiente sigue pasando a En camino.
- «Generar OC» descuenta también lo comprado directo y, si el pedido ya tiene algo cubierto, viene con las líneas que faltan ya marcadas.

## 2026-11-03 · Almacén (Mateo Giraldo) edita los paquetes de su bodega
- Pedido de Angie. `rol_permisos`: ALMACENISTA · paquetes = todo (Mateo es el único almacenista activo; se quita en Configuración › Permisos). El menú lo agrega solo (módulos dados que no estaban en NAV_ALMACENISTA).
- RLS nuevas `paquetes_manage_bodega` y `paquete_items_manage_bodega`: con `mi_nivel('paquetes') = 'todo'` se crea/edita/borra solo en las bodegas de `profile_bodegas`. ADMIN conserva su política. Migración `supabase/migraciones/2026-11-03_paquetes_por_bodega.sql` (OK de Angie). Probado simulando la sesión de Mateo: puede los 25 de ALMACEN, ninguno de MECANIZADOS. El módulo queda `rlsPorMatriz`.
- GestionPaquetes.jsx: quien no es ADMIN solo ve las pestañas de sus bodegas (sin pestañas si es una sola).

## 2026-11-03 · Inventario físico: diferencias en plata
- Lista: cada conteo muestra además la diferencia neta en $ (copCorto). Detalle: faltante, sobrante y neto, la plata de cada producto y las diferencias ordenadas de mayor a menor valor; avisa cuántos productos con diferencia no tienen costo (no suman).
- Precio: el `precio_costo_snapshot` del movimiento de ajuste (referencia = número del conteo, mismo producto y bodega); si no hubo ajuste (borrador) se usa el `precio_costo` actual (`preciosConteo`). La lista trae `items` y los movimientos `INV-FIS-%` en paginado.
- Arreglado: los valores negativos salían "$-15.000"; ahora `copSigno` → "−$15.000" / "+$45.600" en toda la pantalla (detalle, resumen del editor y confirmación).
- Hallazgo (3-nov): los conteos de lámina de CORTE Y DOBLEZ dan los faltantes más grandes: INV-FIS-0038 (oct) −$121 M y INV-FIS-0034 (sep) −$96 M. Ej. lámina calibre 12: sistema 124, contadas 8. Parece consumo de lámina que no se registra como salida.

## 2026-11-03 · Pedidos: "Guardando…" pegado al recibir el segundo pedido

- **Síntoma (Angie):** después de recibir un pedido, al abrir «Recibir» en otro el botón salía en «Guardando…» y no dejaba hacer nada hasta recargar la página.
- **Causa:** en `confirmarRecibido()` (`ListaPedidos.jsx`) las variables `pedidoActualizado`, `historialPendiente` y `numeroEntrada` se declaraban con `let` **dentro** del `try`, y el `finally` las usaba. El `finally` no las ve → `ReferenceError` antes de `setGuardandoRecibido(false)` y de soltar `recibidoEnCurso`. Venía del commit ed560766 (15/10/2026, número de movimiento en el historial).
- **Efecto colateral:** desde el 15/10/2026 (tarde) **no se escribió en `pedido_historial` ninguna recepción** (`recibido` / `parcialmente_recibido`). Los pedidos, cantidades y entradas sí quedaron bien; solo falta esa línea del historial. Si se quiere, se puede reconstruir desde `pedidos.fecha_recibido` y `movimientos.pedido_id` (con OK de Angie).
- **Fix:** las tres variables se declaran antes del `try`. Revisé todo `src/` con un análisis del código (bloques `finally` que usen variables declaradas dentro de su `try`): era el único caso.
- **Historial reconstruido (3/11/2026, con OK de Angie):** `supabase/migraciones/2026-11-03_historial_recepciones_faltantes.sql` agregó 60 líneas a `pedido_historial` (46 `recibido`, 14 `parcialmente_recibido`): una por cada entrada (N° de movimiento) ligada a un pedido desde el 15/10, con su fecha y usuario, más PED-0140 y PED-0177 (recibidos sin entrada, sin usuario). El detalle termina en «(reconstruido el 3/11/2026)». En pedidos que después se cerraron, la recepción quedó como «Llegó una parte».
- **«Sigue apareciendo» (3/11/2026, tarde):** el arreglo ya estaba publicado, pero Angie recibió PED-0189 y PED-0248 con la versión vieja guardada en la app (tampoco quedó su historial). La PWA (`registerType: 'autoUpdate'`) solo buscaba versión nueva al abrirse. Ahora `src/main.jsx` registra el service worker con `virtual:pwa-register` y busca actualización **al volver a la app** (visibilitychange) y **cada hora si está en segundo plano**. Nunca busca mientras la pantalla está en uso, porque autoUpdate recarga la página al instalar y se perdería un formulario a medias. Demo (`vite.mov-demo.config.mjs`) tiene un stub de `virtual:pwa-register`.
- Se volvió a correr la misma migración (con OK de Angie) y agregó PED-0189 y PED-0248. Total reconstruido: 62 líneas, sin repetidas.
- **Hora corregida (4/11/2026, con OK de Angie):** las 60 líneas reconstruidas con entrada quedaron 5 h antes de la real (MOV-MG-0409 salía 5:32 a.m. y fue 10:32 a.m.; el almacenista lo notó). **Gotcha:** `movimientos.created_at` guarda la hora de Colombia como si fuera UTC, pero `pedido_historial.created_at` (y `pedidos.fecha_recibido`, `stock.updated_at`) guardan UTC real → al copiar una hora de `movimientos` a otra tabla hay que sumar 5 h. `supabase/migraciones/2026-11-04_historial_reconstruido_hora.sql` las movió +5 h; el script del 3/11 ya suma las 5 h. Las 2 sin entrada (PED-0140, PED-0177) estaban bien.

## 2026-11-04 · Una OC con productos de varios pedidos
- Pedido de Angie: elegir de los pedidos abiertos los productos que se le van a comprar a un mismo proveedor y sacar **una sola OC**. Botón «OC de varios pedidos» en Pedidos (ADMIN y Logística) → `ModalOCVariosPedidos.jsx`.
- **Sin cambios en la base.** Cada `orden_compra_items` ya apunta a su `pedido_item_id`, así que la cobertura y el «falta comprar» siguen igual. Si la OC queda con un solo pedido se guarda normal (`ordenes_compra.pedido_id`); si junta varios, `pedido_id` queda **vacío** y los pedidos se sacan de las líneas (`pedido_items.pedido_id`). Quien lea `ordenes_compra.pedido_id` para saber "de qué pedido es" tiene que mirar también las líneas (ListaPedidos: `ocPorPedido`; OrdenesCompra: `orden_compra_items(*, pedido_items(pedidos(numero)))`).
- Qué entra en la lista: pedidos por comprar (todo lo que no está en OC ni compra directa) y los en camino / llegó una parte que ya tienen alguna OC de la app o compra directa (`faltaComprar`). Los viejos con texto libre en `numero_oc` no salen: no se sabe qué cubre qué.
- Al guardar, en cada pedido: suma el N° de OC a `numero_oc`, pasa a En camino si estaba pendiente, fecha de llegada si se escribió, y historial «OC-XXXX generada (junto con PED-…)». En la ficha la OC sale con «junto con PED-…».
- PDF: «Pedidos de origen: PED-a, PED-b» y columna «Pedido» por línea cuando son varios.
- El selector de proveedor quedó en `SelectorProveedorOC.jsx` (lo usan las dos OC). De paso, «Generar OC» de un pedido ahora muestra lo comprado directo y no lo cuenta como pendiente.

## 2026-11-04 · OC: el proveedor se escribe, no se busca en la lista
- Pedido de Angie: la lista desplegable de proveedores era muy larga. `SelectorProveedorOC.jsx` ahora es un campo de texto: al escribir (nombre o NIT, sin importar tildes ni mayúsculas) salen hasta 8 coincidencias, primero las que empiezan por lo escrito. Al elegir una queda marcada en verde con su NIT. Si se escribe el nombre exacto de uno guardado, queda elegido solo.
- Si no existe: «+ Agregar «X» como proveedor nuevo» abre el formulario de proveedor nuevo con el nombre ya puesto. Si se escribe algo que no está y no se elige ni se agrega, la OC no se genera y lo explica.
- Aplica a las dos OC (la de un pedido y la de varios pedidos), que comparten el componente.

## 2026-11-04 · Pedidos: formulario de nuevo / editar pedido rediseñado
- Pedido de Angie («no se ve tan pulcro»). Los dos modales tenían el mismo formulario copiado; ahora es uno solo, `FormularioPedido.jsx` (también trae `SelectorProducto` y `UNIDADES`, que salieron de ListaPedidos).
- Estilo ux-feisen: productos en una lista con divisiones de 1 px (número, buscador, papelera) en vez de cajas grises; cantidad con el `Contador` de ui.jsx (el mismo de Movimientos); «Agregar otro producto» como última fila de la lista y no como botón punteado gigante; prioridad como selector segmentado (Urgente en rojo suave, Normal azul, Puede esperar verde); etiquetas en mayúscula pequeña; foto como una fila compacta (miniatura + Quitar); botones de 44 px fijos abajo, a la derecha en escritorio.
- Buscador de productos: ahora por palabras sueltas sin tildes («rodam 62» encuentra RODAMIENTO 6205) y dice cuando nada coincide.
- Inputs con `text-base` en celular (16 px) para que el iPhone no haga zoom al tocar el campo; `sm:text-sm` en escritorio.

## 2026-11-04 · Pedidos: días hábiles (sin sábados, domingos ni festivos)
- Pedido de Angie: el atraso y los plazos de los pedidos cuentan solo días hábiles. `src/utils/diasHabiles.js` (`habilesEntre`, `sumarHabiles`, `motivoNoHabil`, `hoyColombia`) usa los festivos de Colombia de Nómina (`festivosColombia` en catalogosRRHH.js), así que los dos módulos cuentan igual.
- Atraso = días hábiles después de la fecha estimada hasta hoy: si debía llegar el viernes, el sábado y domingo no está atrasado y el lunes lleva 1 (si el lunes es festivo, 0). Aplica en Pedidos (tarjetas, filtro y barra de Atrasados), Inicio de gerencia («el más atrasado…») y Dashboard ejecutivo (tabla de retrasados).
- «Por comprar · hace N días hábiles»; se pone en rojo a los **5 días hábiles** (una semana laboral; antes 6 días calendario). El «más viejo» de la tarjeta también.
- Fecha estimada de llegada (`FechaLlegada.jsx`, en Generar OC, OC de varios pedidos y Compra directa): botones «Llega en 1 · 2 · 3 · 5 · 10 días hábiles» que calculan la fecha saltando fines de semana y festivos; debajo dice el día («Llega el lunes, 9 de nov · en 3 días hábiles») y avisa si la fecha escogida a mano es sábado, domingo o festivo, o si ya pasó.
- No cambia: el lead time promedio del Inicio sigue en días calendario (es un promedio de cuánto tarda en llegar, no un atraso).

## 2026-11-04 · Producto «ESMALTE» (ALMACEN · PINTURA) eliminado
- Pedido de Angie, con OK al SQL. No tenía movimientos, pedidos, conteos, paquetes, BOM, costeo, nómina ni seriales; solo su renglón de stock en 0. `supabase/migraciones/2026-11-04_eliminar_item_esmalte.sql` (por id). Los otros 16 esmaltes siguen.

## 2026-11-04 · Inicio de gerencia por pestañas

- A pedido de Angie, el Inicio de ADMIN ya no apila todo: pestañas **Resumen · Ventas · Pedidos OF · Inventarios · Logística · Producción · Personas** (`src/components/admin/inicio/InicioGerencia.jsx`).
- **Resumen** = «Requiere tu atención» + una cifra por módulo (toca la cifra y abre su pestaña). **Ventas** monta el dashboard de Odoo (`of/ventas/DashboardVentas`); **Pedidos OF** monta `of/Dashboard`. Producción agrupa Mecanizados, Fundición y Calidad; Personas es RR. HH.
- La pestaña queda en la URL (`/dashboard?vista=ventas`) y se recuerda en el navegador (`inicio-vista`). El selector de periodo solo sale en Resumen, Producción y Personas (lo que lo usa). Las pestañas con un pendiente rojo/ámbar llevan un punto. «Ver rotación» cambia a Inventarios y baja hasta la rotación.
- Probado en vista previa local (datos vacíos) en escritorio y 375 px.

## 2026-11-04 · Historial lento: las firmas y fotos se bajaban con la lista
- Causa: `movimientos.firma_receptor_url` y `foto_remision_url` guardan la imagen como `data:image/…` dentro de la fila (~10 KB cada una, 1.482 firmas). Son ~30 de los 31 MB de la tabla. El Historial hacía `select('*')` de los últimos 5.000 movimientos → ~13 MB por carga, y en 5 pedidos uno tras otro.
- Arreglo: `src/utils/columnasMovimiento.js` (`COLUMNAS_MOVIMIENTO`, todas menos esas dos). El Historial y Reportes las usan; el detalle del Historial pide la firma/foto solo del movimiento abierto. Las 5 páginas se piden a la vez y se quitan repetidos por id. Medido: ~13 MB → ~3,2 MB.
- **Gotcha:** cualquier lista nueva de `movimientos` debe usar `COLUMNAS_MOVIMIENTO`, nunca `select('*')`. Los dashboards que traen 8–10 movimientos con `*` se dejaron igual (pesan poco).
- Pendiente posible: guardar las firmas en Storage (archivo) en vez de dentro de la fila. Hoy TODAS se siguen guardando como `data:image` (4/11/2026: 1.482 firmas de quien recibe y 999 «foto_remision» que en realidad son la firma del responsable; solo 2 son enlaces), así que la tabla sigue creciendo ~20 KB por salida firmada. Resuelto para las nuevas en la entrada siguiente.

## 2026-11-04 · Firmas nuevas se guardan como archivo en Storage
- `src/utils/firmas.js`: `subirFirma(dataUrl)` sube la firma a `remisiones/firmas/AAAA-MM/<uuid>.png` (bucket público que ya existía, política `remisiones_all_authenticated`; no hubo cambio de base) y devuelve el enlace. Si la subida falla, devuelve la imagen tal cual (se guarda como antes): el movimiento nunca se pierde por la firma.
- Se usa al guardar en `RegistrarMovimiento` (firma del responsable) y `RegistrarMovimientoAlmacenista` (firma de entrada, firma del responsable y firma de quien recibe en Mecanizados → producción).
- **Gotcha:** `foto_remision_url` guarda a veces la FIRMA del responsable y a veces la foto de la remisión. Para distinguirlas usar `esFirma(url)` (data:image o enlace con `/remisiones/firmas/`), nunca `startsWith('data:image')`.
- Firmas viejas migradas el 4/11/2026 (con OK de Angie) con la Edge Function de un solo uso `supabase/functions/migrar-firmas/index.ts`: 2.496 firmas (999 del responsable + 1.497 de quien recibe) → 688 archivos `remisiones/firmas/migradas/<md5>.png` (~5,4 MB; las líneas de un mismo movimiento comparten archivo). Verificado: 0 `data:image` en movimientos y los 688 enlaces tienen su archivo. La función quedó desactivada (responde 410); falta borrarla a mano en Supabase → Edge Functions (el conector no tiene "borrar").
- Gotcha de la migración: filtrar el update por la imagen completa (`.eq(col, img)`) da 400 porque va en la URL; se filtró por id + `like 'data:image%'`.
- La tabla sigue marcando ~34 MB porque Postgres no devuelve el espacio al sistema sin `VACUUM FULL` (bloquea la tabla; no se hizo). El espacio se reutiliza y lo que importa, lo que descarga la app, ya bajó.

## 2026-11-04 · Admin: revertir, editar y eliminar movimientos
- Ya existían (solo ADMIN) pero escondidas: un «···» gris claro con trazo fino en cada línea del detalle, casi invisible, y solo por línea. Ahora el detalle trae botones a la vista: **Editar** (si el movimiento tiene una sola línea), **Revertir / Revertir todo** y **Eliminar / Eliminar todo**. Con varias líneas, el «···» (más visible) sigue sirviendo para una sola línea.
- **Revertir** crea un contramovimiento por línea (todas las del mismo movimiento comparten un número MOV-NNNN nuevo); el stock lo ajusta el trigger `fn_actualizar_stock` al insertarlo. Si no se puede marcar el original como revertido, se borra el contramovimiento (el trigger de borrado deshace su stock). En transferencias también se revierte el otro lado (`REVERSIÓN PAR …`, ahora con `revertido_en`, así ya no aparece como revertible).
- **Eliminar** primero muestra todo lo que se borra y lo hace en UN solo `delete().in('id', …)` (todo o nada); el stock lo devuelve `fn_revertir_stock_on_delete`. Si la línea ya estaba revertida se borra también su reversión (antes quedaba la reversión sola y el stock se movía dos veces); si es una reversión, también el original; en transferencias, el otro lado y su reversión. Si un movimiento revertido no tiene su reversión (hay ~20 viejos así), no deja eliminarlo.
- **Editar**: a un movimiento revertido (o a una reversión) ya no se le puede cambiar cantidad ni producto (descuadraba el stock). En transferencias, cambiar la cantidad corrige también el otro lado y su stock. Cantidad 0 o vacía no se acepta.
- Entradas de un pedido (`pedido_id`): revertir/eliminar/corregir deja nota en `pedido_historial`; el estado del pedido no cambia solo. Sin cambios en la base (RLS: UPDATE/DELETE de `movimientos` ya eran solo ADMIN).
- `src/components/admin/Reportes.jsx` (con su `fn_revertir_movimiento`) no está enlazado en el menú; esa función no ajusta stock para los tipos `entrada`/`salida` actuales, no usarla.

## 2026-11-05 · Pedidos: el buscador busca en todos los estados
- Caso: «el PED-0209 no aparece». No estaba borrado: estaba `cerrado` (Mateo lo cerró el 3/11 «se creó otra orden para cambiar de proveedor» y Angie lo volvió a cerrar «Ya no se necesita», que pisó el motivo). La lista abre en «En curso» y el buscador filtraba dentro de esa vista, así que buscar «209» no daba nada. Le falta la ARANDELA BALDE (0 de 100).
- Arreglo (`ListaPedidos.jsx`): si hay texto en el buscador se ignora la tarjeta/etapa escogida (`buscaEnTodos` → `filtroActivo = 'todos'`); el encabezado dice «Búsqueda en todos los pedidos» y ninguna tarjeta queda marcada. Tocar una tarjeta borra el texto y filtra por ella. El rango de fechas solo (sin texto) sigue respetando la tarjeta.
- Pendiente posible: no dejar cerrar un pedido ya cerrado (el segundo cierre borra el motivo del primero).
- El hueco real en la numeración es el PED-0213: lo eliminó Mateo el 24/10 estando pendiente (queda en `pedidos_eliminados`).
- 5/11/2026: PED-0209 reabierto con OK de Angie (`supabase/migraciones/2026-11-05_reabrir_ped_0209.sql`, aplicada como `reabrir_ped_0209`): estado `parcialmente_recibido`, sin motivo de cierre, nota «Reabierto: falta ARANDELA BALDE (100 und)…» en su historial. Sus 11 entradas (MOV-MG-0408) no se tocaron.
- Hallazgo: MOV-MG-0408 está repetido: 11 líneas del PED-0209 (3/11 8:31) y el THINNER del PED-0226 (8:33), ambos de Mateo. Es el único número de movimiento usado en dos recepciones distintas. El Historial agrupa por número y los muestra como uno solo de 12 líneas. El Historial tampoco busca por número de pedido.

## 2026-11-05 · Historial: buscar por pedido y separar recepciones con el mismo número
- El buscador del Historial ahora también busca en el número del pedido (`pedidos(numero)`, que ya venía en la consulta): «209» o «PED-0209» encuentra sus entradas. Las entradas de pedidos muestran el número del pedido en la fila; el detalle ya lo mostraba.
- Agrupación: `claveGrupo(m)` = N° de movimiento + pedido (solo entradas con pedido). Así el MOV-MG-0408 sale como dos filas (PED-0209 y PED-0226) en vez de una de 12 líneas. El estado `detalle` guarda esa clave; el título del panel usa `numeroDetalle` (la parte antes de `|`). «Revertir todo»/«Eliminar todo» actúan solo sobre las líneas de ese grupo.
- No se sabe cómo se repitió el número: `confirmarRecibido` lo calcula como el último MOV-<iniciales> + 1 al guardar, y entre las dos recepciones hubo 2,5 minutos, así que una carrera normal no lo explica. Es el único caso en la base; si vuelve a pasar, revisar si alguna recepción se guardó desde una pantalla abierta desde antes.

## 2026-11-05 · Rastreo de seriales de motor (ERP + Odoo)
- Los seriales de motor viven sobre todo en `movimientos.serial_motor` (texto libre, a veces varios separados por «-»); `motor_seriales` solo tiene 22 filas recientes. Salidas con serial desde el 26/8/2026; antes no hay. El cliente no está en el movimiento: se cruza `numero_of` (texto libre: «253», «OF 253», «OC 202») con `ordenes_fabricacion.numero` → `cliente`.
- Para ventas anteriores, los seriales se escribían en la **nota de la cotización/factura de Odoo** («REF MOTOR …»). Ej.: 270325010207 (Good Year 9 HP) está en la COT00111 / factura CF5794 de Montesur (19/6/2026, OC P044486, «OF 8277» de la numeración vieja); la CF5784 es la misma factura, reversada.
- Búsqueda en Odoo: función de un solo uso `supabase/functions/buscar-serial-odoo` (solo lectura, términos fijos en el código; usa los secretos ODOO_* de ventas-odoo). Quedó desactivada (410); borrarla a mano en Supabase → Edge Functions. La versión que busca no quedó en git (solo el stub): para otro serial hay que reescribirla (search_read con `ilike` sobre account.move narration/ref, sale.order note, stock.lot name), desplegar, usar y volver a desactivar.

## 2026-11-05 · Inicio: rotación de inventario por bodega
- Pedido de Angie: filtrar la rotación por bodega y un informe más completo de los productos sin rotación.
- `InicioGerencia.jsx` (pestaña Inventarios → Rotación): selector «Todas las bodegas / cada bodega» (se recuerda en el navegador, `inicio-rotacion-bodega`; tocar una barra sigue filtrando). Con bodega elegida se ven solo su barra y su lista, y arriba una línea con productos sin rotación, valor quieto, % del valor y nunca movidos. Botón «Ver informe completo →».
- Informe nuevo `inicio/InformeSinRotacion.jsx` (se abre en la misma pestaña con `?vista=inventarios&informe=sin-rotacion`, sin ruta nueva en `App.jsx`): usa el mismo filtro de bodega; 4 indicadores (sin rotación, valor quieto, nunca movidos, más de 60 días; los dos últimos filtran), buscador tolerante (`/`), categoría, chips por antigüedad con conteo, tabla ordenable (producto · categoría · unidad, bodega, cantidad, costo unitario, valor, última entrada, última salida, días quieto) y tarjetas en celular; de a 100 filas.
- «Sin rotación» = igual que antes: con existencia y sin movimiento en esa bodega en más de 30 días (o nunca). Entrada = movimiento con esa bodega como destino; salida = como origen; no cuentan revertidos. Fechas por `created_at`.
- `datosInicio.js`: la consulta de stock trae también `categorias(nombre)`; cada fila guarda costo, categoría, última entrada y última salida. Sin cambios en la base.
- El `DashboardEjecutivo.jsx` (con su tabla de «inventario parado») no tiene ruta en la app; no se tocó.

## 2026-11-05 · Motores por serial (pantalla + la base lleva la lista sola)
- Pantalla `/motores` («Motores por serial», menú Inventarios, `src/components/movimientos/MotoresSerial.jsx`): buscar por serial, modelo, OF, cliente o N° de movimiento; cada motor muestra entrada (fecha, mov, pedido/proveedor), salida (fecha, mov, OF) y cliente/ciudad. Módulo de permisos `motores` (solo 've'); por defecto solo ADMIN. El cliente sale de `ordenes_fabricacion` interpretando `numero_of` («253», «OF 253», «055», «OC 202» → OF 202); lo que no se interpreta (8453/8465 de la numeración vieja, «DEVOLUCION PRESTAMO EQUIPMASTER», «0000») se muestra como texto. Sin permiso de OF se ve solo el número.
- Migración `supabase/migraciones/2026-11-05_motores_rastreo_serial.sql` (aplicada como `motores_rastreo_serial`, con OK de Angie):
  - `motor_seriales_de_texto()` parte el texto libre (« - », «,», «/»); pedazos de < 6 caracteres se pegan al anterior (EX260421-3338).
  - `fn_motor_serial_registrar()` + trigger `trg_motor_seriales_insert` (after insert): toda entrada/salida de MOTORES con serial actualiza `motor_seriales`. Salida sin fila previa → fila 'despachado' sin entrada. Entrada de un serial despachado → vuelve a 'disponible' (devolución).
  - `fn_motor_seriales_sync` ampliada: corregir el serial o la OF de una salida en el Historial corrige la tabla.
  - La app YA NO escribe en `motor_seriales` (se quitó `registrarSerialesEntrada` y el update de la salida): solo valida. Si se agrega otra pantalla que registre motores, basta con poner `serial_motor` (uno por fila).
  - Carga del historial: 126 seriales de 83 salidas (jul–nov). Tabla: 146 motores (126 despachados, 20 en bodega).
- Casos que quedaron como estaban, para revisar: 26060013 (POWER 7 HP) salió dos veces (MOV-EP-0100 y -0108, OF 457; solo cuenta la primera); mismo serial en dos productos: 1061680 (Honda 9/13 HP), 251031415 (Company 5HP 1800/3600), 270325010226 (GY 9/15 HP), 420325010090 (GY 10 diésel/15 HP); 215326050 (MOV-EP-0109) incompleto. 215326050064 figuraba en bodega pero había salido (MOV-EP-0119): quedó despachado.
- Pendiente: ~56 motores en bodega sin serial registrado (stock 77). Hasta que se registren, sus salidas se escriben a mano (igual quedan en la lista por el trigger, pero sin entrada).
- Hallazgo: la migración `2026-11-04_planillas_produccion.sql` nunca se había aplicado (no existían `planillas_produccion`, `planilla_lineas`, `seriales_maquina` ni sus funciones): Planillas y Números de máquina daban error. Aplicada el 5/11/2026 con OK de Angie (como `planillas_produccion`); verificado: 3 tablas con RLS, 12 políticas, 7 funciones (sin acceso anon) y `nomina_piezas.origen` acepta 'planilla'.
- Revisión de migraciones sin registro en `supabase_migrations` (28/10–5/11): aplicadas a mano y presentes en la base: pedidos_con_oc_a_en_camino, equipmaster_store_motores, of_cotizacion_obligatoria, of_entregas_y_repuestos, profiles_ver_ventas, ventas_ver_jefe_ventas. Aplicadas el 5/11/2026 con OK de Angie (antes estaban **sin aplicar**): `2026-11-04_rrhh_nomina_whatsapp.sql` (faltan `nomina_liquidaciones.whatsapp_enviado_en/_a`: el botón abre WhatsApp pero no queda marcado) y la parte de rol de `2026-10-30_jefe_mantenimiento.sql` (no existe el rol JEFE_MANTENIMIENTO; Leonardo Cardozo sigue CONSULTOR; la bodega MANTENIMIENTO sí estaba; la política «crear pedidos» seguía siendo la lista fija de roles). Verificado después: columnas whatsapp_* creadas; rol JEFE_MANTENIMIENTO (OF ve, pedidos registra, manuales ve); Leonardo Cardozo = JEFE_MANTENIMIENTO con bodega MANTENIMIENTO; «crear pedidos» = matriz (todo, o registra a nombre propio). La app siempre crea pedidos con solicitante_id = quien los crea, así que nadie pierde acceso; JEFE_ENSAMBLE y RRHH (registra en la matriz) ya pueden crear. `ventas_inventario_motores` también está aplicada (permisos COMERCIAL/JEFE_VENTAS presentes).

## 2026-11-06 · Costeo por procesos (árbol)

- Pedido de Angie: la máquina se desglosa como árbol **máquina → procesos → (materia prima, toma de tiempos, CIF)**. Decisiones: los procesos cuelgan directo de la máquina (las partes se manejan como sub-piezas); **la mano de obra sale solo del tiempo real medido**; el CIF se reparte por las horas-hombre reales de cada proceso.
- SQL aplicado (`supabase/migraciones/2026-11-06_costeo_procesos.sql`): tabla `costeo_procesos` (nombre, orden, tipo_pago hora/destajo, tarifa_hora, precio_destajo, centro_costo), `proceso_id` en `costeo_materiales` y `costeo_tiempos_reales` (+ `hora_inicio`, `hora_fin`, `pausa_min`), vista nueva `costeo_procesos_resumen` y `costeo_resumen` reescrita con las mismas columnas de antes.
- Cálculo por proceso: horas-hombre por unidad = Σ(operarios × horas) ÷ Σ unidades (promedio ponderado de todas las mediciones). MO = h-h/und × tarifa (a destajo: precio por unidad, el tiempo no la cambia). CIF = h-h/und × tasa del centro (también a destajo). Centro: el fijo de la ficha, si no el del proceso, si no el de `costeo_etapas_maestro`; sin ninguno queda "Sin centro" y el CIF da 0 (el árbol lo avisa). Al aplicar, **ninguna etapa del maestro tenía centro**.
- `costeo_mano_obra` ya no suma al costo (estaba vacía). Se quitaron las pestañas Materiales, Mano de obra, CIF y Tiempos reales (y sus componentes, la planilla imprimible y el registro rápido por ficha); la ficha queda con Procesos · Sub-piezas · Equipos · Precio y margen.
- Pantallas: `costeo/ArbolTab.jsx` (total, avisos, árbol, agregar proceso), `ProcesoNodo.jsx` (rama + editar proceso), `ProcesoMateriales.jsx`, `ProcesoTiempos.jsx` (cronómetro en localStorage `costeo-crono-<proceso>` + formulario con hora inicio/fin/pausas).
- Verificado en la base con un ensayo dentro de una transacción deshecha: 2 mediciones (2 op × 4 h × 1 und, 1 op × 6 h × 2 und) → 4,667 h-h/und × $12.000 = $56.000.
- Pendientes que Angie puede pedir: planilla imprimible de toma de tiempos, selector de período de CIF por ficha (hoy se usa el más reciente), permiso "solo registrar tiempos" para jefes de área.

## 2026-11-06 · Costeo: PDF de la ficha como documento controlado (ISO y certificación de producto)

- Botón "Descargar PDF" en cada ficha (`costeo/DescargarPDF.jsx`); el PDF lo arma `costeo/utils/fichaCosteoPDF.js` (jsPDF + autotable, logo y NIT de `utils/exportOrdenCompraPDF.js`).
- Contenido: encabezado en cada página con código / versión / fecha / página X de Y; identificación del producto (nombre, tipo, referencia, fecha de corte de precios, período CIF); costo por unidad; costo por proceso; evidencia por proceso (materia prima, cada medición de tiempo, promedio ponderado, cuenta de MO y CIF); sub-piezas y equipos; método de cálculo; control de cambios; firmas Elaboró / Revisó / Aprobó; pie "copia impresa = copia no controlada".
- SQL aplicado (`supabase/migraciones/2026-11-06_costeo_documento_controlado.sql`): `costeo_fichas.doc_codigo, referencia, doc_reviso, doc_aprobo` y tabla `costeo_fichas_versiones` (ficha, versión única por ficha, fecha, descripción, costo_total de ese momento, elaboró/revisó/aprobó) con la RLS de costeo.
- "Volver a descargar la versión vigente" no crea fila (sale con los costos de hoy y la fecha de esa versión); "Emitir versión nueva" sí. Si los costos cambian de verdad, lo correcto para ISO es emitir versión nueva.
- **Gotcha**: la fuente del PDF (helvetica) no trae guion largo, raya, signo menos ni Σ: salen con letras separadas. Usar "-", "a", "suma de".

## 2026-11-06 · Costeo: sub-piezas por niveles dentro del árbol y edición de materia prima / tiempos

- Angie: "no puedo editar la materia prima" y "las sub-piezas tienen otras piezas más pequeñas con nombre". Decisión: las piezas pequeñas son **sub-piezas con sus propios procesos** (Máquina → Olla → Fondo / Aro ×2 → sus procesos), y el catálogo de piezas se alimenta desde la máquina misma.
- Sin SQL: ya existían `costeo_ficha_piezas` y el CTE recursivo de `costeo_resumen`. Cada sub-pieza sigue siendo una ficha `tipo = 'pieza'`.
- `utils/arbolCosteo.js`: `cargarArbol(raiz, {conDetalle})` trae por niveles todas las fichas, procesos, costos (y materia prima y tiempos para el PDF); `recorrerArbol` las visita con su ruta y cantidad acumulada. Corta ciclos (una pieza dentro de sí misma).
- `RamaFicha.jsx`: procesos + sub-piezas de una ficha, recursivo. Al pie de cada rama: "+ Proceso" y "+ Sub-pieza" (si el nombre ya existe en el catálogo de piezas se reutiliza, si no se crea). En una sub-pieza abierta: cantidad editable, Renombrar (cambia en todas las máquinas donde se use), Abrir su ficha, Quitar de aquí (solo quita el enlace; la pieza queda en el catálogo).
- Se quitó la pestaña "Sub-piezas" (`PiezasTab.jsx`): todo se hace en el árbol. Ficha: Procesos · Equipos · Precio y margen.
- Avisos del árbol (sin tiempos / sin tarifa / sin centro) recorren todos los niveles y muestran la ruta ("Olla › Fondo › Rolado").
- Materia prima y mediciones de tiempo ahora se editan (lápiz en cada línea; el formulario abre en su lugar). Antes solo se podían agregar y borrar.
- PDF: punto "Estructura del producto" (sub-piezas con cantidad por unidad, costo propio y aporte; suma = sub-piezas incluidas) y la evidencia de cada sub-pieza bajo "Sub-pieza: Olla > Fondo".

## 2026-11-06 · Costeo: mano de obra por personas dentro de cada proceso

- Pedido de Angie: en un mismo proceso puede haber una persona por hora (a la que se le mide el tiempo) y otra con valor fijo por unidad (ej. Embombe: $ 17.000 por embombar).
- SQL aplicado (`supabase/migraciones/2026-11-06_costeo_mano_obra_lineas.sql`): tabla `costeo_proceso_mano_obra` (persona/puesto, tipo_pago hora|destajo, tarifa_hora, precio_destajo, orden) con la RLS de costeo; `costeo_tiempos_reales.mano_obra_id` (a quién se le tomó el tiempo); vista `costeo_mano_obra_resumen` (costo por persona); `costeo_procesos_resumen` reescrita: MO = suma de personas, CIF = suma de las h-h/und de cada persona (y de mediciones sin persona) × tasa, + columnas `lineas_mano_obra`, `lineas_sin_tiempo`, `lineas_sin_tarifa`.
- Migración: cada proceso existente quedó con una persona con su forma de pago (nombre = puesto de "Responsables por etapa"); sus mediciones se le asignaron. Las columnas `tipo_pago / tarifa_hora / precio_destajo` de `costeo_procesos` quedan **en desuso** (no se leen para el costo).
- Verificado con ensayo en transacción deshecha: 1 op × 4 h × 5 und (por hora $ 14.285) + $ 17.000 fijo → MO $ 28.428.
- Pantalla: `ProcesoManoObra.jsx` (lista con Editar / ✕ / "+ Agregar persona"); "Editar proceso" quedó solo con nombre y centro de costo; al crear un proceso se crea su primera persona desde el maestro; en la toma de tiempos se escoge "¿A quién se le tomó?" (sola si hay una persona por hora); avisos por persona sin tiempo o sin tarifa; PDF con tabla de personas por proceso y columna "Persona" en las mediciones.

## 2026-11-06 · Costeo: rediseño del árbol (opción B, árbol + panel lateral)

- Angie pidió el árbol "más pulido y delicado" (se veía apeñuzcado). Un agente hizo 3 maquetas (A lista con guías, B árbol + panel, C tabla BOM); Angie eligió la **B**.
- `ArbolTab.jsx`: total arriba (MP / MO / CIF sumados por niveles), banda ámbar "El costo está incompleto" con botones que llevan al proceso o pieza (sin tiempos, sin tarifa, sin centro, piezas vacías), árbol compacto (nombre, cantidad, total, punto ámbar; líneas guía finas por nivel; fila seleccionada en azul suave). Panel a la derecha desde 1180 px de ancho (`useAncho`); más angosto, el panel abre a pantalla completa con "← Árbol".
- `PanelCosteo.jsx`: `PanelProceso` (ruta, total, Editar proceso = nombre + centro + quitar, ↑↓, mano de obra, materia prima, tiempos, "De dónde sale el costo") y `PanelPieza` (cantidad, contenido clicable, + Proceso / + Sub-pieza, Renombrar, Abrir su ficha, Quitar de aquí). Se eliminaron `RamaFicha.jsx` y `ProcesoNodo.jsx`.
- Nombres: `utils/nombres.js` muestra en tipo título y quita el nombre de la máquina al final ("FONDO MEZCLADORA 1 1/2" → "Fondo"); palabras con números (1/8, 350L) y siglas (CNC, MIG) se dejan como vienen. El nombre completo sale en el tooltip y en el panel.
- `formatCOP` de costeo pasó a pesos sin decimales (guía ux-feisen). El PDF tiene su propio formato (ya sin decimales).
- La página de la ficha pasó de `max-w-4xl` a `max-w-6xl` para que quepan árbol y panel.

## 2026-11-06 · Costeo: personas desde los cargos del organigrama + aviso que se puede cerrar

- SQL aplicado (`supabase/migraciones/2026-11-06_costeo_mano_obra_cargo.sql`): `costeo_proceso_mano_obra.cargo_id` → `cargos(id)` (on delete set null; el nombre queda guardado en la línea) y `cargo_id` al final de `costeo_mano_obra_resumen`.
- "+ Agregar persona" escoge el cargo de la tabla `cargos` (agrupado por área) u "Otro (escribir el nombre)". Al escoger un cargo ya usado en otro proceso se proponen su última forma de pago y tarifa. Al 2026-11-06 ningún cargo tiene salario cargado, así que no se calcula tarifa desde el salario.
- Al crear un proceso, si `costeo_etapas_maestro.puesto` coincide (sin importar mayúsculas) con el nombre de un cargo, la primera persona queda enlazada.
- **Ojo permisos**: `cargos` solo la leen ADMIN y RRHH (política `cargos_rrhh_admin`). Si algún día se abre Costeo a usuarios con `acceso_costeo`, hay que darles lectura de `cargos` o no verán la lista.
- Banda "El costo está incompleto": botón ✕ para cerrarla; queda "N avisos de costo incompleto · Ver". Se recuerda por ficha en localStorage (`costeo-avisos-cerrados-<fichaId>`) con la firma de los avisos: si aparece un aviso distinto, la banda se vuelve a abrir sola.

## 2026-11-06 · Generar OC: «Seleccionar todo»
- Pedido de Angie. `ModalGenerarOC.jsx` (OC de un pedido): botón «Seleccionar todo / Quitar todo» y contador «N de M». Marca solo las líneas que aún tienen algo por comprar (las ya cubiertas por otra OC o compra directa quedan sin marcar); si ninguna tiene pendiente, marca todas.
- `ModalOCVariosPedidos.jsx`: «Seleccionar todo» general sobre lo que se ve (con búsqueda dice «Seleccionar lo encontrado») y «Todo este pedido» en el encabezado de cada pedido con más de una línea. Contador «N marcados».
- Probado en el demo (`/pedidos?rol=ADMIN`): PED-0185 marcó 11 de 14 (las 3 cubiertas no) y «Quitar todo» desmarca; varios pedidos marcó los 3. El botón por pedido no se probó (en el demo cada pedido tiene una sola línea).

## 2026-11-06 · Costeo: toma de tiempos por cronómetro (tiempo + piezas + notas)
- Pedido de Angie: los tiempos se toman con cronómetro, sin hora de inicio y fin. El formulario de `ProcesoTiempos.jsx` quedó así: **Tiempo del cronómetro** (h · min · s), **Piezas que salieron**, Fecha, ¿A quién se le tomó? y **Notas: cómo se tomó y qué se tuvo en cuenta** (área de texto). Muestra en vivo "Sale a X por pieza".
- Sin cambios en la base: se guarda `horas` = segundos ÷ 3600 sin redondear (la columna es numeric libre), `unidades` = piezas, `num_operarios` = 1. Las columnas `orden`, `responsable`, `hora_inicio`, `hora_fin` y `pausa_min` quedan para los registros viejos; editar una medición vieja conserva sus operarios.
- El cronómetro de la app sigue como opción ("Usar el cronómetro de la app"): muestra 00:12:30 en vivo y al "Parar" llena h/min/s.
- Pantalla y PDF muestran el tiempo como "12 min 30 s" y "2 min 30 s por pieza" en lugar de "h-h/und" (helpers `aHoras`, `partirHoras`, `duracionTexto`, `porPiezaTexto`, `relojDesde` en `utils/tiempos.js`). La tabla de evidencia del PDF: Fecha, Persona, Tiempo, Piezas, Tiempo/pieza, Cómo se tomó (notas).
- Probado en el demo (5181): Parar llenó 5 h 3 min 59 s; 12 min 30 s con 5 piezas dio 2 min 30 s por pieza y guardó. El PDF no se descargó en la prueba.
- **Arreglo (mismo día):** Angie guardó una medición (21:51) antes de agregar la persona del proceso (21:54); quedó con `mano_obra_id` null y no sumaba ("Por hora · sin tiempo medido"). Ahora: (1) al agregar una persona por hora y quedar como la única por hora del proceso, las mediciones sin persona de ese proceso se le asignan (`ProcesoManoObra.guardar`); (2) si hay mediciones sueltas, aparece un aviso ámbar con "Asignar a <persona>" por cada persona por hora y la fila dice "sin persona"; (3) el formulario avisa cuando el proceso aún no tiene persona. `ProcesoTiempos` se recarga cuando cambian las personas. La medición suelta de Angie (Fondo · Corte plasma CNC) no se tocó en la base: la asigna ella con el botón.

## 2026-11-11 · Salida de motores: «Sale 1 unidad» sin haber marcado ningún serial
- Reporte de compras (video): al sacar un motor de MOTORES decía «Sale 1 unidad» apenas se escogía el producto y no se podía poner la cantidad.
- Causa: al escoger el producto, mientras cargaba la lista de seriales disponibles, el efecto «un campo de serial por cada unidad del contador» creaba 1 campo vacío; al llegar la lista ese campo quedaba y contaba como una unidad (y estorbaba al validar).
- Arreglo (`RegistrarMovimiento.jsx`): si llegan seriales disponibles, se borran los campos de texto creados mientras cargaba. Con lista, la cantidad = seriales marcados (se pueden marcar varios); el texto de ayuda ahora lo dice.
- Revisado lo mismo en entradas (no aplica: no hay lista) y en la pantalla del almacenista (no maneja seriales de motor).

## 2026-11-11 · EEFF desde Odoo: homologar el plan de cuentas de FC con el de Feisen
- Objetivo de Angie: sacar los EEFF de las dos contabilidades (Feisen + FC) en tiempo real desde Odoo, como su Excel `Desktop/EEFF/EEFF 2026.xlsx` (P&G por centro: Construequipos, Fundición Hierro, Aluminio; balance; indicadores; flujo). En ese Excel "SIIGO" = Feisen (facturas) y "ODOO" = FC (remisiones / caja). Primer paso: mismas cuentas en las dos, con **Feisen como molde**.
- Acción nueva `cuentas` en `finanzas-odoo` (solo lectura): plan de cuentas con saldo histórico, movimiento del año y nº de líneas (usa `formatted_read_group` de Odoo 19).
- Hallazgos (11/11): Feisen 411 cuentas (207 con movimiento); FC 394 (solo **24 con movimiento**; el resto es la plantilla colombiana de Odoo en inglés, 321 archivadas). **El mismo código no significa lo mismo**: FC 520500 = Comisiones (Feisen: Sueldos ventas), FC 539500 = Otros gastos (Feisen: Ajuste al peso), FC 410000 Ventas (Feisen 412000).
- Decisión de Angie: **solo homologar las cuentas que FC usa**; no crear en FC impuestos ni el resto del plan de Feisen.
- Propuesta para aprobar: `Desktop/EEFF/Homologacion cuentas FC - Feisen.xlsx` (24 cuentas de FC → código y nombre de Feisen; 3 cuentas archivadas de FC que hay que borrar porque ocupan códigos destino; 26 arreglos sugeridos en Feisen: nombres en inglés o "(copia)", y 999999 Saldos iniciales con tipo Depreciación). En Odoo cambiar código o nombre no toca asientos (todo apunta al id de la cuenta).
- **Aplicado en Odoo FC el 11/11/2026 (aprobado por Angie).** Decisiones: en **Feisen no se toca nada**; en FC quedan quietas las de socios (132501, 235500), banco 111001 (ya coincide; el otro año se crean varios bancos), 111003/111004, clientes 130500, proveedores 220500, materia prima 621000 (Angie asigna la MP a mano desde Excel), 999997 y 999998. La nómina se queda en la cuenta de Feisen (510500 "Sueldos"; el dato real lo saca a mano de las nóminas).
  - Borradas (archivadas, sin movimiento, ocupaban códigos destino): 412000 Manufacturing industries, 523500 Services, 529500 Others.
  - Cambiadas: 110501→110500 Caja General · 136500 → Préstamo a trabajadores · 410000→412000 Ingresos operacionales · 420500→425502 Ingresos NO operacionales · 510500 → Sueldos · 512300→523500 Transportes fletes y acarreos · 513500→513505 Servicios Tecnicos · 514500→734500 Mantenimiento de Equipos (costo directo) · 520500→529500 Comisiones · 525000→523501 Publicidad propaganda y promoción · 525500 → Gastos de Viajes · 539500→519506 Otros gastos · 539600→720511 Dotación y suministro a trabajadores (costo directo) · 621500→737001 Insumos de Producción Gravados (costo directo).
  - Verificado después: las 24 cuentas conservan sus 39.799 líneas y saldos, y la suma de saldos de FC sigue en $0. Se hizo con una acción temporal de `finanzas-odoo` (prueba primero con 513500, luego el resto); la acción se quitó y la función volvió a ser solo lectura (versión 8).
  - Ojo: Mantenimiento, Dotación e Insumos pasaron de Gasto a Costo directo, así que los informes de Odoo de meses anteriores ahora las muestran como costo.
- **2.ª parte (11/11, Angie): a las que habían quedado quietas solo se les cambió el número**, igual que en Feisen (nombre y tipo de FC se conservan): 132501 → **133003** (socios Alfonso = "Otras CxC AFC" de Feisen) · 235500 → **233506** (socios Angie) · 621000 Materia prima → **613500** (costo de ventas en Feisen; FC no lleva inventario) · 999998 Saldos iniciales → **999999** · la cuenta de resultado del ejercicio de FC (equity_unaffected, vacía) 999999 → **999991**, como en Feisen. Se borró la 613500 archivada de FC (Wholesale and retail trade, sin movimiento). Se queda 999997 Movimientos transitorios (no existe en Feisen). Verificado: 39.799 líneas, suma de saldos $0; función otra vez solo lectura (versión 10).
- Hoy **todas las cuentas que FC usa tienen el número de Feisen**, menos 999997. Mantenimiento (734500), Dotación (720511) e Insumos (737001) son tres cuentas aparte, como en Feisen.
- Siguiente paso: armar los EEFF (P&G por centro y balance) desde Odoo con este plan común, sumando lo que Angie hoy saca a mano (materia prima, nómina).

## 2026-11-11 · Finanzas › EEFF (en construcción, paso a paso con Angie)
- Pantalla nueva `/finanzas/eeff` (`src/components/finanzas/Eeff.jsx`), primera del menú Finanzas, solo ADMIN. Por ahora es el esqueleto del P&G consolidado (estructura de la hoja "P&G CONSOLIDADO" del Excel EEFF 2026) con columnas Feisen / FC / Total y el mes en octubre 2026; todos los renglones "por definir".
- Los EEFF suman las dos contabilidades (Feisen y FC), por separado y en total.
- Método: se arma octubre 2026 renglón por renglón según cómo lo hace Angie; cada renglón anota de dónde sale (cuenta de Odoo de cada empresa o dato a mano). Después: repartición por centro y balance.
- **Paso 1 — Ingresos (11/11, definido con Angie, cuadra con su Excel de octubre 2026 al peso):**
  - Ventas por centro = cuenta 412000 de cada Odoo por cuenta analítica (nueva acción `pyg` de `finanzas-odoo`: líneas de clases 4–7 del mes por cuenta y centro). Construequipos separa Repuestos y Mantenimientos.
  - Las demás cuentas de ingreso (421000 intereses, 429500 ajuste al peso, 425502 no operacionales) van **dentro de las ventas de Construequipos** (decisión de Angie).
  - Devoluciones = descuentos comerciales 530508 (+ 4175xx). **Ojo al armar gastos no operacionales: no volver a sumar la 530508.**
  - En su Excel de octubre los Repuestos estaban cruzados entre Feisen y FC; Angie confirmó que manda Odoo (Feisen $4.969.065, FC $1.675.760).
  - Transferencias internas a Construequipos: **Hierro desde el ERP** = salidas de bodega Fundición a otra bodega, solo categoría "MATERIAL FUNDIDO HIERRO", kg (peso_unitario) × $5.500 (oct 2026: 2.333 piezas, 11.429 kg, $62.861.975). La materia prima (hierro colado, carbón coke, arenas) que en octubre aparece saliendo de Fundición a "Armado y Soldadura" se excluye: parece mal registrada (debería ser consumo de Fundición). **Aluminio a mano** (aún no registra salidas en el ERP), en la tabla nueva `eeff_manual` (migración `2026-11-11_eeff_manual.sql`, aplicada con OK de Angie; solo ADMIN), concepto `transferencia_aluminio`.
  - Las hojas OCT–DIC de los Excel de control de Hierro y Aluminio todavía tienen datos de 2025.
- **Filtro de vista (11/11):** selector Consolidado · Construequipos · Fundición Hierro · Aluminio junto al mes (se recuerda en el equipo, clave `feisen-eeff-vista`). Consolidado agrupa los ingresos por centro con subtotal (Construequipos = máquinas + no operacionales + repuestos + mantenimientos; Hierro; Aluminio), luego total ventas, devoluciones e ingresos netos; las transferencias internas se muestran aparte y se anulan. Por centro: Construequipos resta las devoluciones (hoy todas son suyas) y muestra bajo "Materia prima" las transferencias recibidas de Hierro y Aluminio; Hierro y Aluminio muestran ventas, ingresos netos, la transferencia interna como ingreso y "Ingresos totales" = ingresos netos + transferencia. La casilla a mano de Aluminio solo está en Consolidado y en la vista Aluminio.

## 2026-11-11 · Informe «Transferencias internas» (reemplaza «Ventas internas de Fundición»)
- Pedido de Angie: ver en un período qué le pasó cada bodega a otra (Fundición → Mecanizados / Armado y Soldadura, Mecanizados → Armado y Soldadura…): productos, cantidades y valor, y descargarlo.
- Pantalla `/reportes/transferencias-internas` (`InformeTransferenciasInternas.jsx`), solo ADMIN (muestra pesos). En el menú: Inventarios › Transferencias internas, y tarjeta en Informes. La ruta vieja `/reportes/ventas-internas-fundicion` (menú Fundición › Ventas internas) abre el mismo informe con origen Fundición ya elegido. Se borró `InformeVentasInternasFundicion.jsx` y `exportarVentasInternasFundicion` → ahora `exportarTransferenciasInternas`.
- Mismas reglas de antes: solo la **salida** del origen (tipo `salida`, origen y destino llenos y distintos; no la entrada REC- pareada), valor = cantidad × `precio_costo_snapshot`, sin revertidos ni reversiones, fecha = `fecha_movimiento` o `created_at`. Kg = cantidad × `items.peso_unitario`.
- Filtros: desde/hasta (atajos Este mes / Mes anterior / Este año), bodega que entrega, bodega que recibe. Calcula solo al cambiar filtros. Resumen por ruta (tocar una fila filtra los productos), tabla por producto con búsqueda. Excel: hojas «Por ruta», «Por producto» y «Detalle» (líneas sin costo en rojo, con el costo actual de referencia).
- Ojo: este valor (costo del movimiento) **no** es el de la transferencia de Hierro de los EEFF (kg × $5.500, solo «MATERIAL FUNDIDO HIERRO»). Octubre 2026 aquí: Fundición → Armado y Soldadura $48.030.535 (incluye la materia prima que parece mal registrada), Fundición → Mecanizados $35.436.850, Mecanizados → Armado y Soldadura $10.747.802, Fundición → Almacén $418.000, Fundición → Aluminio $47.300.
- **Errores de registro de Fundición (11/11, Angie):** toda salida de **materia prima** de Fundición a otra bodega es error de registro (en oct 2026: SAL-JA-0055/0056/0057 de Julián, $21.402.800 a costo, a "Armado y Soldadura"). **No se revierten** (movería el inventario de Fundición): EEFF las excluye de la transferencia interna y lo dice en una observación con los documentos.
  - Bloqueo: la pantalla de movimientos (Fundición › Salida › Transferencia interna) ya no deja enviar ítems de categoría MATERIA PRIMA y explica que se descuentan solos al registrar la fundida. Trigger en base de datos `trg_bloquear_mp_fundicion` (migración `2026-11-11_bloquear_mp_fundicion.sql`, no aplica a ADMIN) **aplicado 11/11 con OK de Angie**. Probado en transacción deshecha como Julián: materia prima a Armado → bloqueada; pieza fundida a Armado → pasa; materia prima sin destino (consumo, como la fundida) → pasa.

## 2026-11-11 · Moldeo: consumo de arenas en el avance del día

- Pedido de Angie: que el jefe de Fundición anote en la programación de moldeo lo que gasta de arenas.
  Decisiones: se anota en **"Registrar avance del día"** de cada orden de moldeo (consumo real día a día), y
  las arenas son los productos de la bodega Fundición, categoría **MATERIA PRIMA**, cuyo nombre contiene
  **"ARENA"** (si se crea una arena nueva aparece sola; sin IDs fijos en el código).
- Al guardar, cada arena con kg > 0 sale del stock de Fundición como **consumo** (salida sin bodega destino,
  así no la frena `trg_bloquear_mp_fundicion`): número `SAL-iniciales-xxxx`, referencia `ORD-MOL-xxxx`,
  fecha = fecha del avance, motivo "Consumo arena moldeo", costo = `precio_costo` del producto. Antes revisa
  el stock y no deja guardar si no alcanza (dice cuánto hay).
- Se puede guardar solo arena (sin piezas) o solo piezas. Orden de guardado: arenas (una sola inserción) y
  luego piezas; si fallan las piezas, la arena queda marcada como descontada y el reintento solo guarda piezas.
- La orden muestra "Arena usada: X kg" (por arena) en el resumen, también en órdenes completadas, y el
  Historial lista la arena de cada día. Se lee de `movimientos` (referencia + ítems de arena), sin tabla nueva.
- Archivo: `src/components/fundicion/ListaOrdenesMoldeo.jsx`. Probado en la demo (`vite.fundicion-demo`,
  que ahora simula `virtual:pwa-register`): stock insuficiente bloquea, guardado normal, y fallo a mitad sin
  descontar dos veces. No probado contra la base real.
- **Hierro oct 2026, ERP contra el Excel de control de Angie (11/11):** su hoja OCT (ya con datos 2026) daba 10.607 kg / $58.336.300; el ERP, 11.429 kg / $62.861.975. Causas: (1) pesos por pieza distintos entre su hoja PESO y `items.peso_unitario` (p. ej. plancha de rana 40 vs 43,1; carcaza 15 vs 12,3; corona 1 1/2 36 vs 32,5); (2) poleas: el ERP tiene ~820 kg más que sus remisiones. **Angie decidió que el ERP es la referencia** (pesos y poleas): EEFF usa el ERP y ella ajusta su Excel. Otras diferencias de cantidad vistas (bocín 374 vs 302, tapas de rana, catalina "hueco pequeño" 101 vs "hueco grande" 95) quedan del lado del ERP.
- **Paso 2 — costos y gastos a mano con utilidad en vivo (13/11, pedido de Angie):** cada renglón de costo o gasto (19) es una casilla en la vista de su centro; al escribirla se recalculan los subtotales de cada sección (Total costos directos, Total CIF, Total gastos operacionales, Total gastos no operacionales) y las tres utilidades (bruta, operacional, neta), que se ven resaltadas y en rojo si son negativas. Se guardan en `eeff_manual` con concepto `<centro>:<fila>` (p. ej. `hierro:mano_obra`), empresa 'total'.
  - **Consolidado no se escribe:** suma los tres centros, como la hoja consolidada de su Excel ("suma automática, NO editable"). Las transferencias internas no entran al consolidado (se anulan) pero sí a Construequipos (materia prima) y a Hierro/Aluminio (ingreso).
  - Mientras falten renglones, la utilidad se marca **parcial** (chip ámbar junto al título, con el conteo "N de 19"), para no leer como definitivo un número sin costos.
  - Probado 13/11 en enero 2026 con una casilla de prueba, ya borrada: Hierro ingresos $16.370.540 − $5.000.000 = $11.370.540 en las tres utilidades, y el consolidado sumó ese valor. Octubre sigue dando ingresos netos $809.830.930.
  - Siguiente: ir conectando cada renglón a su fuente (Odoo o ERP) para que deje de escribirse a mano.
- **Paso 3 — materia prima, solo el lado de FC (13/11):** cada renglón de costo o gasto ahora tiene **su casilla de Feisen y su casilla de FC**, con el total al lado, como las dos líneas (SIIGO / ODOO) del Excel de Angie. Lo único automático por ahora es la **materia prima de FC** = cuenta **613500** de su estado de resultados (su método: "lo que sale en el estado de resultados de FC es materia prima"); lo que ahí viene sin centro se reparte entre los centros según las ventas del mes. Septiembre da $99.425.524 contra $88.959.324 de su Excel. **Resuelto con Angie (13/11): manda Odoo.** La diferencia de Construequipos ($9.466.200) es una compra mal clasificada que ella sacó de Construequipos en su Excel y no alcanzó a sumar en Hierro, así que su septiembre quedó corto; en Odoo la compra sigue en Construequipos y no hay reclasificación ni nota crédito entre septiembre y noviembre, y se deja así. Queda sin explicar $1.000.000 de Aluminio (Odoo $5.754.000, su Excel $4.754.000), con pinta de dígito cambiado al digitar.
  - **Materia prima de Feisen: sigue a mano**, hasta acordar con Angie cómo clasificar sus compras (contabilidad las lleva a inventario).
  - Probé antes a clasificar TODOS los renglones por cuenta contable (y también con las facturas de compra). Angie pidió frenar eso: se va renglón por renglón. Lo que se aprendió, por si sirve después: contra su septiembre hecho a mano, el estado de resultados daba mantenimiento y viáticos exactos, intereses de impuestos exacto sumando 530507 + 539502 (multas y sanciones, que ella mete ahí), servicios públicos con $10 mil de diferencia, transporte $74 mil, dotación $180 mil, e insumos +$8,9 M contra materia prima −$4,4 M (reparto distinto entre esos dos). La depreciación (736000) no existe en su Excel.
- **Materia prima de Feisen (13/11): de las compras del mes a inventario (cuenta 140500).** Contabilidad lleva las compras a inventario y nunca saca lo consumido, así que el costo de ventas contable no sirve: la cuenta **613500 de Feisen se registra a saltos** (ene–feb nada, mar $919 M, abr $116 M, may $184 M, jun $120 M, jul $119 M, ago $349 M, sep $243 M, oct nada) y solo por casualidad coincidió en septiembre. Las compras a 140500 sí siguen el trabajo manual de Angie, y además **ya traen el centro de costo**:
  | Mes | Su Excel (los 3 centros) | Compras 140500 |
  |---|---|---|
  | abr | 231.130.852 | 223.840.647 |
  | may | 213.502.879 | 208.789.644 |
  | jun | 181.561.892 | 140.349.719 |
  | jul | 183.109.162 | 165.179.757 |
  | ago | 155.212.469 | 149.038.579 |
  | sep | 258.075.150 | 242.925.333 |
  - **Enero a marzo no están en Odoo** (Feisen todavía estaba en SIIGO; el asiento de marzo de $919 M es la migración): esos meses se escriben a mano.
  - La diferencia que queda (−6 % en promedio) son proveedores que contabilidad manda a insumos (737001) y Angie cuenta como materia prima. Siguiente paso posible: excepciones por proveedor, que ahora sí se pueden porque la fuente son las facturas de compra.
  - **Ojo con el P&G por centro:** en septiembre las compras de materia prima de Hierro y Aluminio casi no vienen marcadas con su centro en Odoo (quedan "Sin centro" y se reparten por ventas: Hierro $665.384 y Aluminio $486.362, contra $6.199.306 y $8.482.000 en su Excel). El consolidado queda bien; para que el P&G por centro quede bien hay que marcar el centro en esas compras en Odoo, o escribirlas a mano en cada centro.
- **Excepciones por proveedor (13/11):** Angie revisó los 21 proveedores que contabilidad causa como insumos (737001/737002/730500) y marcó 6 que para ella son materia prima: IMPORTACIONES POWER, ALAPLUMEZ, HIDRAULICO A.L, EQUIPOS TOYAMA DE COLOMBIA, FERRE CABLES Y CADENAS LOS CRISOLES y HIERROS BOGOTÁ FERRETERIAS. Van en la lista `PROVEEDORES_MATERIA_PRIMA` de `Eeff.jsx` (se comparan sin tildes ni puntos). **Si algún día se conecta el renglón de insumos, hay que descontarlos allá.**
  - Importante: la clasificación materia prima / insumos **la hace contabilidad al causar** (cuenta 140500 contra 737001/737002); las líneas de factura no dicen qué se compró (todas dicen "GENERICO"), así que el único dato es el proveedor y la cuenta. Ningún proveedor aparece en las dos cuentas el mismo mes.
  - Materia prima de Feisen, con las excepciones, contra su Excel: abr $227,6 M (su $231,1 M) · may $209,8 M ($213,5 M) · jun $145,4 M ($181,6 M) · jul $177,1 M ($183,1 M) · ago $153,9 M ($155,2 M) · sep $245,0 M ($258,1 M) · oct $290,3 M (sin llenar). **Junio ($36 M) y septiembre ($13 M) siguen lejos: revisar.**
  - Dato suelto: HIGH SIERRA SUMINISTROS está dos veces en Odoo ("SAS" y "S.A.S"), con $583.193 cada una; conviene unificar las fichas.
- **Materia prima de Feisen calibrada con octubre (13/11): cuadra al peso.** Angie pasó su clasificación manual de octubre (69 facturas, $277.166.108) y se comparó proveedor por proveedor con Odoo: **todos los proveedores que ella marcó coinciden exactamente** con lo que Odoo tiene. La única diferencia eran 6 proveedores que contabilidad causó en 140500 y ella no marcó; los revisó uno por uno:
  - **RUBIELA CALDERON TORRES ($7.948.500): sí es materia prima** (de aluminio) — se le había pasado al marcar.
  - **No son materia prima:** IMPORTADORA SUPERIOR y LA ROCA ABRASIVOS (insumos); WURTH COLOMBIA, UYUSA COLOMBIA y FERRETERIA ANGEL Y DG (herramienta). Van en la lista `PROVEEDORES_NO_MATERIA_PRIMA` de `Eeff.jsx`: se excluyen aunque estén en 140500.
  - Resultado octubre: **EEFF $285.114.608 = su clasificación $285.114.608, diferencia $0.**
  - Los demás meses con las dos listas: abr −$4,2 M · may −$4,1 M · jun −$40,7 M · jul −$6,5 M · ago −$1,8 M · sep −$14,9 M. Octubre es el mes que está armando, así que se calibró con ese.
  - **Gotcha:** los datos de Odoo cambian mientras se consultan. Dos lecturas de octubre con minutos de diferencia movieron ALAPLUMEZ e IMPORTACIONES POWER de 737001 a 140500 (el total de materia prima no cambió). Contabilidad está trabajando en vivo: al comparar, volver a leer.
- **Materia prima de Fundición Hierro (13/11):** Angie pasó las 5 facturas que deberían estar en Hierro en octubre (MIFRAN MDC3592 y MDC3591; METAL BARCAS 24211, 24081 y 24025). Están todas en Odoo con el valor correcto, pero **causadas en insumos (737001/737002), no en materia prima**, y MIFRAN y METAL BARCAS no estaban en la lista de excepciones. Se agregaron a `PROVEEDORES_MATERIA_PRIMA`.
  - **METAL BARCAS tiene además el centro mal:** sus $543.500 de octubre quedaron en CONSTRUEQUIPOS cuando son de Fundición Hierro. Va al informe de contabilidad (es el mismo punto 1, centros de costo).
  - Octubre, Fundición Hierro: Feisen pasó de prácticamente nada a $3.470.066 (MIFRAN); con el reparto de lo que no tiene centro, la pantalla muestra $3.999.480.
  - **Gotcha confirmado: los datos de Odoo se mueven mientras se revisa.** En tres lecturas de octubre seguidas el total de compras pasó de $373.623.618 a $375.523.618, y una factura de IMPORTADORA DE RODAMIENTOS ($2.631.870) dejó de contar. Por eso el cuadre exacto con su clasificación manual hay que repetirlo cuando contabilidad termine de ajustar el mes.
- ~~**Decisión (13/11): en las fundiciones también se separa material de insumos.**~~ **REVERTIDA el mismo día, ver abajo.** Angie venía metiendo todo junto en materia prima; se acordó seguir la separación que ya hace contabilidad, porque la utilidad bruta no cambia (los dos renglones están arriba de ella), no cuesta trabajo y deja los tres centros comparables. Por eso MIFRAN y METAL BARCAS (Hierro) y ECOLCIN (Aluminio) **se quedan en insumos** y se quitaron de `PROVEEDORES_MATERIA_PRIMA`.
  - Octubre, Feisen, por centro — **materia prima:** Construequipos $248.383.199 · Aluminio $7.948.500 (Rubiela) · Hierro $0 · sin centro $19.999.209. **Insumos:** Construequipos $37.803.995 · Aluminio $6.330.000 (Ecolcin) · Hierro $3.470.066 (Mifran) · sin centro $443.741 (Autocolores).
  - Total materia prima Feisen octubre: **$276.330.908** (el renglón de insumos todavía se escribe a mano: falta conectarlo).
  - Odoo siguió moviéndose durante la revisión: en varias lecturas seguidas los proveedores de excepción (Hidráulico A.L, Ferre Cables, Alaplumez, Importaciones Power) pasaron de insumos a 140500. Las listas de excepción siguen sirviendo por si vuelve a pasar, pero **el cuadre fino de octubre hay que repetirlo cuando contabilidad termine.**
- **Diferencia de octubre explicada al peso (13/11).** Su lista manual daba $277.166.108 y la pantalla $276.330.908; comparando proveedor por proveedor, solo había **dos** diferencias, que se compensaban:
  - **+ RUBIELA CALDERON TORRES $7.948.500:** es materia prima de aluminio (ella lo confirmó) y se le había pasado al marcar.
  - **− IMPORTADORA DE RODAMIENTOS INDUSTRIALES $8.783.700:** ella sí la marcó, pero contabilidad la causa en insumos (737001) en septiembre, octubre y noviembre. Como los rodamientos van dentro de la máquina, se agregó a `PROVEEDORES_MATERIA_PRIMA`.
  - Con eso: **Feisen octubre = $285.114.608 = su lista ($277.166.108) + Rubiela ($7.948.500).** Cuadra exacto otra vez.
  - **El "267" que ella veía era la vista de Construequipos, no el total de Feisen.** Esa vista deja Aluminio aparte y solo toma la parte de Construequipos de lo que no tiene centro. Hoy muestra $276.346.323. Conviene recordar que el total de Feisen se mira en Consolidado.
- **Decisión final (13/11): en las fundiciones, los insumos SÍ cuentan como materia prima.** Angie revirtió la separación que habíamos probado: "todo lo que son insumos de hierro y aluminio va como materia prima"; tiene una razón de fondo que explicará más adelante. Se implementó **como regla por centro, no por proveedor** (`CENTROS_TODO_MATERIA_PRIMA = ['HIERRO','ALUMINIO']`): cualquier compra en cuentas de insumos cuyo centro sea Hierro o Aluminio cuenta como materia prima, así los proveedores nuevos de las fundiciones entran solos. METAL BARCAS sigue en la lista por proveedor porque en Odoo tiene el centro equivocado (Construequipos).
  - Octubre, Feisen: **$295.458.174** = $285.114.608 (su lista + Rubiela) + Mifran $3.470.066 + Ecolcin $6.330.000 + Metal Barcas $543.500. Con FC: **$380.692.714**.
  - Por centro (Feisen): Construequipos $276.889.xxx · Aluminio $14.568.871 · Hierro $3.999.480 (los $543.500 de Metal Barcas siguen cayendo en Construequipos hasta que corrijan el centro).
- **Mano de obra de producción desde la nómina del ERP (13/11).** El renglón suma dos cosas: lo que ya está cargado en RRHH › Nómina y lo que Angie escriba en las casillas.
  - **Del ERP:** `nomina_liquidaciones` del mes, **total devengado**, agrupado por `empleados.centro_costo` (`construequipos`, `fundicionHierro` → Hierro, `aluminio`). Se usa el devengado porque es lo que cuesta el trabajo: las deducciones (seguridad, anticipos) se le descuentan al colaborador, no bajan el costo. **La gente de `administracion` no entra** (irá en nómina administrativa).
  - **Todo eso es de FC** (corrección de Angie, 13/11): la nómina del ERP y la 1.ª quincena que ella pasó van juntas en la columna FC. **La columna de Feisen va vacía**: todavía no lleva ahí su mano de obra.
  - Pista para cuando quiera conectar la de Feisen: sus cuentas **7205xx** del estado de resultados dan exactamente su "M.O. nómina planta — SIIGO" (septiembre $21.608.474 contra $21.608.473; octubre $21.160.423). Si se conecta, hay que excluir la 720511 del renglón de Dotación para no contarla dos veces.
  - Octubre: en el ERP solo está la **2.ª quincena (en borrador)**: Construequipos $54.962.400 · Hierro $13.208.320 · Aluminio $5.156.700 = $73.327.420 (51 liquidaciones). La **1.ª quincena la dio Angie a mano** (no estaba en el ERP): Construequipos $47.446.632 · Aluminio $8.872.000 · Hierro $15.216.150, guardadas en `eeff_manual` como `<centro>:mano_obra` empresa `feisen`.
  - Total mano de obra octubre: **$144.862.202** (Construequipos $102.409.032 · Hierro $28.424.470 · Aluminio $14.028.700).
  - **Sebastián Benítez Lucas (EMP-0043, tornero):** su quincena de $2.221.550 explicaba la diferencia entre el ERP ($54.962.400 en Construequipos) y el $57.183.950 que Angie tenía. **Ella confirmó que él es de Aluminio**, así que el ERP está bien y no se cambió nada. Queda la duda de si la 1.ª quincena que ella pasó lo tiene en Construequipos; si es así, esos valores habría que ajustarlos.
  - **Cómo se ve (corregido 13/11):** en la vista de un centro, la **columna FC muestra el total** (nómina del ERP + lo escrito); antes mostraba solo la casilla con lo escrito y parecía que no estuviera sumando. Lo que falta por cargar se escribe en el renglón de abajo, "Más las quincenas que falten (FC)".
  - La pantalla de nómina del ERP agrupa igual que EEFF (`liquidacion.centro_costo` y si está vacío, el del empleado), así que las dos deben dar lo mismo.
  - **Ojo:** el periodo está en borrador; al cerrarlo las cifras pueden cambiar. Y desde noviembre, con las dos quincenas cargadas, las casillas de la 1.ª quincena hay que borrarlas o quedarán sumando de más.
- **Mano de obra directa de Feisen conectada (13/11).** = todas las cuentas **7205xx** del estado de resultados de Feisen: sueldos más prestaciones (auxilio de transporte, cesantías e intereses, prima, vacaciones, ARL, pensión, caja de compensación, dotación, capacitación). Es lo que Angie llama "total mano de obra directa".
  - Verificado contra su Excel: **septiembre $21.608.474 contra sus $21.608.473** (un peso de redondeo). Octubre: **$23.000.056**.
  - **La 720511 (dotación, $2.838.600 en octubre) queda dentro de la mano de obra**, tal como ella lo hace. Al conectar el renglón de Dotación hay que excluirla de allá para no contarla dos veces.
  - **Lo que no trae centro va todo a Construequipos, no se reparte** (corrección de Angie, 13/11): de los $23.000.056 de octubre solo $1.115.000 traen centro en Odoo; repartir el resto por ventas le ponía $579.336 a Hierro y $317.751 a Aluminio, y esas fundiciones no tienen nómina de Feisen (sus operarios los paga FC). En el mapa `AUTO` eso se declara con `sinCentro: 'construequipos'`, que sirve para cualquier otro renglón que lo necesite.
  - Octubre, mano de obra total (Feisen + FC): **$167.862.258** — Construequipos $125.409.088 · Hierro $28.424.470 (todo FC) · Aluminio $14.028.700 (todo FC).
- **CIF: se reparten por la proporción de ventas de cada centro (método de Angie, 13/11).** Como no se sabe cuánto gasta de luz, mantenimiento o transporte cada centro, se toma el total del renglón y se reparte en la misma proporción en que vendió cada uno. En el mapa `AUTO` eso es la opción **`porVentas: true`**: no importa el centro que traiga Odoo, el renglón entero se reparte.
  - Conectados (las dos empresas, del estado de resultados): **servicios públicos** 734000 + 734001 · **mantenimiento** 734500 + 734501 · **transporte** 523500 + 513504.
  - Contra su septiembre: mantenimiento **$7.684.000 = exacto**; servicios públicos $10.233.960 contra $10.223.960 ($10.000); transporte $13.668.470 contra $13.742.445 ($73.975).
  - El reparto de septiembre quedó 95,4 % Construequipos · 2,7 % Hierro · 1,9 % Aluminio (ella tenía 95,6 / 2,6 / 1,9: usa las ventas totales y aquí se usan las ventas netas por centro).
  - **Faltan dos renglones de CIF:** *dotación* (ojo: la 720511 ya está dentro de la mano de obra de Feisen) e *insumos* (ojo: los insumos de las fundiciones ya están dentro de materia prima).
