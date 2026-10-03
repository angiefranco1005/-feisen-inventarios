# Observaciones — App de Inventario (Feisen ERP)

Registro de decisiones, pendientes y "gotchas" para retomar el contexto rápido. Actualizar cada vez que se resuelva algo importante o se descubra un problema no obvio.

## Gotchas importantes

- **`supabase/schema.sql` está desactualizado frente a la base real.** No confiar en él para constraints/columnas — verificar siempre en vivo (`pg_get_constraintdef`, `pg_get_functiondef`) antes de asumir el comportamiento de un trigger o un CHECK. Ya se encontraron dos desfases (ver abajo) causados por migraciones aplicadas en Supabase que nunca se reflejaron en este archivo.
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
