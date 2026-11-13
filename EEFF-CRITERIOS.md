# Cómo se calculan los EEFF

Este documento dice **de dónde sale cada número** de la pantalla Finanzas › EEFF del ERP.
Es la referencia: si un criterio cambia, se cambia aquí y en el código al mismo tiempo.

- Pantalla: **Finanzas › EEFF** (`src/components/finanzas/Eeff.jsx`). Solo la ve ADMIN.
- Empresas: **Feisen** (Construequipos Franco S.A.S.) y **FC**. Cada renglón muestra las dos y el total.
- Última actualización: **13 de noviembre de 2026**. Mes de referencia con el que se calibró: **octubre 2026**.

---

## 1. De dónde salen los datos

| Fuente | Qué trae | Cómo |
|---|---|---|
| **Odoo Feisen y Odoo FC** | Estado de resultados del mes, por cuenta y centro | Función `finanzas-odoo`, acción `pyg`. **Solo lectura** |
| **Odoo Feisen y Odoo FC** | Facturas de compra del mes, con proveedor, cuenta y centro | Función `finanzas-odoo`, acción `resultado`. **Solo lectura** |
| **ERP (Supabase)** | Salidas de Fundición, para la transferencia interna de Hierro | Tabla `movimientos` |
| **ERP (Supabase)** | Nómina de producción | RRHH › Nómina (`nomina_liquidaciones`) |
| **A mano** | Lo que todavía no está en ningún sistema | Tabla `eeff_manual` |

Las cuentas contables son **las mismas en las dos empresas** desde la homologación del 11/11/2026.

---

## 2. Vistas y reparto por centro

- **Consolidado** = la suma de los tres centros. No se escribe nada ahí.
- **Centros:** Construequipos, Fundición Hierro, Aluminio.
- Lo que en Odoo **no trae centro de costo** se reparte entre los tres **según lo que vendió cada uno ese mes**, salvo donde se diga otra cosa abajo.
- Los renglones de **CIF se reparten siempre por ventas**, sin importar el centro que traigan en Odoo: no se sabe cuánto gasta de luz o de transporte cada centro, así que si Construequipos vendió el 50 %, le toca el 50 % del CIF.

---

## 3. Ingresos

| Renglón | De dónde sale |
|---|---|
| Máquinas | Cuenta **412000** de cada Odoo, centro Construequipos |
| Ventas no operacionales | Las demás cuentas de ingreso (421000, 425502, 429500…). Van **dentro** de Construequipos |
| Repuestos | Cuenta 412000, centro Repuestos |
| Mantenimientos | Cuenta 412000, centro Mantenimientos |
| Fundición Hierro / Aluminio | Cuenta 412000, su centro |
| (−) Devoluciones y descuentos | Descuentos comerciales **530508** y devoluciones en ventas (4175xx). Hoy todas son de Construequipos |

Las notas crédito ya vienen restadas en las ventas.

---

## 4. Transferencias internas a Construequipos

Son las piezas que las fundiciones le "venden" a Construequipos: **ingreso** para Hierro y Aluminio, **materia prima** para Construequipos. En el consolidado se anulan.

- **Fundición Hierro:** sale del ERP. Son las salidas de la bodega Fundición a otra bodega, solo de la categoría `MATERIAL FUNDIDO HIERRO`, valoradas en **kilos × $5.500**.
  La materia prima que salga de Fundición a otra bodega **no cuenta**: es un error de registro. Se descuenta y la pantalla lo dice con los números de documento.
- **Aluminio:** se escribe a mano, porque Aluminio todavía no registra sus salidas en el ERP.

---

## 5. Costos directos

### 5.1 Materia prima

**Feisen** — de las **facturas de compra** del mes (no del estado de resultados, porque contabilidad lleva las compras a inventario y nunca saca lo consumido):

1. Todo lo que cae en la cuenta de inventario **140500**, **menos** estos proveedores, que son herramienta o insumos:
   - IMPORTADORA SUPERIOR · LA ROCA ABRASIVOS *(insumos)*
   - WURTH COLOMBIA · UYUSA COLOMBIA · FERRETERIA ANGEL Y DG *(herramienta)*
2. **Más** todo lo que caiga en cuentas de insumos (737001, 737002, 730500) **cuyo centro sea Hierro o Aluminio**: los insumos de las fundiciones cuentan como materia prima.
3. **Más** estos proveedores, que contabilidad causa como insumos pero son materia prima:
   IMPORTACIONES POWER · ALAPLUMEZ · HIDRAULICO A.L · EQUIPOS TOYAMA DE COLOMBIA · FERRE CABLES Y CADENAS LOS CRISOLES · HIERROS BOGOTÁ FERRETERIAS · IMPORTADORA DE RODAMIENTOS INDUSTRIALES *(van en la máquina)* · METAL BARCAS *(es de Hierro, pero en Odoo le quedó el centro Construequipos)*

**FC** — la cuenta **613500** de su estado de resultados: todo lo que ahí sale como materia prima.

> **Enero, febrero y marzo no están en Odoo** (Feisen todavía estaba en SIIGO). Esos meses se escriben a mano.

### 5.2 Mano de obra

**Feisen** — todas las cuentas **7205xx** de su estado de resultados: sueldos **más prestaciones** (auxilio de transporte, cesantías e intereses, prima, vacaciones, ARL, pensión, caja de compensación, capacitación). **Sin la 720511**, que es dotación y tiene su propio renglón.
Lo que no trae centro **va todo a Construequipos**, no se reparte: esa es la planta de Feisen, y los operarios de las fundiciones los paga FC.

**FC** — dos cosas que se suman:
- La **nómina ya cargada en el ERP** (RRHH › Nómina) del mes, por el centro de costo de cada colaborador. Se toma el **total devengado**, porque es lo que cuesta el trabajo; las deducciones (seguridad, anticipos) se le descuentan al colaborador y no bajan el costo. **La gente de administración no entra**: va en nómina administrativa.
- **Más las quincenas que falten**, escritas a mano. FC paga por quincena; cuando una no está en el ERP, se escribe.

---

## 6. Costos indirectos (CIF)

**Todos se reparten entre los centros según la proporción de ventas del mes.**

| Renglón | Cuentas |
|---|---|
| Servicios públicos | **734000** energía · **734001** el aseo que viene dentro de la factura de Enel · **513503** teléfono (internet Starlink y plan de celular) |
| Mantenimiento equipos planta | **734500**, **734501** |
| Transporte | **523500**, **513504** |
| Dotación | **720511** |
| Insumos | 737001, 737002, 730500, **menos los de las fundiciones**, que ya están en materia prima. En Feisen se leen de las facturas de compra, para que la exclusión calce exacta; FC no tiene insumos de fundición |

---

## 7. Gastos operacionales y no operacionales

**Todavía se escriben a mano.** Pendientes de definir con Angie:
viáticos, publicidad, comisiones, nómina de asesores y director comercial, sueldos de marketing, honorarios, nómina administrativa, otros gastos operacionales, intereses de impuestos, gravámenes, intereses bancarios y comisiones financieras.

Dos cosas que hay que recordar cuando se conecten:
- La **530508** (descuentos comerciales) ya está restada en los ingresos: no volver a sumarla.
- La **513503** (teléfono) ya está en servicios públicos: no volver a sumarla en otros gastos operacionales.

---

## 8. Las casillas que se escriben a mano

- Se escriben **en la vista de un centro**, en la columna de la empresa que corresponda. Consolidado solo suma.
- En casi todos los renglones, **lo que escribas reemplaza** lo que trae Odoo; si borras la casilla, vuelve el valor automático.
- En **mano de obra de FC** y en **transferencia de Aluminio** la casilla **se suma** a lo automático, porque es para completar lo que falta.
- Todo queda guardado en el ERP, mes por mes.

---

## 9. Avisos

- **El periodo de nómina de octubre está en borrador.** Al cerrarlo las cifras pueden cambiar.
- **Desde noviembre, con las dos quincenas en el ERP, hay que borrar las casillas de la primera quincena** o quedarán sumando de más.
- **Los datos de Odoo se mueven mientras contabilidad trabaja el mes.** Conviene volver a mirar antes de dar un mes por cerrado.
- **Lo que está pedido a contabilidad** (carta en `Desktop/EEFF`): marcar el centro de costo en todas las compras, registrar el costo de ventas todos los meses, acordar el criterio de materia prima contra insumos, revisar junio y unificar el proveedor HIGH SIERRA. Falta agregarle el caso de METAL BARCAS, que tiene el centro equivocado.

---

## 10. Qué cambió y por qué

| Fecha | Cambio |
|---|---|
| 11/11 | Se homologaron las cuentas de FC con las de Feisen, para poder sumar las dos empresas |
| 11/11 | Transferencia de Hierro desde el ERP; se excluye la materia prima mal registrada |
| 13/11 | Materia prima de FC = cuenta 613500 de su estado de resultados |
| 13/11 | Materia prima de Feisen = compras a inventario; su cuenta de costo de ventas no sirve porque se registra a saltos |
| 13/11 | Listas de proveedores que entran y que salen de materia prima. Con ellas, **octubre cuadró exacto** con la clasificación manual de Angie |
| 13/11 | Los insumos de las fundiciones cuentan como materia prima (se probó lo contrario y se revirtió) |
| 13/11 | Mano de obra: FC junta la nómina del ERP con las quincenas que falten; Feisen son las cuentas 7205xx |
| 13/11 | La nómina de Feisen que no trae centro va toda a Construequipos, no se reparte |
| 13/11 | La dotación sale de la mano de obra y pasa a su propio renglón |
| 13/11 | CIF: todos se reparten por la proporción de ventas |
| 13/11 | Servicios públicos incluye internet y celular, no solo la luz |

> El detalle de cada decisión, con los números con que se comprobó, está en `OBSERVACIONES.md`, en las secciones del 11 y el 13 de noviembre de 2026.
