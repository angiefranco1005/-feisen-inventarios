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
| **Odoo Feisen y Odoo FC** | Saldos acumulados de todas las cuentas, para el **balance general** | Función `finanzas-odoo`, acción `cuentas`. **Solo lectura** |
| **ERP (Supabase)** | Salidas de Fundición, para la transferencia interna de Hierro | Tabla `movimientos` |
| **ERP (Supabase)** | Nómina de producción | RRHH › Nómina (`nomina_liquidaciones`) |
| **A mano** | Lo que todavía no está en ningún sistema | Tabla `eeff_manual` |
| **El Excel de Angie (EEFF 2026)** | Los meses **anteriores a octubre de 2026**, enteros | `src/components/finanzas/eeffHistorico.js` |

Las cuentas contables son **las mismas en las dos empresas** desde la homologación del 11/11/2026.

---

## 1.1 Hasta septiembre de 2026, el Excel; desde octubre, Odoo y el ERP

**Esta es una sola regla y vale para toda la pantalla**, mires el mes que mires y estés en la vista de **"Un mes"** o en la de **"Todo el año"**:

- **Enero a septiembre de 2026 salen del Excel** que Angie llevaba a mano (`EEFF 2026.xlsx`, hojas CONSTRUEQUIPOS, FUND. HIERRO y ALUMINIO), tal cual están ahí.
- **De octubre de 2026 en adelante** las cifras salen solas de **Odoo y del ERP**, con los criterios que explica el resto de este documento.

**Por qué, y esto es lo importante para quien venga después:** **Odoo Feisen está incompleto antes de octubre.** Feisen venía de SIIGO y contabilidad cargó enero, febrero y marzo dentro de marzo. Leer Odoo en esos meses **da cifras que parecen buenas y no lo son**. Por eso no se leen: se usa el Excel, que es el dato bueno.

**Qué cambia en la pantalla cuando el mes viene del Excel:**

- **No se escribe nada.** Esas cifras ya están cerradas. Todas las casillas se vuelven **cifras de solo lectura**, incluidas la **transferencia de aluminio** y **las quincenas que falten de la mano de obra**.
- La pantalla **avisa con un distintivo** que dice que el mes viene del Excel ("De tu Excel de EEFF 2026 · desde octubre las cifras salen solas de Odoo").
- **A esos meses no se les pide nada a Odoo**, así que **abren al instante**.

> **Antes del 13/11/2026 el Excel estaba conectado solo en la vista del año**, así que el mismo mes mostraba cifras distintas según dónde se mirara: **septiembre** daba **$795.901.155** de ingresos netos en la vista de un mes (leyendo Odoo, incompleto) y **$827.138.921** en la del año (leyendo el Excel, correcto). **Ya dan iguales: $827.138.921 en las dos.**

**El mes se escoge en una lista, no en un calendario.** Desde el 13/11/2026 el filtro de arriba es una lista con el nombre del mes ("Septiembre de 2026"), del más nuevo al más viejo.

---

## 2. Vistas y reparto por centro

- **Consolidado** = la suma de los tres centros. No se escribe nada ahí.
- **Centros:** Construequipos, Fundición Hierro, Aluminio.
- Lo que en Odoo **no trae centro de costo** se reparte entre los tres **según lo que vendió cada uno ese mes**, salvo donde se diga otra cosa abajo.
- **Los CIF y todos los gastos —operacionales y no operacionales— se reparten siempre por ventas**, sin importar el centro que traigan en Odoo: no se sabe cuánto gasta de luz, de transporte o de intereses cada centro, así que si Construequipos vendió el 50 %, le toca el 50 % de esos renglones. Solo la materia prima y la mano de obra se asignan al centro que de verdad las gastó.

---

## 2.1 Análisis vertical

La última columna, **"% ventas"**, es el análisis vertical: cada renglón como porcentaje de los **ingresos netos de la vista** (los del consolidado o los del centro que estés mirando), igual que la hoja "ANÁLISIS VERTICAL" del Excel. Se ve en computador; en celular la pantalla deja solo el total.

## 2.2 La vista de todo el año

Desde el **13/11/2026** la pantalla tiene dos modos: **"Un mes"**, el de siempre, y **"Todo el año"**.

- **Los dos modos hacen exactamente la misma cuenta.** El cálculo vive en un solo sitio (`src/components/finanzas/calculoEeff.js`) y la vista del año lo que hace es correrlo mes por mes. Un mes da lo mismo mirándolo de un lado o del otro: se comprobó con **octubre** (que viene de Odoo) y con **septiembre** (que viene del Excel), renglón por renglón.
- **Los dos modos usan la misma fuente para cada mes**, la de la sección 1.1: hasta septiembre el Excel, desde octubre Odoo y el ERP. Esto se arregló el **13/11/2026**; antes el Excel estaba solo en la vista del año y septiembre no daba igual en los dos lados.
- En la vista del año los **meses van en columnas** y al final hay una columna con el **total del año**.
- Las cifras se pueden ver **en pesos (como arranca), en millones o como % de ventas** (el análisis vertical de siempre).
- En pesos y en millones, la **columna del año** trae además, debajo de cada cifra, **su porcentaje sobre los ingresos netos del año**: es el mismo análisis vertical de la vista de un mes, aplicado al acumulado. Los meses se quedan solo con la cifra.
- El **filtro de centro de costo funciona igual** que en la vista de un mes.
- **En la vista del año no se escriben valores a mano.** Las casillas solo existen en la vista de un mes; si hay que escribir o corregir algo, se cambia de modo.

### Hay que mirar si algún mes quedó cojo antes de reportar el año

Los meses que vienen del **Excel** (enero a septiembre) están completos: son las cifras que Angie misma llevaba, con su mano de obra incluida. El hueco que quedaba por enero, febrero y marzo **se cerró el 13/11/2026** al conectar el Excel también en la vista de un mes.

Lo que sí hay que seguir mirando son los meses **de octubre en adelante**: **un mes al que le falte la mano de obra muestra una utilidad que no existe**. La nómina de producción se empezó a cargar en el ERP hace poco y la de FC nunca se registró en Odoo, así que mientras falte una quincena el mes se ve más rentable de lo que fue.

La pantalla ya avisa: los meses a los que les falta la mano de obra van **marcados en ámbar** ("sin mano de obra") y el título dice **"Utilidad neta del año (incompleta)"**. **Mientras aparezca ese aviso, el año se mira para ver tendencias, no para reportar cifras.**

## 2.3 El balance general

Desde el **13/11/2026** la pantalla tiene un **tercer modo**, al lado de "Un mes" y "Todo el año": **Balance**. El cálculo vive aparte, en `src/components/finanzas/calculoBalance.js`, y **no comparte nada con el estado de resultados**: tiene su propio dato y su propia cuenta, así que tocar uno no mueve ni un número del otro.

**De dónde sale.** De los **saldos acumulados de Odoo de las dos empresas**, Feisen y FC (acción `cuentas` de la función `finanzas-odoo`, una llamada por empresa). De cada cuenta se usa **solo el saldo**, que es el acumulado de toda la historia.

**Es "a hoy", no de un mes.** El saldo de una cuenta de balance viene acumulado **desde que arrancó cada contabilidad**, así que aquí no hay mes que escoger: el balance muestra cómo están las cosas hoy. Por eso tampoco aplica la regla de la sección 1.1 (el Excel hasta septiembre, Odoo desde octubre): esa regla es del estado de resultados.

**Cómo se agrupa.** Por los **grupos del PUC**, los dos primeros dígitos del código de cuenta: 11 Disponible, 13 Deudores, 14 Inventarios, 15 Propiedad planta y equipo, 21 Obligaciones financieras, 22 Proveedores, 23 Cuentas por pagar, 24 Impuestos, 25 Obligaciones laborales, 31 Capital, 33 Reservas, 36 y 37 Resultados… **Cada grupo se abre y muestra el detalle cuenta por cuenta**, como lo pidió Angie. El último grupo de cada sección recoge lo que no cayó en los de arriba, para que no se pierda ninguna cuenta.

**Los signos.** En Odoo los activos vienen en positivo y el pasivo, el patrimonio y los ingresos vienen en negativo. En la pantalla **se les voltea el signo** al pasivo, al patrimonio y al resultado, para que se lean en positivo; por eso un número en rojo en esas secciones es un saldo al revés de lo normal. Las cuentas transitorias se dejan tal como vienen.

### La comprobación da $0, y eso es lo que garantiza que está bien

Al pie del balance hay un renglón de comprobación: **activo + transitorias − pasivo − patrimonio**. Eso es exactamente lo mismo que sumar el saldo de **todas** las cuentas de las dos empresas, así que **tiene que dar $0**, y da $0.

Si algún día no diera cero, **sale en rojo**: quiere decir que apareció una cuenta en una clase que la pantalla no esperaba.

### Tres cosas que hay que decir sin suavizar

Angie decidió ver las dos empresas juntas **sabiendo estas tres cosas**, y por eso van arriba del balance y no al pie:

1. **El "banco" de FC dice $1.567.157.555 y no es plata real.** Es la cuenta donde caen los movimientos que todavía no se concilian, y hoy son el **97 % de los activos de FC**. Por eso los bancos de FC están excluidos de la pantalla de **Flujo de caja**. En el balance **sí aparecen**, porque sacarlos lo descuadraría, pero van **marcados en ámbar**.
2. **FC tiene $575.445.392 en "Movimientos transitorios":** plata ya contabilizada que todavía no tiene cuenta definitiva. No es ni activo ni pasivo, así que va en **su propio bloque**, al final.
3. **FC no tiene patrimonio registrado ni cierre de años anteriores**, así que su "resultado del periodo" (unos **$2.046 millones**) es de **varios años acumulados**, no de 2026. El de **Feisen sí es solo de 2026**, porque su contabilidad en Odoo empieza en marzo.

**La conclusión:** **las dos contabilidades cuadran; el problema no es un descuadre sino dónde está ubicada la plata.**

### La maquinaria va al valor en libros

Decisión de Angie del **13/11/2026**: la propiedad, planta y equipo se muestra **neta**, al valor en libros.

| | Valor |
|---|---|
| Costo | $1.536.355.226 |
| (−) Depreciación acumulada (cuentas 159xxx) | $757.133.219 |
| **Valor en libros** | **$779.222.007** |

- El grupo muestra el **neto**; al abrirlo se ve la resta, costo y depreciación por separado.
- Su Excel la tenía en **$1.063.540.000 sin depreciar**: son **$284 millones** de diferencia.
- Verificado contra Odoo.

### Dos cosas que el balance NO hace

Conviene que estén escritas, porque el Excel de Angie sí las tenía:

- **No se divide por centro de costo.** Un balance no se reparte por centro, así que en este modo el **filtro de centro se esconde**.
- **No separa corriente de no corriente.** Odoo no trae esa división y deducirla por el número de cuenta **sería adivinar**. Si algún día se quiere, hay que decidirlo **cuenta por cuenta**.

### La hoja de BALANCE del Excel de Angie no cuadra

Queda anotado: en esa hoja la fila **"VERIFICACIÓN (debe ser 0)"** da entre **−$136.620.337** (marzo) y **$282.265.443** (septiembre).

Son dos causas:
- El **patrimonio** solo lleva el capital y la utilidad del mes, **sin utilidades acumuladas**.
- La **propiedad, planta y equipo** es un **avalúo**, no el valor en libros.

Por eso el balance del ERP **no se arma copiando esa hoja**, sino desde Odoo.


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

> **Esto vale de octubre de 2026 en adelante.** Los meses anteriores no se le piden a Odoo: salen enteros del Excel de Angie (sección 1.1), porque Feisen todavía estaba en SIIGO y en Odoo enero, febrero y marzo quedaron cargados dentro de marzo. Tampoco se escriben a mano: ya están.

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
| Otros gastos operacionales | **Todo lo que quede** de los grupos **51** y **52** de las dos empresas que no tenga renglón propio arriba |

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

**Otros gastos operacionales.** Conectado el **13/11/2026**. Es el último renglón que faltaba y funciona distinto a todos los demás:

- **No es una lista de cuentas: es el renglón de cierre.** Recoge **todo lo que quedó sin renglón propio dentro de los grupos 51 y 52** (gastos de administración y gastos de ventas) de las **dos empresas**, Feisen y FC.
- **Se hizo así a propósito, y no con una lista fija de cuentas.** Con una lista, cada cuenta nueva que abra contabilidad se perdería sin que nadie lo notara. Ya pasó una vez: una compra a Würth no caía en ningún renglón y solo apareció revisando a mano. Con el renglón de cierre, **lo que no tiene casa cae aquí y siempre se ve**.
- **Quedan por fuera** las cuentas que ya tienen su propio renglón arriba: **513503** (teléfono, va en servicios públicos), **513504** (fletes, va en transporte), **515500 / 519504 / 525500** (viáticos), **523500** (transporte), **523501** (publicidad), **529500** (comisiones), **519600** (el asesor de seguridad y salud, va en honorarios), y los grupos **5105** (nómina administrativa), **5110** (honorarios), **5120** (arrendamientos) y **5205** (nómina de asesores y director comercial).
- **Si algún día uno de estos gastos crece y merece su propio renglón**, basta con dárselo arriba: este filtro lo suelta solo, sin tocar nada más.
- Se reparte entre los tres centros **por participación en ventas**, como todos los gastos.
- **Octubre de 2026:** **$5.831.384** de Feisen **+ $6.900.241** de FC = **$12.731.625**.

**Ya no queda ningún gasto operacional escribiéndose a mano.** Con "otros gastos operacionales" conectado, toda la sección 7 sale sola de Odoo y del ERP.

### La depreciación queda por fuera del informe (decidido el 13/11/2026)

La cuenta **736000 "Maquinaria y Equipo Planta"**, que es **depreciación** (**$1.151.026** en octubre de 2026), **no entra en ningún renglón del estado de resultados**. **Es la única cuenta con movimiento que el informe deja por fuera**: todo lo demás ya cae en algún renglón.

- **Lo decidió Angie el 13/11/2026 y es a propósito.** No es un olvido ni un error del cálculo: quien lea esto después **no lo tiene que "arreglar"**.
- **El Excel que ella llevaba a mano tampoco tenía renglón de depreciación**, así que el informe sigue el mismo método de siempre.
- **Consecuencia:** la utilidad que muestra el informe queda **por encima de la contable** justo en el valor de la depreciación (unos **$1,15 millones al mes** con las cifras de octubre). Si alguna vez hay que cuadrar el informe contra la contabilidad o contra el revisor fiscal, **esa es una de las diferencias** y hay que tenerla presente.
- **Si algún día Angie cambia de opinión**, el renglón iría dentro de los **CIF**.

Queda una sola cosa por resolver, y no es un olvido sino una decisión a la espera de que Angie confirme:
- En Odoo FC la cuenta **510500 "Sueldos"** tiene $62.115.139 en octubre y **hoy no se usa en ningún renglón**. La razón: toda la nómina de FC —producción y administración— se toma del **ERP**, no de Odoo, así que usar además esa cuenta sería contar dos veces la misma plata. Queda pendiente que Angie confirme que efectivamente es la misma nómina; mientras tanto, se deja por fuera.

## 7.1 Gastos no operacionales

**Ya están conectados** (13/11/2026). Salen del estado de resultados de **Feisen** y **se reparten por ventas**, como todos los gastos.

| Renglón | Cuentas | Octubre |
|---|---|---|
| Intereses de impuestos | **530507** Intereses de Impuestos · grupo **5395** ("Diversos" en Odoo), donde viven la mora y el ajuste al peso | $5.374.785 |
| Gravámenes (4x1000) | **530501** Gravamen a los movimientos financieros 4x1000 | $2.894.891 |
| Intereses bancarios | **530504** Intereses corrientes Bancarios | $8.342.532 |
| Comisiones financieras | **530502** Cuota de manejo ($62.040) · **530503** Comisiones ($1.029.353) | $1.091.393 |
| | **Total octubre** | **$17.703.601** |

- **Solo la columna de Feisen**, como lo pidió Angie: "los gastos no operacionales los saca de Feisen, porque eso sí o sí tiene que ver con Feisen". La casilla de FC queda a mano, vacía.
- Se reparten entre los tres centros **por su participación en ventas**, como todos los gastos.
- Angie verificó estos valores el **13/11/2026** contra Odoo.
- **Desde el 13/11/2026 "intereses de impuestos" recoge además el grupo 5395** ("Diversos" en Odoo): ahí quedan la mora y el ajuste al peso. En octubre eso baja el renglón de $5.375.000 a **$5.374.785**, por un ajuste al peso de **−$215**.

> **Ojo con la 530508** (descuentos comerciales condicionados): **no entra en ninguno de estos cuatro renglones**. Ya está restada arriba, en "Devoluciones y descuentos comerciales". Como también empieza por 5305, si alguna vez se cambia el código por un filtro de prefijo (`5305…`) esa plata se resta **dos veces**. Por eso las cuentas se nombran una por una.

Otra que hay que recordar: la **513503** (teléfono) ya está en servicios públicos, no volver a sumarla en otros gastos operacionales.

---

## 8. Las casillas que se escriben a mano

- **Solo existen de octubre de 2026 en adelante.** En un mes que viene del Excel **no se escribe nada**: las cifras ya están cerradas y todas las casillas se ven como cifras de solo lectura, incluidas la transferencia de aluminio y las quincenas que falten de la mano de obra.
- Se escriben **en la vista de un centro**, en la columna de la empresa que corresponda. Consolidado solo suma.
- En casi todos los renglones, **lo que escribas reemplaza** lo que trae Odoo; si borras la casilla, vuelve el valor automático.
- En **mano de obra de FC**, en **nómina administrativa de FC** y en **transferencia de Aluminio** la casilla **se suma** a lo automático, porque es para completar lo que falta.
- La de **nómina administrativa de FC** es **una sola para toda la empresa** (concepto `todos:nomina_admin`), no una por centro: se escribe una vez y se reparte por ventas. **Desde el 13/11/2026 ya no aparece en la pantalla**: el valor sigue guardado y sigue sumando, pero para cambiarlo o borrarlo **hay que pedirlo**.
- Todo queda guardado en el ERP, mes por mes.

---

## 9. Avisos

- **El periodo de nómina de octubre está en borrador.** Al cerrarlo las cifras pueden cambiar.
- **Desde noviembre, con las dos quincenas en el ERP, hay que borrar las casillas de la primera quincena** o quedarán sumando de más. Son dos sitios: las de **mano de obra de FC** (una por centro), que se borran desde la pantalla, y la de **nómina administrativa de FC** (una sola para toda la empresa), que **ya no está en la pantalla y hay que pedir que la borren**.
- **Los datos de Odoo se mueven mientras contabilidad trabaja el mes.** Conviene volver a mirar antes de dar un mes por cerrado. Esto solo pasa de octubre en adelante: los meses del Excel ya están cerrados y no se mueven.
- **No hay que "arreglar" los meses viejos leyéndolos de Odoo.** Antes de octubre Odoo está incompleto y daría cifras que parecen buenas y no lo son. Si alguna vez hay que cambiar un mes de enero a septiembre, se cambia el Excel y se vuelve a generar `eeffHistorico.js`.
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
| Gastos no operacionales (Feisen) | octubre | Verificado contra Odoo: intereses de impuestos $5.374.785 (530507 más el grupo 5395, con un ajuste al peso de −$215) · 4x1000 $2.894.891 · intereses bancarios $8.342.532 · comisiones financieras $1.091.393 (cuota de manejo $62.040 y comisiones $1.029.353) = **$17.703.601** |
| Las dos vistas dan lo mismo | septiembre | **Exacto**: septiembre da igual en la vista de un mes y en la del año, porque las dos leen el Excel. Ingresos netos **$827.138.921** · nómina administrativa **$62.456.739** · otros gastos operacionales **$13.345.564** · utilidad neta **$98,4 M**. Antes del 13/11 la vista de un mes leía Odoo y mostraba $795.901.155 de ingresos netos |
| Otros gastos operacionales | octubre | Feisen **$5.831.384** + FC **$6.900.241** = **$12.731.625**. Es el renglón de cierre de los grupos 51 y 52: con él, el estado de resultados de octubre **no deja ninguna cuenta por fuera, salvo la 736000** (depreciación, $1.151.026), que **Angie decidió el 13/11/2026 dejar fuera del informe** |
| Balance: la comprobación | a hoy | **Exacto**: activo + transitorias − pasivo − patrimonio = **$0** en las dos empresas, que es lo mismo que sumar el saldo de todas sus cuentas. Las dos contabilidades cuadran; el problema no es un descuadre sino dónde está ubicada la plata |
| Balance: banco de FC | a hoy | **$1.567.157.555**, el **97 % de los activos de FC**, y no es plata real: es donde caen los movimientos sin conciliar. Excluido en Flujo de caja; en el balance aparece, marcado en ámbar, porque sacarlo lo descuadraría |
| Balance: movimientos transitorios de FC | a hoy | **$575.445.392** de plata contabilizada sin cuenta definitiva. Va en su propio bloque |
| Balance: resultado del periodo de FC | a hoy | Unos **$2.046 millones**, pero son de **varios años acumulados**: FC no tiene patrimonio registrado ni cierre de años anteriores. El de Feisen sí es solo de 2026 |
| Balance: maquinaria | a hoy | Verificado contra Odoo: costo **$1.536.355.226** − depreciación acumulada **$757.133.219** = **$779.222.007** de valor en libros. Su Excel la tenía en $1.063.540.000 sin depreciar: **$284 millones** de diferencia |
| Balance: la hoja del Excel de Angie | marzo a septiembre | **No cuadra**: su fila "VERIFICACIÓN (debe ser 0)" va de **−$136.620.337** (marzo) a **$282.265.443** (septiembre), porque el patrimonio solo lleva capital y utilidad del mes, sin utilidades acumuladas, y la propiedad planta y equipo es un avalúo. Por eso el balance del ERP se arma desde Odoo y no copiando esa hoja |

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
| 13/11 | **"Otros gastos operacionales" conectado como renglón de cierre**: recoge todo lo que quede sin renglón propio dentro de los grupos 51 y 52 de las dos empresas. Se hizo con un filtro de exclusiones y no con una lista de cuentas, para que ninguna cuenta nueva se pierda sin que nadie lo note (ya había pasado con una compra a Würth). Octubre: Feisen $5.831.384 + FC $6.900.241 = **$12.731.625**. Con esto **ya no queda ningún gasto operacional a mano** |
| 13/11 | "Intereses de impuestos" recoge además el grupo **5395** ("Diversos" en Odoo), donde están la mora y el ajuste al peso. Octubre pasa de $5.375.000 a **$5.374.785** (ajuste al peso de −$215) y el total de no operacionales a **$17.703.601** |
| 13/11 | Con esos dos cambios, el estado de resultados de octubre **no deja ninguna cuenta por fuera salvo la 736000** ("Maquinaria y Equipo Planta", depreciación, $1.151.026) |
| 13/11 | **Angie decidió que la depreciación (cuenta 736000) queda por fuera del informe.** Su Excel a mano tampoco tenía renglón de depreciación, así que el informe sigue su método. Es una decisión tomada, no un olvido: **no hay que "arreglarlo"**. Consecuencia: la utilidad del informe queda por encima de la contable en el valor de la depreciación (unos $1,15 millones al mes con octubre), y esa es una de las diferencias a tener presente si hay que cuadrar contra la contabilidad o el revisor fiscal. Si alguna vez cambia de opinión, el renglón iría dentro de los CIF |
| 13/11 | Nuevo modo **"Todo el año"** en la pantalla: los meses en columnas y una columna con el total del año, con el **mismo cálculo** que la vista de un mes (se comprobó octubre renglón por renglón). En el año no se escriben valores a mano. **El total del año todavía no es real y no se debe reportar**: faltan enero, febrero y marzo de Feisen (estaba en SIIGO) y la mano de obra de varios meses. Los meses incompletos van marcados en ámbar |

| 13/11 | **Los meses anteriores a octubre de 2026 salen del Excel de Angie en las dos vistas**, no solo en la del año. Antes el mismo mes mostraba cifras distintas según dónde se mirara: septiembre daba $795.901.155 de ingresos netos en la vista de un mes (leyendo Odoo, incompleto) y $827.138.921 en la del año (leyendo el Excel). **Ya dan iguales: $827.138.921 en las dos.** La regla quedó una sola para toda la pantalla: **hasta septiembre el Excel, desde octubre Odoo y el ERP** |
| 13/11 | En un mes que viene del Excel **no se escribe nada**: las casillas se vuelven cifras de solo lectura (incluidas la transferencia de aluminio y las quincenas que falten de la mano de obra) y la pantalla avisa con un distintivo que el mes viene del Excel. A esos meses **no se les pide nada a Odoo**, así que abren al instante |
| 13/11 | **El mes se escoge en una lista** con el nombre del mes ("Septiembre de 2026"), del más nuevo al más viejo, y ya no en un calendario |
| 13/11 | Nuevo modo **"Balance"**, el tercero de la pantalla. Sale de los **saldos acumulados de Odoo de las dos empresas** (acción `cuentas`), es **"a hoy"** y no de un mes, se agrupa por los grupos del PUC y **cada grupo se abre para ver el detalle cuenta por cuenta**. El cálculo vive aparte, en `calculoBalance.js`, y no comparte nada con el estado de resultados |
| 13/11 | La comprobación del balance (**activo + transitorias − pasivo − patrimonio**) da **$0** en las dos empresas: es lo mismo que sumar el saldo de todas las cuentas. Si algún día no da cero sale en rojo, y quiere decir que apareció una cuenta en una clase que la pantalla no esperaba |
| 13/11 | El balance avisa arriba, sin suavizarlo, de las tres cosas con las que Angie decidió ver las dos empresas juntas: el **"banco" de FC ($1.567.157.555, el 97 % de sus activos)** son movimientos sin conciliar y van marcados en ámbar; FC tiene **$575.445.392 en movimientos transitorios**; y FC **no tiene patrimonio registrado**, así que su resultado del periodo (unos $2.046 millones) es de varios años. **Las dos contabilidades cuadran: el problema no es un descuadre sino dónde está ubicada la plata** |
| 13/11 | **Angie decidió que la maquinaria va al valor en libros**: costo $1.536.355.226 − depreciación acumulada $757.133.219 = **$779.222.007**. Su Excel la tenía en $1.063.540.000 sin depreciar, **$284 millones** de diferencia. Verificado contra Odoo |
| 13/11 | El balance **no se divide por centro de costo** (en ese modo el filtro se esconde) ni **separa corriente de no corriente**: Odoo no trae esa división y deducirla por el número de cuenta sería adivinar. Si algún día se quiere, hay que decidirlo cuenta por cuenta |
| 13/11 | Queda anotado que **la hoja de BALANCE del Excel de Angie no cuadra**: su fila "VERIFICACIÓN (debe ser 0)" va de −$136.620.337 (marzo) a $282.265.443 (septiembre), porque el patrimonio solo lleva capital y utilidad del mes, sin utilidades acumuladas, y la propiedad planta y equipo es un avalúo y no el valor en libros. Por eso el balance del ERP **no se arma copiando esa hoja**, sino desde Odoo |

> El detalle de cada decisión, con los números con que se comprobó, está en `OBSERVACIONES.md`, en las secciones del 11 y el 13 de noviembre de 2026.
