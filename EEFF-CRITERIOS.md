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
- **Los CIF y todos los gastos —operacionales y no operacionales— se reparten siempre por ventas**, sin importar el centro que traigan en Odoo: no se sabe cuánto gasta de luz, de transporte o de intereses cada centro, así que si Construequipos vendió el 50 %, le toca el 50 % de esos renglones. Solo la materia prima y la mano de obra se asignan al centro que de verdad las gastó.

---

## 2.1 Análisis vertical

La última columna, **"% ventas"**, es el análisis vertical: cada renglón como porcentaje de los **ingresos netos de la vista** (los del consolidado o los del centro que estés mirando), igual que la hoja "ANÁLISIS VERTICAL" del Excel. Se ve en computador; en celular la pantalla deja solo el total.

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
| Transporte | **523500**, **513504**. Incluye los domicilios pequeños (p. ej. Sodimac), como los causa contabilidad |
| Dotación | **720511**. Incluye los elementos de protección (p. ej. guantes), además de la dotación de ropa |
| Insumos | 737001, 737002, 730500, **menos los de las fundiciones**, que ya están en materia prima, **más** lo que contabilidad causó a inventario (140500) pero es herramienta o insumo: Würth, Importadora Superior, La Roca Abrasivos, Uyusa y Ferretería Ángel. Así no se pierde nada entre los dos renglones. En Feisen se lee de las facturas de compra, para que la exclusión calce exacta; FC no tiene insumos de fundición |

---

## 7. Gastos operacionales

**También se reparten por la proporción de ventas**, como los CIF.

| Renglón | Cuentas |
|---|---|
| Viáticos | **525500** viajes · **515500** alojamiento y manutención · **519504** taxis y buses |
| Publicidad | **523501** |
| Comisiones | **529500** |
| Nómina asesores y director comercial | Todas las **5205xx** de Feisen |
| Honorarios | Todas las **5110xx** de Feisen más la **519600** |
| Nómina administrativa | Todas las **5105xx** de Feisen · FC sale del ERP (RRHH › Nómina, centro administración) más las quincenas que falten |

**Nómina de asesores y director comercial.** Sale del estado de resultados de **Feisen**, cuentas **5205xx**: los sueldos de ventas **más todas las prestaciones**. En octubre de 2026 fueron:

| Cuenta | Qué es | Octubre |
|---|---|---|
| 520500 | Sueldos | $9.945.814,50 |
| 520503 | Incapacidades | $153.333,33 |
| 520504 | Auxilio de transporte | $406.855,17 |
| 520505 | Cesantías | $1.033.894,58 |
| 520506 | Intereses sobre cesantías | $124.067,85 |
| 520507 | Prima de servicios | $1.033.894,58 |
| 520508 | Vacaciones | $517.362,92 |
| 520515 | ARL | $276.763,33 |
| 520517 | Pensión | $1.439.991,54 |
| 520518 | Caja de compensación | $462.191,15 |
| | **Total octubre** | **$15.394.169** |

- **Solo la columna de Feisen.** FC no tiene nómina de ventas: su única cuenta de personal es la **510500**. La casilla de FC queda a mano, vacía.
- Se reparte entre los tres centros **por su participación en ventas**, como todos los gastos.
- Angie revisó esta lista de cuentas el **13/11/2026** contra Odoo y da exacto.

> **Ojo:** si se paga marketing o community por esas mismas cuentas **5205xx**, queda contado aquí dentro de la nómina de asesores y director comercial. **No hay renglón aparte de marketing.**

**Honorarios.** Sale del estado de resultados de **Feisen**, de estas cuentas:

| Cuenta | Qué es | Octubre |
|---|---|---|
| 511000 | Revisoría fiscal | $3.061.810 |
| 511001 | Auditoría externa | — |
| 511002 | Asesoría jurídica | — |
| 511003 | Asesoría técnica | — |
| 511004 | Otros | — |
| 519600 | Honorarios SGST (el asesor de seguridad y salud en el trabajo) | $1.275.262 |
| | **Total octubre** | **$4.337.072** |

- **No entra la 519601** (exámenes médicos ocupacionales): eso no es un honorario, queda para otros gastos operacionales.
- **Solo la columna de Feisen**, como lo pidió Angie: "solo lo que muestra Odoo Feisen". En FC no hay honorarios causados, así que la casilla de FC queda a mano, vacía.
- Se reparte entre los tres centros **por su participación en ventas**, como todos los gastos.
- En octubre solo dos cuentas tuvieron movimiento; las otras cuatro quedaron en cero.
- Si algún día Angie prefiere que el asesor de SGST (**519600**) no vaya en honorarios, basta sacarlo del filtro.

**Nómina administrativa.** Es el personal de administración de las dos empresas. Cada una se saca de un lado distinto, parecido a lo que pasa con la mano de obra:

**Feisen** — del estado de resultados de **Feisen**, cuentas **5105xx**: los sueldos de administración **más todas las prestaciones**. En octubre de 2026 fueron:

| Cuenta | Qué es | Octubre |
|---|---|---|
| 510500 | Sueldos | $43.535.000 |
| 510502 | Incapacidades | $78.333,33 |
| 510503 | Auxilio de transporte | $1.453.054,16 |
| 510504 | Cesantías | $3.769.489,44 |
| 510505 | Intereses sobre cesantías | $452.340,59 |
| 510506 | Prima de servicios | $3.769.489,44 |
| 510507 | Vacaciones | $1.886.260,05 |
| 510514 | ARL | $1.058.442 |
| 510516 | Pensión | $5.253.720 |
| 510517 | Caja de compensación | $1.760.639,99 |
| | **Total octubre** | **$63.016.769** |

Angie revisó esta lista de cuentas el **13/11/2026**.

**FC** — **no sale de Odoo**: sale del **ERP (RRHH › Nómina)**, igual que la mano de obra, y son dos cosas que se suman:
- El **total devengado** de la gente cuyo centro de costo es **administración** (la que no entra en mano de obra de producción).
- **Más las quincenas que falten**, escritas a mano, mientras no estén cargadas en el ERP.

En octubre de 2026: **$17.449.584** de la 2.ª quincena ya cargada en el ERP **+ $11.089.183** de la primera quincena, que Angie dio a mano y ya quedó guardada. **Total FC $28.538.767.** Total del renglón en octubre: **$91.555.536**.

- El valor de "las quincenas que falten" de la nómina administrativa es **uno solo para toda la empresa** (se guarda con el concepto `todos:nomina_admin`, no por centro), porque la administración **no tiene centro de costo**. Después se reparte entre los tres centros **por participación en ventas**, como todos los gastos. Esto es distinto de la mano de obra, donde la casilla sí es **por centro**.
- **Esa casilla ya no está en la pantalla.** Se quitó el **13/11/2026** porque Angie no la necesitaba a la vista en el informe. **El valor sigue guardado y sigue sumando** en la columna de FC: lo único que cambió es que ahora **no se puede cambiar desde la pantalla, hay que pedirlo** para que se modifique en la base de datos. Para que no quede siendo un misterio de dónde sale la cifra de FC, el renglón lo dice en su nota.
- Todo el renglón, Feisen y FC, se reparte entre los tres centros por participación en ventas.

> **Ojo para los meses siguientes:** igual que con la mano de obra, **cuando la primera quincena quede cargada en el ERP hay que borrar ese valor**, o la nómina administrativa se cuenta dos veces. El aviso sigue valiendo igual que antes; lo que cambia es que ya no se borra desde la pantalla: **hay que pedirlo**.

**Todavía se escriben a mano:** otros gastos operacionales.

Queda una cosa por resolver, y no es un olvido sino una decisión a la espera de que Angie confirme:
- En Odoo FC la cuenta **510500 "Sueldos"** tiene $62.115.139 en octubre y **hoy no se usa en ningún renglón**. La razón: toda la nómina de FC —producción y administración— se toma del **ERP**, no de Odoo, así que usar además esa cuenta sería contar dos veces la misma plata. Queda pendiente que Angie confirme que efectivamente es la misma nómina; mientras tanto, se deja por fuera.

## 7.1 Gastos no operacionales

**Ya están conectados** (13/11/2026). Salen del estado de resultados de **Feisen** y **se reparten por ventas**, como todos los gastos.

| Renglón | Cuentas | Octubre |
|---|---|---|
| Intereses de impuestos | **530507** Intereses de Impuestos | $5.375.000 |
| Gravámenes (4x1000) | **530501** Gravamen a los movimientos financieros 4x1000 | $2.894.891 |
| Intereses bancarios | **530504** Intereses corrientes Bancarios | $8.342.532 |
| Comisiones financieras | **530502** Cuota de manejo ($62.040) · **530503** Comisiones ($1.029.353) | $1.091.393 |
| | **Total octubre** | **$17.703.816** |

- **Solo la columna de Feisen**, como lo pidió Angie: "los gastos no operacionales los saca de Feisen, porque eso sí o sí tiene que ver con Feisen". La casilla de FC queda a mano, vacía.
- Se reparten entre los tres centros **por su participación en ventas**, como todos los gastos.
- Angie verificó estos valores el **13/11/2026** contra Odoo.

> **Ojo con la 530508** (descuentos comerciales condicionados): **no entra en ninguno de estos cuatro renglones**. Ya está restada arriba, en "Devoluciones y descuentos comerciales". Como también empieza por 5305, si alguna vez se cambia el código por un filtro de prefijo (`5305…`) esa plata se resta **dos veces**. Por eso las cuentas se nombran una por una.

Otra que hay que recordar: la **513503** (teléfono) ya está en servicios públicos, no volver a sumarla en otros gastos operacionales.

---

## 8. Las casillas que se escriben a mano

- Se escriben **en la vista de un centro**, en la columna de la empresa que corresponda. Consolidado solo suma.
- En casi todos los renglones, **lo que escribas reemplaza** lo que trae Odoo; si borras la casilla, vuelve el valor automático.
- En **mano de obra de FC**, en **nómina administrativa de FC** y en **transferencia de Aluminio** la casilla **se suma** a lo automático, porque es para completar lo que falta.
- La de **nómina administrativa de FC** es **una sola para toda la empresa** (concepto `todos:nomina_admin`), no una por centro: se escribe una vez y se reparte por ventas. **Desde el 13/11/2026 ya no aparece en la pantalla**: el valor sigue guardado y sigue sumando, pero para cambiarlo o borrarlo **hay que pedirlo**.
- Todo queda guardado en el ERP, mes por mes.

---

## 9. Avisos

- **El periodo de nómina de octubre está en borrador.** Al cerrarlo las cifras pueden cambiar.
- **Desde noviembre, con las dos quincenas en el ERP, hay que borrar las casillas de la primera quincena** o quedarán sumando de más. Son dos sitios: las de **mano de obra de FC** (una por centro), que se borran desde la pantalla, y la de **nómina administrativa de FC** (una sola para toda la empresa), que **ya no está en la pantalla y hay que pedir que la borren**.
- **Los datos de Odoo se mueven mientras contabilidad trabaja el mes.** Conviene volver a mirar antes de dar un mes por cerrado.
- **Lo que está pedido a contabilidad** (carta en `Desktop/EEFF`): marcar el centro de costo en todas las compras, registrar el costo de ventas todos los meses, acordar el criterio de materia prima contra insumos, revisar junio y unificar el proveedor HIGH SIERRA. Falta agregarle el caso de METAL BARCAS, que tiene el centro equivocado.

---

## 10. Comprobaciones contra la clasificación manual de Angie

| Renglón | Mes | Resultado |
|---|---|---|
| Materia prima (Feisen) | octubre | **Exacto**: $285.114.608, factura por factura, con las dos listas de proveedores |
| Materia prima (FC) | septiembre | Odoo $99.425.524 contra su Excel $88.959.324. **Manda Odoo**: en su Excel una compra salió de Construequipos y no se sumó en Hierro |
| Mano de obra (Feisen) | septiembre | $21.608.474 contra $21.608.473 *(antes de sacarle la dotación)* |
| Servicios públicos | octubre | **Exacto**: $9.838.666 contra sus cuatro facturas |
| Mantenimiento | septiembre | **Exacto**: $7.684.000 |
| Transporte | octubre | Las cinco facturas coinciden; Odoo trae $11.900 más de un domicilio de Sodimac, que ella acepta como transporte |
| Dotación | octubre | Sus dos facturas de Metalcab ($1.115.000) más Maxiguantes ($1.723.600), que ella acepta como dotación: **$2.838.600** |
| Viáticos, publicidad y comisiones | octubre | Conectados, sin contrastar todavía con su lista: viáticos $0, publicidad $1.816.107, comisiones $5.021.800 |
| Nómina asesores y director comercial (Feisen) | octubre | **Exacto**: $15.394.169, las diez cuentas 5205xx contra Odoo |
| Honorarios (Feisen) | octubre | **$4.337.072**: revisoría fiscal $3.061.810 y el asesor de SGST $1.275.262. Las demás 5110xx sin movimiento |
| Nómina administrativa | octubre | Feisen **$63.016.769** (las diez cuentas 5105xx, lista verificada por Angie el 13/11) + FC **$28.538.767** ($17.449.584 del ERP y $11.089.183 de la primera quincena a mano) = **$91.555.536** |
| Insumos | octubre | **Exacto**: $32.889.667, igual a sus 29 facturas. Al revisarlo apareció que Würth ($1.243.364) no quedaba en ningún renglón; ella lo manda a Insumos, que queda en **$34.133.031** |
| Gastos no operacionales (Feisen) | octubre | Verificado contra Odoo: intereses de impuestos $5.375.000 · 4x1000 $2.894.891 · intereses bancarios $8.342.532 · comisiones financieras $1.091.393 (cuota de manejo $62.040 y comisiones $1.029.353) = **$17.703.816** |

## 11. Qué cambió y por qué

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
| 13/11 | Nómina de asesores y director comercial conectada: cuentas 5205xx de Feisen, solo esa empresa, repartida por ventas |
| 13/11 | El renglón "Sueldos marketing / community" se llama ahora **"Gastos marketing"** y sigue a mano, para no contar dos veces las 5205xx |
| 13/11 | **Se eliminó el renglón "Gastos marketing"**: en Odoo no hay una cuenta propia para marketing. Si se paga por las 5205xx, queda dentro de la nómina de asesores y director comercial |
| 13/11 | Honorarios conectado: cuentas 5110xx de Feisen más la 519600 (asesor de SGST), sin la 519601 (exámenes médicos). Solo Feisen, repartido por ventas |
| 13/11 | Nómina administrativa conectada: Feisen son las cuentas 5105xx de Odoo; FC sale del ERP (centro administración) más las quincenas que falten, con **una sola casilla para toda la empresa** (`todos:nomina_admin`). Se reparte por ventas |
| 13/11 | **Se quitaron de la pantalla los dos sub-renglones de la nómina administrativa** (lo que viene del ERP y la casilla de las quincenas que falten), porque Angie no los necesitaba a la vista. El valor escrito a mano sigue guardado y sigue sumando; ahora se cambia solo pidiéndolo. El renglón lo explica en su nota |
| 13/11 | Queda claro que la **510500 de Odoo FC no se usa en ningún renglón**: la nómina de FC, producción y administración, se toma del ERP. Pendiente que Angie lo confirme |
| 13/11 | Gastos no operacionales conectados: 530507, 530501, 530504, 530502 y 530503 de Odoo Feisen. Solo Feisen (FC a mano), repartidos por ventas. **La 530508 queda por fuera a propósito**: ya está restada en los ingresos, y por eso las cuentas se nombran una por una y no por prefijo |

> El detalle de cada decisión, con los números con que se comprobó, está en `OBSERVACIONES.md`, en las secciones del 11 y el 13 de noviembre de 2026.
