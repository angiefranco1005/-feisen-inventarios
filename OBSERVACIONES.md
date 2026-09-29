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
