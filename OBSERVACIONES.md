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

## Pendiente de otras sesiones

- Modelo de avance diario para órdenes de moldeo (tabla `ordenes_moldeo_avances`: `orden_pieza_id`, `fecha`, `cantidad_moldeada`, `usuario_id`; cierre manual, no automático).
- Límite de precache del PWA subido a 5 MB (16-sept) porque el build fallaba silenciosamente al desplegar — vigilar si el bundle sigue creciendo (ya va en ~2.3 MB precacheados).
