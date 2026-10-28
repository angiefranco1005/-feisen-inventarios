# Observaciones — App de Inventario (Feisen ERP)

Registro de decisiones, pendientes y "gotchas" para retomar el contexto rápido. Actualizar cada vez que se resuelva algo importante o se descubra un problema no obvio.

## Gotchas importantes

- **`supabase/schema.sql` está desactualizado frente a la base real.** No confiar en él para constraints/columnas — verificar siempre en vivo (`pg_get_constraintdef`, `pg_get_functiondef`) antes de asumir el comportamiento de un trigger o un CHECK. Ya se encontraron dos desfases (ver abajo) causados por migraciones aplicadas en Supabase que nunca se reflejaron en este archivo.
- **`categorias` pertenece a una bodega (`bodega_id` NOT NULL en la base real)**, aunque `schema.sql` la muestra global. La migración de la bodega de Administración falló la primera vez por suponer lo contrario (2026-10-26). Al crear categorías por SQL, siempre con `bodega_id`.
- **Aprendices SENA (2026-10-27)**: tipos de contrato "Aprendiz SENA · etapa lectiva" y "· etapa práctica" (Angie dijo "electiva"; el término del SENA es "lectiva"). Llevan duración y fecha fin como el término fijo (`tieneFechaFin`), pero sin preaviso; lo pagado es apoyo de sostenimiento (50 % / 75 % SMMLV, Ley 789/2002), en nómina van como "fijo". `tipo_contrato` es texto libre en la base: agregar tipos no requiere migración.
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
  movieron inventario). También re-crea las políticas de `items` por bodega agregando JEFE_ENSAMBLE.
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
- **Pendientes**: (1) correr la migración; (2) crear el usuario del jefe de Soldadura y Armado con rol
  JEFE_ENSAMBLE y bodega "Producción y Ensamble"; (3) catalogar en Ensamble las piezas que llegan de
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
- Transferencias: el otro lado (p. ej. REC- en Soldadura y Armado) tiene su propio `item_id` y **no** se cambia solo; la pantalla avisa con el número del movimiento par para editarlo también.
- **Bug encontrado (corregido solo en editar):** la tabla `stock` no tiene columna `id` (PK = `item_id, bodega_id`), pero `aplicarAjustesStock()` buscaba/actualizaba por `id` → siempre fallaba con el aviso "el stock no se pudo ajustar". Editar cantidades nunca ajustó el stock (hubo 2 ediciones de cantidad: 2026-09-10 y 2026-10-01, MOV-WA--0020). Editar ahora usa `aplicarAjustesEdicion()` por llave compuesta.
- **Eliminar movimiento (corregido el mismo día, a pedido de Angie):** el trigger `trg_revertir_stock_on_delete` buscaba la bodega por `centro_costo = bodegas.nombre` (27 de 6.485 movimientos no coincidían con ninguna bodega → no se habría revertido el stock) y solo conocía 'entrada'/'salida'. Migración `2026-10-28_revertir_stock_on_delete_por_bodega_id.sql` (aplicada con el conector): ahora deshace exactamente lo de `fn_actualizar_stock` usando `bodega_origen_id`/`bodega_destino_id`, `SECURITY DEFINER`. `eliminarMovimiento()` ya **no** ajusta stock (antes lo intentaba con la función rota y mostraba siempre el aviso de error); el par de una transferencia se elimina y su propio trigger lo revierte. **Regla: el stock al eliminar lo maneja SOLO el trigger; al editar, solo el front (`aplicarAjustesStock` por llave compuesta), porque no hay trigger de UPDATE.** Las eliminaciones pasadas que no revirtieron no se pueden rastrear (las filas ya no existen).
