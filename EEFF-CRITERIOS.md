# Cómo se calculan los EEFF

Este documento dice **de dónde sale cada número** de la pantalla Finanzas › EEFF del ERP.
Es la referencia: si un criterio cambia, se cambia aquí y en el código al mismo tiempo.

- Pantalla: **Finanzas › EEFF** (`src/components/finanzas/Eeff.jsx`). Solo la ve ADMIN.
- Empresas: **Feisen** (Construequipos Franco S.A.S.) y **FC**. Cada renglón muestra las dos y el total.
- Última actualización: **18 de noviembre de 2026**. Mes de referencia con el que se calibró: **octubre 2026**.

---

## 1. De dónde salen los datos

| Fuente | Qué trae | Cómo |
|---|---|---|
| **Odoo Feisen y Odoo FC** | Estado de resultados del mes, por cuenta y centro | Función `finanzas-odoo`, acción `pyg`. **Solo lectura** |
| **Odoo Feisen y Odoo FC** | Facturas de compra del mes, con proveedor, cuenta y centro | Función `finanzas-odoo`, acción `resultado`. **Solo lectura** |
| **Odoo Feisen y Odoo FC** | Saldos de todas las cuentas **a fin del mes escogido**, para el **balance general**. **Las cuentas de bancos (11xx) no se usan**: ni suman ni se muestran. **El inventario (14xx) tampoco**: el grupo 14 sale del ERP, y de Odoo solo se guarda el total para poder decirlo en la nota del grupo. **Las cuentas de socios tampoco suman**: se leen, pero van en su propio bloque, fuera de todos los totales | Función `finanzas-balance`. **Solo lectura** |
| **A mano** | El **disponible** del balance: los cinco saldos de banco de cada mes. Es la **única** fuente del disponible | Tabla `eeff_manual`, concepto `banco:…` |
| **ERP (Supabase)** | El **inventario** del balance (grupo 14): el inventario valorizado **cortado al último día del mes que estés mirando**, por bodega y categoría, con cuántos artículos no tienen precio de costo | Función `finanzas_inventario(hasta)`. **Solo lectura** |
| **A mano** | El **valor del inventario al corte del mes**, una casilla por renglón. Lo que se escribe **reemplaza** lo que trae el ERP | Tabla `eeff_manual`, concepto `inv:<renglón>` |
| **ERP (Supabase)** | Salidas de Fundición, para la transferencia interna de Hierro | Tabla `movimientos` |
| **ERP (Supabase)** | Nómina de producción | RRHH › Nómina (`nomina_liquidaciones`) |
| **A mano** | Lo que todavía no está en ningún sistema | Tabla `eeff_manual` |
| **El Excel de Angie (EEFF 2026)** | Los meses **anteriores a octubre de 2026**, enteros | `src/components/finanzas/eeffHistorico.js` |

Las cuentas contables son **las mismas en las dos empresas** desde la homologación del 11/11/2026.

> **Ojo con esto desde el 18/11/2026: el mismo código ya puede llamarse distinto en Feisen y en FC.** Ese día se pasaron al español cinco nombres de cuenta del plan de **Feisen** (ver la sección 2.4). Hasta entonces Feisen era el **molde intocable** de la homologación —todo se arreglaba en FC y nunca en Feisen—, y esta es **la primera vez que se escribe en el plan de Feisen**. La **130500**, por ejemplo, ahora se llama **"Clientes nacionales"** en Feisen y sigue llamándose **"Cuentas por Cobrar a Clientes"** en FC. **Para juntar las dos empresas manda el código, no el nombre**, así que ninguna cifra se mueve por esto; pero si algún día se comparan los dos planes nombre contra nombre, hay que saberlo.

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

## 1.2 La pantalla son dos informes, en dos pestañas

Desde el **18/11/2026** la pantalla tiene arriba **dos pestañas de carpeta**: **"Estado de resultados"** y **"Balance general"**. Sigue siendo **una sola pantalla**, pero son **dos informes distintos**, no dos formas de ver el mismo. La pestaña abierta queda en blanco y se pega a la barra de controles de abajo, como una carpeta.

Lo pidió Angie así: *"separa el informe de eeff el balance y el pyg, no sé si lo muestras como pestañas de carpetas o algo para que no se confundan con los mismos botones"*.

**Antes** los tres botones —"Un mes", "Todo el año" y "Balance"— iban en la misma fila, así que el balance parecía una tercera forma de mirar el mismo informe. Además los controles de al lado cambiaban de significado según cuál se escogiera: el selector de "Mes" pasaba a decir "A fin de" y el filtro de centro de costo desaparecía.

**Ahora cada pestaña trae solo sus propios controles**, así que nunca se ve un botón que no sea de ese informe:

| Pestaña | Qué controles tiene |
|---|---|
| **Estado de resultados** | El período (**"Un mes"** / **"Todo el año"**), el selector de mes o de año, el **centro de costo** y, en la vista del año, el **formato de las cifras** (pesos, millones o % de ventas) |
| **Balance general** | Solo **"A fin de"** con el selector de mes, y un aviso que recuerda que **los bancos los escribes tú** y que **no se divide por centro de costo** |

- **El equipo recuerda las dos cosas por separado:** en qué pestaña estabas y, dentro del estado de resultados, qué período. Si te sales al balance y vuelves, encuentras el período que tenías.
- **Ninguna cifra cambió con esto.** Ni el estado de resultados ni el balance mueven un solo número: lo único que cambió es cómo se llega a cada informe.

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

Dentro de la pestaña **Estado de resultados** hay dos períodos: **"Un mes"**, el de siempre, y **"Todo el año"**, que existe desde el **13/11/2026**. Esta sección es de la vista del año. (El **balance general** es la **otra pestaña**, y se explica en la sección 2.3.)

- **Las dos vistas hacen exactamente la misma cuenta.** El cálculo vive en un solo sitio (`src/components/finanzas/calculoEeff.js`) y la vista del año lo que hace es correrlo mes por mes. Un mes da lo mismo mirándolo de un lado o del otro: se comprobó con **octubre** (que viene de Odoo) y con **septiembre** (que viene del Excel), renglón por renglón.
- **Las dos vistas usan la misma fuente para cada mes**, la de la sección 1.1: hasta septiembre el Excel, desde octubre Odoo y el ERP. Esto se arregló el **13/11/2026**; antes el Excel estaba solo en la vista del año y septiembre no daba igual en los dos lados.
- En la vista del año los **meses van en columnas** y al final hay una columna con el **total del año**.
- Las cifras se pueden ver **en pesos (como arranca), en millones o como % de ventas** (el análisis vertical de siempre).
- En pesos y en millones, la **columna del año** trae además, debajo de cada cifra, **su porcentaje sobre los ingresos netos del año**: es el mismo análisis vertical de la vista de un mes, aplicado al acumulado. Los meses se quedan solo con la cifra.
- El **filtro de centro de costo funciona igual** que en la vista de un mes.
- **En la vista del año no se escriben valores a mano.** Las casillas solo existen en la vista de un mes; si hay que escribir o corregir algo, se vuelve a "Un mes".

### Hay que mirar si algún mes quedó cojo antes de reportar el año

Los meses que vienen del **Excel** (enero a septiembre) están completos: son las cifras que Angie misma llevaba, con su mano de obra incluida. El hueco que quedaba por enero, febrero y marzo **se cerró el 13/11/2026** al conectar el Excel también en la vista de un mes.

Lo que sí hay que seguir mirando son los meses **de octubre en adelante**: **un mes al que le falte la mano de obra muestra una utilidad que no existe**. La nómina de producción se empezó a cargar en el ERP hace poco y la de FC nunca se registró en Odoo, así que mientras falte una quincena el mes se ve más rentable de lo que fue.

La pantalla ya avisa: los meses a los que les falta la mano de obra van **marcados en ámbar** ("sin mano de obra") y el título dice **"Utilidad neta del año (incompleta)"**. **Mientras aparezca ese aviso, el año se mira para ver tendencias, no para reportar cifras.**

## 2.3 El balance general

El **balance general** es la **segunda pestaña** de la pantalla. Existe desde el **13/11/2026**; hasta el 18/11/2026 era un tercer botón al lado de "Un mes" y "Todo el año", y desde ese día tiene pestaña propia con sus propios controles (ver la sección 1.2). El cálculo vive aparte, en `src/components/finanzas/calculoBalance.js`, y **no comparte nada con el estado de resultados**: tiene su propio dato y su propia cuenta, así que tocar uno no mueve ni un número del otro.

> **Esta sección cambió el 17/11/2026 y otra vez el 18/11/2026, y ninguno de los dos cambios se verificó contra datos reales de Odoo antes de publicarlo.** Angie pidió publicarlos sin verificar, así que queda escrito aquí: **la primera vez que abras el balance, revísalo con calma** —escoge un mes que conozcas y mira si los saldos tienen sentido— y avisa si algo no cuadra. El resto del documento sí está contrastado contra Odoo; esto todavía no.

**De dónde sale.** De los **saldos acumulados de Odoo de las dos empresas**, Feisen y FC, menos el disponible, que lo escribe Angie a mano. Los saldos los trae la función **`finanzas-balance`** (`supabase/functions/finanzas-balance/index.ts`), una llamada por empresa, **solo lectura**. De cada cuenta se usa **solo el saldo**, y **las cuentas de bancos (11xx) se descartan de entrada**: no entran a ninguna suma y no se muestran en ninguna parte.

### Ya no es "a hoy": es a fin del mes que escojas

Hasta el 17/11/2026 el balance era "a hoy" y no tenía mes. **Ahora tiene selector de mes**, el mismo de la vista de un mes del estado de resultados, y la etiqueta de arriba dice **"A fin de"**.

- Lo que muestra son los saldos **cortados al último día del mes elegido**, acumulados desde que arrancó cada contabilidad. Así es como debe leerse un balance: no es lo que pasó en el mes, es cómo quedaron las cosas al cerrar ese mes.
- **Por qué se cortó a fin de mes:** el disponible lo llena Angie con los extractos del banco, y los extractos son mensuales. Mezclar un extracto de octubre con la cartera de hoy daría un balance falso, así que **todo el balance se corta a la misma fecha**.
- La pantalla lo dice al pie: "el balance se corta al 31 de octubre de 2026", con la fecha del mes que estés mirando.
- Sigue sin aplicar la regla de la sección 1.1 (el Excel hasta septiembre, Odoo desde octubre): esa regla es del estado de resultados. El balance siempre lee Odoo.

> **Si algún mes se ve raro, esto es lo primero que hay que mirar.** Los saldos a fin de mes son una **consulta nueva** (`finanzas-balance` suma los apuntes contabilizados con fecha hasta el último día del mes). Antes se pedía el saldo de hoy, que Odoo ya traía calculado. Es la parte más nueva y la menos rodada de todo el balance.

### El disponible (grupo 11) lo escribe Angie, no sale de Odoo

Desde el **17/11/2026** el grupo **11 Disponible** ya no se lee de Odoo, y desde el **18/11/2026** las cuentas de bancos de Odoo tampoco se muestran como referencia. El grupo 11 son **cinco casillas que Angie llena a mano** con los extractos bancarios, y nada más: **Bancolombia, Davivienda, Efectivo, Fiducias y Tarjeta prepago**. Una serie de casillas **por cada mes**.

Palabras de ella: *"el banco yo lo lleno a mano, con lo de los extractos y eso, no con lo que hay en los odoo, porque casi nunca es verídico"*.

- Se copia de cada extracto **lo que había el último día del mes** que estés mirando.
- **Mientras no haya escrito nada, el disponible muestra "—", no $0.** Un cero diría "no hay plata"; la raya dice "falta el dato". Arriba, al lado del título, la pantalla avisa con **"Falta el disponible del mes"** y el total del activo sale marcado como incompleto.
- Quedan guardadas en el ERP (tabla `eeff_manual`, concepto `banco:<cuenta>`), mes por mes, igual que las demás casillas a mano.

**Ojo con esto, que la primera vez se ve raro:** esas cinco casillas son **el total de las dos empresas juntas**. Angie no separa los extractos entre Feisen y FC, así que **en ese grupo las columnas de Feisen y de FC salen con "—" y la única cifra está en el total**. No es un error ni un dato que falte: es que ese renglón no está dividido por empresa. El total del activo lo dice en su nota: "incluye el disponible que escribiste, que no se reparte entre Feisen y FC".

### Lo que dice Odoo de bancos ya no se muestra en ninguna parte

El 17/11/2026 las cuentas **11xx de Odoo** todavía quedaban a la vista: un renglón plegable dentro del mismo grupo 11, llamado **"Lo que dice la contabilidad en Odoo"**, en gris y sin sumar, solo para comparar.

**Desde el 18/11/2026 ese renglón ya no existe.** Las cuentas 11xx **ni se leen ni se muestran**. Palabras de Angie: *"quita eso de lo que hay en odoo y deja solo lo que yo voy a ingresar en efectivo y bancos"*. El grupo 11 Disponible son **únicamente las casillas que ella escribe**, y en el balance no queda rastro de lo que la contabilidad tiene registrado en bancos.

Al pie del balance la pantalla dice cuántas cuentas de Odoo se leyeron. **Ese conteo ya no incluye las 11xx descartadas**, porque si no diría que se leyeron más cuentas de las que se ven.

### Ya no hay fila de comprobación al pie, y desapareció "Plata mal registrada en bancos"

Esto cambió dos veces en dos días, y conviene saber de dónde viene:

- **Hasta el 17/11/2026** al pie del balance había una comprobación —**activo + transitorias − pasivo − patrimonio**— que **siempre daba $0**, porque todo salía de Odoo y eso era lo mismo que sumar el saldo de todas las cuentas. Dejó de servir cuando el disponible pasó a escribirse a mano.
- **El 17/11/2026** se reemplazó por una fila llamada **"Plata mal registrada en bancos"**: el disponible escrito **menos** el saldo de las cuentas 11xx de Odoo. Medía cuánto se había equivocado la contabilidad registrando los bancos.
- **El 18/11/2026 esa fila desapareció.** Al sacar las 11xx del balance se fue el dato con el que se restaba: **sin lo que dice Odoo no hay resta que hacer**. Hoy el balance **no tiene ninguna fila de comprobación al pie**.

**Si algún día se quiere esa comparación, hay que hacerla contra Odoo directamente, fuera de esta pantalla.** El balance ya no la calcula ni la muestra.

**Lo que sí se sigue usando:** que la **suma de todas las cuentas de Odoo dé cero**. Esa suma **sí sigue contando las cuentas 11xx** —si no las contara no daría cero— y es la que respalda el **aviso de arriba** que dice que **cada contabilidad cuadra consigo misma**.

### El inventario (grupo 14) sale del ERP, por tipo y renglón, no de Odoo

Desde el **18/11/2026** el grupo **14 Inventarios** del balance **ya no se lee de Odoo**: se arma con el inventario que está cargado en el ERP. Palabras de Angie: *"tengo 3 tipos de inventarios pero cada uno tiene categorías internas, y esas categorías ya se pueden sacar de los inventarios que tenemos en el erp. organicemos los inventarios así por ahora, lo que no tengamos valor déjalo en 0 que yo lo lleno"*.

**Los tres tipos los escogió ella**, y son la división que pide un balance: deja ver cuánta plata está parada en cada etapa. Ese mismo **18/11**, revisando categoría por categoría, **Angie redefinió qué va en cada tipo**; **lo que cambió fue el reparto**, y con él las cifras.

**Dentro de cada tipo lo que se ve son renglones, y un renglón no es una categoría del ERP.** Ese fue el segundo ajuste del mismo día: la primera versión mostraba **una fila por cada categoría del ERP, 24 filas**, y Angie la paró: *"yo materia prima estoy viendo todo por separado, no me tienes que dejar todo por separado, mete almacén (sin sus categorías), lámina, materia prima de la bodega de fundición, ferretería, aceros - fundición - ferretería de mecanizados"*. Ahora **un renglón puede juntar varias categorías**: "Almacén" son las doce categorías de esa bodega en una sola línea, y "Mecanizados" son tres (aceros, fundición y ferretería de esa bodega). Se pasó de **24 filas a 9**, y hoy son **12**, porque más tarde ese mismo día entraron los **dos renglones de producto en proceso** y los **dos de producto terminado** que no están en el ERP. La idea de fondo conviene dejarla escrita: **las líneas que se ven son las líneas en las que piensa Angie**, no las que el ERP tiene por dentro.

#### El valor viene cortado a fin de mes (corregido el 18/11/2026)

**Esto estaba mal escrito antes y conviene decirlo claro.** Durante todo el 18/11 quedó escrito aquí, varias veces, que el inventario del ERP era **el de hoy** y que no se podía sacar el del cierre, porque la tabla de existencias (`stock`) solo guarda la cantidad actual y porque hay unos **750 movimientos sin fecha**. **Era falso.** Angie lo corrigió: *"te vas a inventarios, corte de inventarios, y debería sacarte la información a la fecha de lo que había"*. La pantalla **Reportes › Corte de inventario** ya lo hacía desde hace tiempo: parte del stock de hoy y **deshace los movimientos posteriores**, y los movimientos sin fecha **no estorban**, porque usa `created_at` como respaldo.

Desde ese día la función `finanzas_inventario()` recibe una fecha y aplica **la misma regla que ese informe**. El balance le pide el corte al **último día del mes que estés mirando**, así que el grupo 14 ya está a la misma fecha que el resto del balance.

- **Se copió la regla a propósito**, para que el balance y el informe de Corte de inventario **no puedan dar cifras distintas del mismo día**. La contrapartida: **son dos sitios que hay que mantener iguales**. Si algún día se cambia uno, hay que cambiar el otro —**ninguno de los dos mira el campo `revertido`**, por ejemplo—, o volverán a dar cifras diferentes.
- Las casillas de cada renglón **siguen existiendo**, pero ya no son el único modo de tener el corte: ahora sirven para **corregir a mano** lo que el ERP no tenga bien, como Ferretería.

#### Cómo quedó

Al **31 de octubre de 2026**:

**Esto es lo que trae el ERP**, antes de lo que escriba Angie encima:

| Tipo / renglón | Valor |
|---|---|
| **Materias primas e insumos** | **$292.386.524** |
| Lámina | $140.726.373 |
| Almacén (toda la bodega) | $94.094.413 |
| Mecanizados (aceros, fundición y ferretería) | $37.328.138 |
| Materia prima de Fundición | $20.237.600 |
| Ferretería | — (el ERP no trae nada a esa fecha) |
| **Producto en proceso** | **$88.937.152** |
| Piezas y partes de máquina | — (no está en el ERP: lo escribe ella) |
| Piezas cortadas en plasma | — (no está en el ERP: lo escribe ella) |
| Material fundido de hierro (Fundición y Armado y soldadura) | $46.794.990 |
| Material mecanizado (Mecanizados, categoría Producto mecanizado) | $42.142.162 |
| **Producto terminado y mercancía** | **$40.163.403** |
| Poleas de aluminio | — (no está en el ERP: lo escribe ella) |
| Máquinas terminadas | — (no está en el ERP: lo escribe ella) |
| Motores Constru (bodega Motores, categoría Motores Constru) | $40.163.403 |
| **Total inventario** | **$421.487.079** |

Cifras verificadas contra la base de datos y contra la pantalla. El bloque **"Sin clasificar" quedó vacío**: todas las categorías del ERP con existencias tienen hoy su renglón o una exclusión escrita. La última que quedaba ahí, **Equipmaster Store** (bodega Motores), **Angie la mandó sacar** del inventario (más abajo se explica cómo quedó).

**En pantalla la cifra ya no es esta**, porque lo que Angie escribe a mano **reemplaza** lo del ERP, y ella **terminó de llenar las doce casillas de octubre**: el inventario del balance de ese mes **es su conteo, no el del ERP**. Las doce cifras y los totales están más abajo.

**Lo que había escrito antes era el stock de hoy, y daba bastante menos:** materias primas $212.768.273, producto en proceso $42.952.735, producto terminado $77.665.699, **total $333.386.707** (y ese reparto todavía tenía el material mecanizado en producto terminado). Son **$88 millones menos** que el corte bueno. Queda anotado para que nadie se extrañe si ve esas cifras en una versión vieja del documento o en una captura de pantalla.

**Dos comprobaciones fuertes, que conviene dejar escritas:**

- Contra el **Excel que la propia Angie exportó de Fundición al 3 de octubre**: la función da **$48.446.500 y 125 artículos**, **idéntico al archivo**.
- **Almacén al 31 de octubre da $94.094.413**, que es **exactamente** la cifra que ella tenía de su informe del ERP.

**La contabilidad de Odoo, en cambio, dice $619.510.345 en el grupo 14.** La pantalla muestra esa cifra en la nota del grupo —"la contabilidad dice…"— **para que la diferencia se vea**, pero quien manda en el balance es lo que está en la pantalla. **Con las doce casillas que escribió Angie, la diferencia quedó en $14.632.820: un 2,4 %** (ver más abajo).

#### Qué junta cada renglón

**Materias primas e insumos**, cinco renglones. Palabras de ella: *"en Materia prima debe ir, 1. Almacen... Adicional Materia prima también es Lamina, Ferreteria (este no está en el ERP), de la bodega de fundicion, la catgoria de Materia prima, de la bodega de mecanizados (aceros, ferreteria, fundicion)"*. En detalle:

- **Almacén: toda la bodega, las doce categorías, en una sola línea** —pintura, insumos, tornillería, accesorios, rodamientos y retenedores, correas, poleas, "para venta", herramienta, dotación, otros y **"Fundición - Almacén"**—. Angie dijo *"eso de fundicion almacen si deberia contarlo"*, y tenía razón desde el principio: con esa categoría dentro, **la bodega completa al 31 de octubre da $94.094.413, exactamente la cifra de su informe del ERP**.

  > **Aquí hubo una deducción mía equivocada, y queda corregida.** Mientras el balance mostraba el stock de hoy, sus $94.094.413 quedaban a **$15.873** de la bodega sin "Fundición - Almacén", y de ahí deduje que su informe era la bodega **sin** esa categoría. **Era casualidad.** Su cifra era el **corte al 31 de octubre de toda la bodega**, y cuadra **al peso**, no con $15.873 de diferencia.
- **Lámina**, de la bodega de Corte y doblez.
- **Mecanizados**: **Aceros**, **Fundición - Mecanizados** y **Ferretería - Mecanizados** (más el aluminio de mecanizados), las tres juntas en un solo renglón.
- **Materia prima de Fundición**: la categoría **"Materia prima"** de esa bodega (y el aluminio de fundición, que es materia prima igual).
- **Ferretería**, su propia bodega. Angie advirtió que *"este no está en el ERP"*: tiene **45 artículos y hoy solo 2 con existencias ($1.966.580)**; **al 31 de octubre el ERP no le pone ningún valor**, así que ese renglón sale en "—". **La cifra real hay que escribirla a mano** en esa casilla. El renglón está marcado para que **se muestre aunque el ERP no traiga nada**, y no desaparezca de la pantalla justo cuando hace falta escribirlo. Palabras de ella: *"el único dato que no está en el erp es el de ferretería solita, eso lo ingreso yo a mano"*.

**Producto en proceso**, cuatro renglones, y los definió ella el 18/11: *"Ahora vamos con el tema de material en proceso: Piezas y partes de máquina · Piezas cortadas en plasma · Material mecanizado (este sí está en el erp), los otros 2 es lo que yo tengo que sacar"*. Después, al ver que el material fundido no estaba en esa lista y había quedado en "Sin clasificar", lo confirmó: *"el material fundido de hierro también es material en proceso"*. En orden:

- **Piezas y partes de máquina** — **no está en el ERP**: esa cifra la sacas tú y la escribes en la casilla.
- **Piezas cortadas en plasma** — **tampoco está en el ERP**: igual, la escribes tú.
- **Material fundido de hierro** — $46.794.990 al 31/10. Junta la categoría "Material fundido hierro" en las bodegas de **Fundición** y de **Armado y soldadura**: el hierro ya fundido que todavía no entró a mecanizar ni a ensamblar.
- **Material mecanizado** — $42.142.162 al 31/10, la categoría "Producto mecanizado" de la bodega de Mecanizados.

**El fundido va antes del mecanizado a propósito**, porque ese es el orden de la producción: primero se funde, después se mecaniza.

**Producto terminado y mercancía**, tres renglones, y también los definió ella el 18/11: *"en productos terminados va: Poleas de aluminio, Máquinas terminadas y motores constru"*. En orden:

- **Poleas de aluminio** — **no está en el ERP**: al 31 de octubre **no hay ninguna categoría de aluminio con existencias**, así que esa cifra la sacas tú y la escribes en la casilla.
- **Máquinas terminadas** — **tampoco está en el ERP**: las máquinas ya armadas **no se registran como artículo** en el inventario, así que igual, la escribes tú.
- **Motores Constru** — $40.163.403 al 31/10: la categoría "Motores Constru" de la bodega de Motores.

Los dos primeros son el mismo caso de **Ferretería** en materias primas y de los **dos renglones de piezas** en producto en proceso: el renglón **se muestra aunque el ERP no traiga nada**, para que no desaparezca justo cuando hace falta escribirlo.

**El renglón de Motores dejó de tomar toda la bodega** y ahora toma **solo la categoría Motores Constru**. Lo otro que hay en esa bodega, **Equipmaster Store**, estuvo un rato en "Sin clasificar" hasta que Angie lo vio ahí y dijo: *"EQUIPMASTER STORE · MOTORES esto quítalo por favor"*. **Quedó fuera del inventario del balance**, y cómo se hizo importa:

- **No se borró del código.** Es un renglón que está en la lista **sin tipo**, al final: por no tener tipo **no se muestra ni suma**, pero **sigue emparejando esa categoría** para que no vuelva a caer en "Sin clasificar". La razón de dejarlo escrito es simple: **que se vea que es una decisión y no un olvido**.
- **Hoy sacarla no mueve ninguna cifra**, porque son **12 artículos y ninguno tiene precio de costo**: la categoría vale **$0**.
- **El riesgo real, para que quede dicho:** si algún día se les cargan precios a esos 12 artículos, **esa plata no entraría al inventario del balance** mientras ese renglón siga sin tipo. Quien cargue los precios tiene que acordarse de esto.

**Con esto los tres tipos quedan definidos por ella**: materias primas e insumos, producto en proceso y producto terminado. **Antes el reparto era mío.**

#### Tres movimientos que cambian lo que estaba escrito antes

1. **"Fundición - Mecanizados" dejó de ser producto en proceso y pasó a materia prima.** El fundido que llega a Mecanizados **es la materia prima de esa etapa**, aunque venga de Fundición.
2. **El material mecanizado dejó de ser producto terminado y pasó a producto en proceso**, que es donde corresponde: **está mecanizado pero todavía no ensamblado**. Con eso producto terminado se quedó un rato **solo con Motores**, hasta que ella lo definió ese mismo día (más arriba).
3. **Herramienta, dotación y otros salieron del bloque "No es inventario de venta" y entraron a materias primas**, porque el informe de Almacén de Angie los cuenta. Con eso **ese bloque quedó prácticamente vacío** y ya no se ve en pantalla: lo que le queda —aseo, papelería y dotación de administración, y mantenimiento— **no tiene existencias cargadas en el ERP**.

**Cómo está organizado.** Tres tipos y, dentro de cada uno, **los renglones que definió ella**, cada uno con **su propia casilla**. Como en el resto de la pantalla, **lo que se escribe reemplaza lo del ERP**. Queda guardado mes por mes (tabla `eeff_manual`), **con el concepto del renglón —`inv:almacen`, `inv:lamina`, `inv:mecanizados`…— y no el de la categoría**, porque lo que ella escribe es la línea que ve. Cuando se hizo el cambio **no había ninguna casilla de inventario guardada, así que no hubo nada que migrar**. Y **vaciar la casilla borra el renglón y devuelve el valor del ERP**.

**Las casillas de inventario sí guardan: quedó probado el 18/11.** Angie escribió **$2 de prueba** en la casilla de Lámina, ese $2 **reemplazó los $63.675.999 del ERP** en el total, y **al borrarlo volvió el valor del ERP**. Funciona en los dos sentidos. **El efecto secundario hay que tenerlo presente: una cifra escrita manda sobre el ERP sin avisar en el total del grupo.** Solo se nota **abriendo el grupo**, donde esa fila dice **"escrito por ti"** en vez de "el ERP dice…".

**Lo que hay que decir sin suavizar.** La pantalla lo avisa en ámbar, debajo del grupo: **de 891 artículos con existencias al 31 de octubre, 306 no tienen precio de costo (el 34 %) y entran valiendo cero**, así que el inventario sale **por debajo de lo que vale**. Y no son categorías enteras en blanco —esas se verían de una—: **están repartidos dentro de categorías que sí muestran cifra**. Un número a medias engaña más que un cero, así que **cada renglón dice cuántos artículos le faltan por costear**: Almacén, por ejemplo, va **264 de 527**. El detalle de Almacén está en el informe nuevo (ver más abajo y la sección 9).

**Otros detalles que conviene saber:**

- Lo que **no caiga en ningún renglón** cae en un bloque **"Sin clasificar"**, una línea por categoría, que **sí suma** al total pero sale **marcado en ámbar**. Es a propósito: si alguien crea una categoría nueva en el ERP, **tiene que verse fuera de sitio y no desaparecer en silencio**. **Hoy ese bloque está vacío**: la última que había, Equipmaster Store, Angie la mandó sacar y quedó como exclusión escrita. El bloque sigue ahí para la próxima categoría nueva.
- Lo que agrupa es **dónde está la existencia**, no de qué bodega es el artículo. Por eso el renglón de **material fundido de hierro junta dos bodegas** —Fundición y Armado y soldadura— y las dos van a **producto en proceso**.

#### Las cuatro cifras de materias primas ya quedaron escritas (18/11/2026)

Angie pidió dejar escrito lo que ya se sabe y reservarse solo lo que falta: *"en el inventario de una vez, en materia prima llena la parte que tienes ya en el erp y solo deja ferretería para que yo llene"*. Así que en **octubre de 2026** se escribieron estos cuatro renglones de materias primas, **con el corte al 31 de octubre**:

| Renglón | Casilla | Valor escrito |
|---|---|---|
| Lámina | `inv:lamina` | $140.726.373 |
| Almacén | `inv:almacen` | $94.094.413 |
| Mecanizados | `inv:mecanizados` | $37.328.138 |
| Materia prima de Fundición | `inv:mp_fundicion` | $20.237.600 |

**Ferretería se dejó vacía en ese momento a propósito**, porque esa bodega casi no está cargada en el ERP y la cifra la escribe ella: **al 31 de octubre el ERP no le pone ningún valor**. Ese mismo día ella la llenó, junto con las demás (ver la sección siguiente).

**Con las cuatro del ERP, materias primas de octubre daba $292.386.524**, que es exactamente lo que da el ERP al corte. Lo que cambia al escribir las cifras es que **quedan fijas**: ya no se mueven cuando cambie el inventario. **Después Angie corrigió Lámina y llenó Ferretería**, así que el total de materias primas de octubre es otro: **$246.942.664**, el de la sección siguiente.

#### Angie llenó las doce casillas: el inventario de octubre es su conteo (18/11/2026)

**Esto es lo importante de esta sección.** El inventario del balance de **octubre de 2026 ya no es el del ERP: es el conteo de Angie.** Llenó **las doce casillas**, una por renglón, y lo que se escribe **reemplaza** lo que trae el ERP. Todas están guardadas en `eeff_manual`, mes **`2026-10`**, empresa **`total`**:

| Tipo | Renglón | Casilla | Valor escrito |
|---|---|---|---|
| Materias primas | Almacén | `inv:almacen` | $94.094.413 |
| Materias primas | Lámina | `inv:lamina` | $43.810.244 |
| Materias primas | Materia prima de Fundición | `inv:mp_fundicion` | $20.237.600 |
| Materias primas | Ferretería | `inv:ferreteria` | $51.472.269 |
| Materias primas | Mecanizados | `inv:mecanizados` | $37.328.138 |
| En proceso | Piezas y partes de máquina | `inv:piezas_maquina` | $74.494.000 |
| En proceso | Piezas cortadas en plasma | `inv:piezas_plasma` | $21.861.159 |
| En proceso | Material fundido de hierro | `inv:fundido` | $46.794.990 |
| En proceso | Material mecanizado | `inv:material_mecanizado` | $42.142.162 |
| Terminado | Poleas de aluminio | `inv:poleas_aluminio` | $25.859.147 |
| Terminado | Máquinas terminadas | `inv:maquinas` | $106.620.000 |
| Terminado | Motores Constru | `inv:motores` | $40.163.403 |

Los totales, ya con todo escrito:

| Tipo | Total de octubre |
|---|---|
| Materias primas e insumos | **$246.942.664** |
| Producto en proceso | **$185.292.311** |
| Producto terminado y mercancía | **$172.642.550** |
| **Inventario total** | **$604.877.525** |

**Tres cifras salieron de donde el ERP no llega** —Piezas y partes de máquina, Poleas de aluminio y Máquinas terminadas—: no existen como artículo en el ERP y son conteo suyo de principio a fin. **Lámina conviene dejarlo escrito con todas las letras:** el ERP traía **$140.726.373** y ella puso **$43.810.244**, casi **$97 millones** de diferencia, **y la cifra buena es la de ella**. **Ferretería** es la bodega que casi no está cargada, así que ahí el ERP no ponía nada. **Material mecanizado** y **Almacén** son las que coinciden con el ERP: lo que hizo fue **fijarlas**.

#### Lo que vale la pena resaltar: el inventario y la contabilidad quedaron a 2,4 %

**La contabilidad de Odoo dice $619.510.345 en el grupo 14. El inventario que armó Angie da $604.877.525. La diferencia es de $14.632.820, un 2,4 %.**

Cuando empezó el día, el inventario que salía del ERP daba **$333 millones** y la diferencia con la contabilidad era de **$286 millones**. Que ahora queden a **$14,6 millones** no es un ajuste técnico: es el resultado de que **ella definiera los renglones y contara lo que el ERP no tiene**.

> **El aviso del dígito faltante quedó resuelto.** Durante el día la casilla del material fundido decía **$6.794.990** mientras el ERP daba **$46.794.990** —exactamente $40.000.000 de diferencia, el mismo número salvo el 4 del principio— y aquí quedó señalado para confirmarlo con ella. **Era un dígito, y Angie lo corrigió a $46.794.990.** No queda nada pendiente por ese lado.

> **Y aquí había algo mal, que quedó arreglado el 18/11.** Cuando Angie escribía una casilla desde la pantalla, **no se limpiaba el campo `nota`** del renglón en `eeff_manual`. Como las cuatro cifras de materias primas se habían llenado por SQL con la nota *"Inventario del ERP cortado al 31/10/2026, misma regla que Reportes › Corte de inventario"*, al corregir Lámina a mano **esa nota se quedó ahí mintiendo sobre una cifra que ya era suya**. Ahora **al guardar se pone `nota` en null**, y se limpió la de Lámina, que era la única en ese caso.

> **Esto corrige lo que decía antes este documento.** La primera vez que se llenaron, estas cuatro casillas se escribieron con el **stock del 18 de noviembre** (Almacén $102.885.940, Lámina $63.675.999, Mecanizados $25.625.854, Materia prima de Fundición $18.613.900), y aquí quedó escrito que **no había forma de sacar el saldo al 31 de octubre**. **No era cierto**: sí la había, y es la que usa Reportes › Corte de inventario. **Las cuatro casillas se reescribieron el mismo 18/11 con el corte bueno**, y la advertencia que llevaban en su campo `nota` se cambió por lo que de verdad son: "Inventario del ERP cortado al 31/10/2026, misma regla que Reportes › Corte de inventario".

#### El informe de artículos de Almacén sin precio (18/11/2026)

Para saber exactamente qué falta por costear se sacó el archivo **`Articulos sin precio - Almacen - 18-11-2026.csv`**, en la raíz del proyecto. Son los **262 artículos de Almacén que tienen existencias y no tienen precio de costo**, de **519 con existencias**: **la mitad**, y entre todos **15.484 unidades que entran al balance valiendo cero**.

- Lo más grave: **Poleas y "Para venta" no tienen precio en ningún artículo** (12 de 12 y 4 de 4), y **Herramienta va 34 de 42**.
- **Tornillería concentra 11.448 unidades sin precio**, tres cuartas partes de todo lo no valorizado.
- De paso el informe detectó **posibles duplicados en el maestro** ("FRESA EN T 40 MM" dos veces, "POLIURETANO AZUL CIELO" y "POLIURETANO (AZUL CIELO)") y **unidades de medida inconsistentes**. Conviene **unificar eso antes de cargar los precios**, para no costear dos veces el mismo artículo.

### Dos cosas que hay que decir sin suavizar

Angie decidió ver las dos empresas juntas **sabiendo estas dos cosas**, y por eso van arriba del balance y no al pie:

1. **FC tiene $575.445.392 en "Movimientos transitorios":** plata ya contabilizada que todavía no tiene cuenta definitiva. No es ni activo ni pasivo, así que va en **su propio bloque**, al final. Es uno de los **dos bloques que quedan fuera de los totales**: el otro es el de las **cuentas de socios** (ver más abajo).
2. **FC no tiene patrimonio registrado ni cierre de años anteriores**, así que su "resultado del periodo" (unos **$2.046 millones**) es de **varios años acumulados**, no de 2026. El de **Feisen sí es solo de 2026**, porque su contabilidad en Odoo empieza en marzo.

**La conclusión:** **las dos contabilidades cuadran consigo mismas; el problema no es un descuadre sino dónde está ubicada la plata.**

### Las cuentas de socios quedan fuera de todos los totales

Desde el **18/11/2026** las **cuentas de socios** no cuentan para el balance. Palabras de Angie: *"AFC AVF son las cuentas de socios, eso no lo debemos tener en cuenta para el balance"*.

- Salen del **activo**, del **pasivo**, del **patrimonio** y de **cualquier indicador** que se calcule con esos totales (el endeudamiento, por ejemplo). Es plata que se movió entre el negocio y los socios, no cartera ni deuda con un tercero.
- **No se borran:** se muestran en un **bloque propio al final**, igual que los movimientos transitorios, y con el **signo tal como viene de Odoo**: en positivo se lo deben al negocio, en negativo el negocio se lo debe al socio.

Cuáles son, con los saldos verificados **al 31 de octubre de 2026**:

| Empresa | Cuenta | Saldo |
|---|---|---|
| Feisen | 133002 Otras Cuentas Por Cobrar AVF | $582.808.358 |
| Feisen | 133003 Otras Cuentas Por Cobrar AFC | $51.814.206 |
| FC | 233506 Cuentas por pagar a socios Angie | −$25.000 |
| **Total del bloque** | | **$634.597.564** |

**Se escogen por empresa, no por código, y eso es a propósito.** El mismo código significa cosas distintas en los dos libros: la **233506 de FC** es "Cuentas por pagar a socios Angie", pero la **233506 de Feisen** es "Otras Cuentas Por Pagar", que sí es deuda con terceros y **se queda en el pasivo**. Clasificar por código habría sacado la cuenta equivocada.

**Lo que se ve en pantalla, con octubre:** los **deudores** pasaron de **$1.096.907.111** a **$462.284.547** (Feisen $407.426.943 + FC $54.857.604). Con eso el **total activo** queda en **$2.001.236.418** y el **total pasivo**, en **$1.699.653.878**.

> **Esto hay que decirlo sin suavizar: sacarlas del balance es una decisión de cómo quieres leer el balance para gerenciar, no un cambio en la contabilidad.** En los libros siguen registradas, y para efectos fiscales siguen siendo cuentas con los socios, con su propio tratamiento. **Eso lo tiene que mirar tu contador.** La pantalla lo dice al pie del bloque; queda escrito aquí también.

### Qué hay adentro de las cuentas de deudores (grupo 13) de Feisen

El **18/11/2026** se abrieron tres cuentas de deudores de Feisen **apunte por apunte**, para saber qué tienen realmente adentro: hay cuentas cuyo nombre no dice nada ("Cartera Fiscal", "Cuentas Por Cobrar A Trabajadores") y la única manera de clasificarlas es mirarlas. Se usó la función **`finanzas-cuenta`** (solo lectura, ver `OBSERVACIONES.md`). Los saldos son **al 31 de octubre de 2026**.

**Nada de esto cambió una cifra del balance.** Es información para entender lo que ya se está mostrando, y para saber qué hay que pedirle a contabilidad.

#### 1365 "Cuentas Por Cobrar A Trabajadores" (−$1.050.000): está mal usada

Esta cuenta tiene **7 apuntes, todos "Anticipo de nómina"**, de **cinco trabajadores**. No deberían estar ahí.

- **El diario de nómina está mandando los anticipos a la 1365** en vez de a la **136500 "Préstamo a trabajadores"**, que es la cuenta correcta.
- En la **136500** los anticipos sí entran con **sus dos puntas** —lo que se presta y lo que se descuenta— y **se cancelan solos**. En la **1365** cayó **una sola punta**, y por eso el saldo queda **en negativo**: el balance la lee como si **los trabajadores fueran los acreedores**, que es justo al revés de lo que pasa.
- **Pendiente para la contadora**, y son dos cosas: **apuntar la regla de nómina a la 136500** y **reclasificar esos siete apuntes**. Si no se hace lo primero, **cada quincena vuelve a ensuciar la misma cuenta**.

#### 139000 "Deudas de difícil cobro" ($80.871.859): cartera que no se cobró

Son **cuatro deudores**, y todo **entró con los saldos iniciales de marzo de 2026**, o sea que **viene de antes de Odoo**: no es cartera que se haya dejado de cobrar este año.

| Deudor | Saldo |
|---|---|
| Andrés Felipe Millán | $56.691.591 |
| Alejandro Carvajal | $15.895.828 |
| Oscar Fabián Algarra | $8.231.940 |
| La Casa del Ingeniero JD SAS | $52.500 |
| **Total** | **$80.871.859** |

#### Las dos provisiones: esa deuda ya está castigada casi al 100 %

Sobre esa misma deuda hay **dos castigos contables**, y por eso aparecen dos cuentas en negativo:

| Cuenta | Saldo | Qué es |
|---|---|---|
| 139901 Provisión de Cartera NIIF | −$53.917.269 | El castigo **contable** |
| 139900 Cartera Fiscal | −$26.554.590 | El castigo **para efectos de impuestos** |

Son **dos provisiones sobre la misma deuda** porque **la norma contable y la fiscal la calculan distinto**; no es un error ni un doble registro.

**Deudor por deudor, la cartera está castigada casi al 100 %:** lo único que queda sin castigar son **$400.000**, todos de **Andrés Millán**. Los otros tres quedan en **cero exacto**. Dicho sencillo: **esa plata ya está dada por perdida en los libros**, así que recuperarla sería ganancia y no recuperarla no abre ningún hueco nuevo.

**Una rareza que hay que anotar:** dentro de la **cartera fiscal** hay un apunte de **"FEISEN SAS" por −$31.300.553**. Feisen aparece como **tercero de sí misma**, lo cual es imposible y **parece arrastre de la migración**. Queda escrito para revisarlo con contabilidad.

#### 130501 "Consignaciones sin identificar" (−$70.593.236): se deja como está por ahora

Son **consignaciones de remisiones que no se han logrado identificar**: entró la plata y no se sabe a qué venta corresponde. Angie ya le **pidió un informe de esa cuenta a la contadora**, así que **no se toca ni se reclasifica hasta que llegue ese informe**.

### El aviso del banco de FC se quitó del balance, pero el problema sigue ahí

Hasta el 17/11/2026 arriba del balance había un tercer aviso: **"El banco de FC dice $1.567.157.555 y no es plata real"**, con su porcentaje sobre los activos de FC (el **97 %**). **Se quitó el 18/11/2026**, y por una razón sencilla: esa cifra salía de las cuentas 11xx de Odoo, y esas cuentas ya no se leen. No se puede avisar de un número que el balance ya no tiene.

**Esto hay que decirlo sin suavizarlo: el hecho de fondo no desapareció, solo dejó de verse en el balance.** FC sigue teniendo esa plata sin conciliar en su contabilidad, sigue estando **excluida de la pantalla de Flujo de caja** y sigue siendo **trabajo pendiente para contabilidad**. Lo único que cambió es que **el balance ya no es el sitio donde se ve**.

Los otros avisos de **"Antes de leer estas cifras" siguen igual**: los movimientos transitorios de FC, que FC no tiene patrimonio registrado y que cada contabilidad cuadra consigo misma.

### La maquinaria va al valor en libros

Decisión de Angie del **13/11/2026**, y **no cambió** ni con lo del 17/11 ni con lo del 18/11: la propiedad, planta y equipo se muestra **neta**, al valor en libros, con la depreciación tal como la trae Odoo.

| | Valor |
|---|---|
| Costo | $1.536.355.226 |
| (−) Depreciación acumulada (cuentas 159xxx) | $757.133.219 |
| **Valor en libros** | **$779.222.007** |

- El grupo muestra el **neto**; al abrirlo se ve la resta, costo y depreciación por separado.
- Su Excel la tenía en **$1.063.540.000 sin depreciar**: son **$284 millones** de diferencia.
- Verificado contra Odoo el 13/11/2026, con los saldos de ese día. Al cortar a fin de mes la cifra puede mover un poco, y eso es parte de lo que hay que revisar.

### Dos cosas que el balance NO hace

Conviene que estén escritas, porque el Excel de Angie sí las tenía:

- **No se divide por centro de costo.** Un balance no se reparte por centro —no tiene sentido preguntarse cuánto banco o cuánta cartera le toca a Fundición—, así que en la pestaña **Balance general** el filtro de centro **ni siquiera aparece**. Esto sigue igual que el 13/11.
- **No separa corriente de no corriente.** Odoo no trae esa división y deducirla por el número de cuenta **sería adivinar**. Si algún día se quiere, hay que decidirlo **cuenta por cuenta**.

Y sigue siendo un **balance unificado Feisen + FC**: las dos empresas en el mismo informe, cada renglón con su columna y el total.

### La hoja de BALANCE del Excel de Angie no cuadra

Queda anotado: en esa hoja la fila **"VERIFICACIÓN (debe ser 0)"** da entre **−$136.620.337** (marzo) y **$282.265.443** (septiembre).

Son dos causas:
- El **patrimonio** solo lleva el capital y la utilidad del mes, **sin utilidades acumuladas**.
- La **propiedad, planta y equipo** es un **avalúo**, no el valor en libros.

Por eso el balance del ERP **no se arma copiando esa hoja**, sino desde Odoo.

## 2.4 Cinco cuentas de Feisen se pasaron al español (18/11/2026)

El plan de cuentas de Feisen traía **nombres en inglés** de cuando se instaló Odoo. Angie pidió arreglarlos: *"Cambia eso de 'customers' por clientes nacionales... la 135501, ponle el nombre en español. la 135517 también en español, la 18 también, la 20 también"*.

| Código | Antes | Ahora |
|---|---|---|
| 130500 | Customers | Clientes nacionales |
| 135501 | Advance payment of taxes and contributions or balances in favor | Anticipo de impuestos y contribuciones o saldos a favor |
| 135517 | Sales Tax Withheld | Impuesto a las ventas retenido |
| 135518 | Industry and commerce tax withheld | Impuesto de industria y comercio retenido |
| 135520 | Withheld at source | Retención en la fuente |

- **Solo cambió el nombre.** Ni los códigos, ni los saldos, ni los apuntes. En Odoo todo apunta al identificador interno de la cuenta, así que cambiarle el nombre no mueve un solo asiento.
- **Verificado después:** se volvió a leer el balance y **los saldos quedaron idénticos**.
- Se hizo con una función de un solo uso (`renombrar-feisen`), que **ya quedó apagada**, igual que se hizo en su día con la de la homologación.

**Lo importante para quien venga después:** esta es **la primera vez que se escribe en el plan de cuentas de Feisen**. Hasta el 18/11/2026 Feisen era el **molde**: todo se arreglaba en FC copiando a Feisen, y a Feisen no se le tocaba nada. Desde hoy **las dos empresas pueden tener nombres distintos para el mismo código** —la 130500 es "Clientes nacionales" en Feisen y "Cuentas por Cobrar a Clientes" en FC—, y eso **no es un error**: la pantalla junta las dos empresas **por el código**.

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
- **El balance tiene sus propias casillas**, aparte de todo lo anterior: los **cinco saldos del disponible** (Bancolombia, Davivienda, Efectivo, Fiducias y Tarjeta prepago), que se escriben en la pestaña **Balance general**, una serie por mes, y son **el total de las dos empresas juntas**. No tienen nada que ver con el estado de resultados. Ver la sección 2.3.
- Esas cinco casillas son la **única** fuente del disponible: desde el **18/11/2026** el balance **no lee ni muestra las cuentas de bancos de Odoo**, así que lo que no se escriba ahí no aparece en ningún lado.
- **Desde el 18/11/2026 el balance también tiene casillas de inventario**: una por cada **renglón** del grupo 14, dentro de los tres tipos (doce renglones, que **no son las categorías del ERP**: "Almacén" es toda la bodega en una línea). Funcionan igual que las del disponible —una serie por mes, el total de las dos empresas juntas, guardadas en `eeff_manual` con el concepto del renglón, `inv:almacen`, `inv:lamina`…— con una diferencia: **la casilla de inventario no arranca vacía**, muestra lo que trae el ERP. **Lo que escribas reemplaza esa cifra**; si borras la casilla, vuelve la del ERP. Cinco renglones se muestran **aunque el ERP no traiga nada**, porque esa cifra la escribes tú entera: **Ferretería**, **Piezas y partes de máquina**, **Piezas cortadas en plasma**, **Poleas de aluminio** y **Máquinas terminadas**.
- **Para el inventario, la casilla ya no hace falta para tener el corte del mes:** desde el 18/11/2026 el ERP sí da el valor al último día del mes que estés mirando. Las casillas quedan para **corregir a mano** lo que el ERP no tenga bien (Ferretería, Lámina) y para los **cuatro renglones que no están en el ERP**: los dos de producto en proceso y los dos de producto terminado. Ver la sección 2.3.
- Todo queda guardado en el ERP, mes por mes.

---

## 9. Avisos

- **El periodo de nómina de octubre está en borrador.** Al cerrarlo las cifras pueden cambiar.
- **Desde noviembre, con las dos quincenas en el ERP, hay que borrar las casillas de la primera quincena** o quedarán sumando de más. Son dos sitios: las de **mano de obra de FC** (una por centro), que se borran desde la pantalla, y la de **nómina administrativa de FC** (una sola para toda la empresa), que **ya no está en la pantalla y hay que pedir que la borren**.
- **Los datos de Odoo se mueven mientras contabilidad trabaja el mes.** Conviene volver a mirar antes de dar un mes por cerrado. Esto solo pasa de octubre en adelante: los meses del Excel ya están cerrados y no se mueven.
- **No hay que "arreglar" los meses viejos leyéndolos de Odoo.** Antes de octubre Odoo está incompleto y daría cifras que parecen buenas y no lo son. Si alguna vez hay que cambiar un mes de enero a septiembre, se cambia el Excel y se vuelve a generar `eeffHistorico.js`.
- **El balance hay que revisarlo la primera vez.** Los cambios del **17 y del 18/11/2026** se publicaron **sin verificarlos contra Odoo**. Y si algún mes se ve raro, lo primero a mirar son los **saldos a fin de mes**, que son una consulta nueva.
- **Sin los bancos escritos, el balance queda incompleto.** Mientras no se copien los extractos del mes, el disponible sale en "—" y el total del activo va sin él. Y como las cuentas de bancos de Odoo ya no se leen, **no hay ningún otro sitio del balance de donde sacar esa cifra**.
- **Las cuentas de socios salieron del balance, pero no de la contabilidad.** Desde el 18/11/2026 no suman al activo, al pasivo, al patrimonio ni a ningún indicador, y se ven en su propio bloque al final ($634.597.564 a octubre). En los libros siguen registradas y fiscalmente siguen siendo cuentas con los socios: **eso lo tiene que mirar el contador**.
- **El banco sin conciliar de FC sigue siendo trabajo pendiente para contabilidad.** Desde el 18/11/2026 ya no se ve en el balance —las cuentas 11xx de Odoo salieron de la pantalla—, pero la plata sin conciliar sigue en su contabilidad y sigue excluida del **Flujo de caja**.
- **El inventario del balance sí viene cortado a fin de mes.** Esto corrige un aviso anterior: aquí decía que el grupo 14 traía el valor **de hoy** y que no se podía reconstruir hacia atrás por los ~750 movimientos sin fecha, y **era falso**. Desde el 18/11/2026 el balance pide el inventario **al último día del mes que estés mirando**, con la **misma regla** que la pantalla **Reportes › Corte de inventario** (se parte del stock de hoy y se deshacen los movimientos posteriores; los movimientos sin fecha no estorban porque se usa `created_at`). **Ojo con una cosa:** esa regla está escrita **en dos sitios**, el informe y el balance, y hay que **cambiarlos a la vez** si algún día se toca. Ver la sección 2.3.
- **Las cuatro cifras de materias primas de octubre ya están escritas, y son el corte al 31 de octubre.** El 18/11/2026 se escribieron en octubre Lámina $140.726.373, Almacén $94.094.413, Mecanizados $37.328.138 y Materia prima de Fundición $20.237.600. **Corrige lo que decía este aviso antes**, cuando esas casillas llevaban el stock del 18 de noviembre y aquí quedó escrito que no había forma de sacar el saldo del cierre: sí la había. **Dos de esas casillas ya las escribió Angie a mano, y mandan sobre el ERP:** **Ferretería $51.472.269** (el ERP no le pone valor a esa fecha) y **Lámina $43.810.244**, corrigiendo los $140.726.373 del ERP. Ver la sección 2.3.
- **El inventario del ERP está incompleto, y no por donde se espera.** De **891 artículos** con existencias al 31 de octubre, **306 no tienen precio de costo (34 %)** y entran valiendo cero, así que **el inventario sale por debajo de lo que vale**. No son categorías enteras en blanco: están **repartidos dentro de categorías que sí muestran cifra**. Por eso cada renglón dice cuántos le faltan por costear (Almacén va **264 de 527**), y **hay que cargarles el costo** para que la cifra sirva.
- **Hay 262 artículos de Almacén con existencias y sin precio de costo**, de 519 con existencias (la mitad): **15.484 unidades entrando al balance valiendo cero**. El detalle, artículo por artículo, está en **`Articulos sin precio - Almacen - 18-11-2026.csv`**, en la raíz del proyecto. **Poleas y "Para venta" no tienen precio en ningún artículo** (12 de 12 y 4 de 4), **Herramienta va 34 de 42** y **Tornillería concentra 11.448 unidades sin precio** (tres cuartas partes de todo lo no valorizado). El mismo informe muestra **posibles duplicados en el maestro** ("FRESA EN T 40 MM" dos veces, "POLIURETANO AZUL CIELO" y "POLIURETANO (AZUL CIELO)") y **unidades de medida inconsistentes**: conviene **unificar eso antes de cargar precios**, para no costear dos veces el mismo artículo.
- **Las casillas de inventario ya quedaron probadas: sí guardan** (18/11/2026). Pero **ojo con el efecto secundario**: una cifra escrita **manda sobre el ERP sin avisar en el total del grupo**. Solo se nota **abriendo el grupo**, donde la fila dice **"escrito por ti"** en vez de "el ERP dice…". Si un mes el inventario sale raro, **lo primero a mirar es si algún renglón tiene valor escrito**.
- **La nómina está mandando los anticipos a la cuenta equivocada.** Los anticipos de nómina están cayendo en la **1365 "Cuentas Por Cobrar A Trabajadores"** y no en la **136500 "Préstamo a trabajadores"**, que es la correcta. Ahí quedó una sola punta del movimiento, por eso la cuenta está en **−$1.050.000** (siete apuntes de cinco trabajadores). **Pendiente para la contadora:** apuntar la regla de nómina a la 136500 y reclasificar esos siete apuntes; mientras no se haga, **cada quincena vuelve a ensuciar la misma cuenta**. Ver la sección 2.3.
- **Hay un apunte de "FEISEN SAS" dentro de la cartera fiscal de Feisen (−$31.300.553).** La empresa aparece como tercero de sí misma, que es imposible; parece arrastre de la migración y hay que revisarlo con contabilidad.
- **Las "consignaciones sin identificar" (130501, −$70.593.236) están a la espera de un informe.** Son consignaciones de remisiones que no se han logrado identificar; Angie ya se lo pidió a la contadora y **hasta que llegue no se reclasifica nada**.
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
| Balance: que cada contabilidad cuadre consigo misma | 13/11 | **Exacto**: la suma del saldo de **todas** las cuentas da **$0** en las dos empresas. Desde el 17/11 esto ya no es la fila al pie del balance, sino el aviso de arriba: las dos contabilidades cuadran consigo mismas; el problema no es un descuadre sino dónde está ubicada la plata. Desde el 18/11 es **la única comprobación que queda**, y esa suma **sigue contando las cuentas 11xx** aunque el balance ya no las muestre: si no, no daría cero |
| Balance: el corte a fin de mes y el disponible a mano | — | **Sin verificar.** El cambio del 17/11/2026 (selector de mes, saldos cortados al último día y disponible escrito a mano) se publicó **sin contrastarlo contra Odoo**, a pedido de Angie. Queda pendiente revisarlo la primera vez que se abra |
| Balance: sacar las cuentas 11xx de Odoo | — | **Sin verificar.** El cambio del 18/11/2026 (las 11xx fuera del balance, sin renglón informativo, sin la fila "Plata mal registrada en bancos" y sin el aviso del banco de FC) tampoco se contrastó contra Odoo antes de publicarlo |
| Balance: banco de FC | 13/11 | **$1.567.157.555**, el **97 % de los activos de FC**, y no es plata real: es donde caen los movimientos sin conciliar. Excluido en Flujo de caja. El 17/11 dejó de entrar al activo y quedó como renglón informativo; **desde el 18/11 ya no se muestra en el balance**, junto con el aviso de arriba que daba esa cifra. **El problema sigue ahí**: la plata sin conciliar sigue en la contabilidad de FC y sigue siendo trabajo pendiente, solo que el balance ya no es donde se ve |
| Balance: movimientos transitorios de FC | 13/11 | **$575.445.392** de plata contabilizada sin cuenta definitiva. Va en su propio bloque |
| Balance: resultado del periodo de FC | 13/11 | Unos **$2.046 millones**, pero son de **varios años acumulados**: FC no tiene patrimonio registrado ni cierre de años anteriores. El de Feisen sí es solo de 2026 |
| Balance: maquinaria | 13/11 | Verificado contra Odoo: costo **$1.536.355.226** − depreciación acumulada **$757.133.219** = **$779.222.007** de valor en libros. Su Excel la tenía en $1.063.540.000 sin depreciar: **$284 millones** de diferencia |
| Renombre de cinco cuentas de Feisen | 18/11 | **Verificado**: después de pasar los cinco nombres al español se volvió a leer el balance y **los saldos quedaron idénticos**. Solo cambió el nombre: ni códigos, ni saldos, ni apuntes |
| Qué hay dentro de la 1365, la 139000 y las dos provisiones (Feisen) | octubre | Abiertas **apunte por apunte** con `finanzas-cuenta`: la **1365** tiene 7 anticipos de nómina mal dirigidos (−$1.050.000, pendiente para la contadora); la **139000** son $80.871.859 de cuatro deudores, todos de los saldos iniciales de marzo; las provisiones **139901** (−$53.917.269, contable) y **139900** (−$26.554.590, fiscal) dejan la cartera castigada casi al 100 % —quedan $400.000, todos de Andrés Millán—. Dentro de la cartera fiscal hay un apunte de **"FEISEN SAS" por −$31.300.553**, que parece arrastre de la migración |
| Balance: el inventario del ERP por tipo (grupo 14) | 18/11, al corte del 31/10 | **Verificado contra la base de datos y contra la pantalla**, con el reparto que definió Angie —los **tres tipos**, renglón por renglón— y con el **corte al 31 de octubre**. **Lo que trae el ERP**: materias primas e insumos **$292.386.524** · producto en proceso **$88.937.152** · producto terminado y mercancía **$40.163.403** = **$421.487.079**. Renglón por renglón: Lámina $140.726.373 · Almacén $94.094.413 · Mecanizados $37.328.138 · Materia prima de Fundición $20.237.600 · Ferretería sin valor en el ERP a esa fecha · Piezas y partes de máquina y Piezas cortadas en plasma, que **no están en el ERP** y las escribe ella · Material fundido de hierro $46.794.990 · Material mecanizado $42.142.162 · Motores Constru $40.163.403 · Poleas de aluminio y Máquinas terminadas, que **no están en el ERP** y las escribe ella. **Lo que Angie escribe a mano manda sobre esas cifras, y ese mismo día llenó las doce casillas**, así que el inventario de octubre que vale es el de su conteo: **$604.877.525** (ver las filas de abajo). **"Sin clasificar" quedó vacío**: Equipmaster Store, la última que había ahí, salió del inventario a pedido de ella. El bloque "No es inventario de venta" quedó **prácticamente vacío**, porque herramienta, dotación y otros se fueron a materias primas. La contabilidad de Odoo dice **$619.510.345** en el grupo 14, y esa cifra se muestra en la nota del grupo para que la diferencia se vea. (Antes de esto, el mismo 18/11: el **stock de hoy** —$212.768.273 + $42.952.735 + $77.665.699 = $333.386.707—, un primer reparto con otras cifras, una primera versión con 24 filas por categoría, y un reparto con el material mecanizado en producto terminado —$46.794.990 de proceso y $82.305.565 de terminado—. **Todas quedaron reemplazadas por esto**.) |
| Balance: producto en proceso, como lo definió Angie | 18/11, al corte del 31/10 | **Cuatro renglones, en este orden**: Piezas y partes de máquina y Piezas cortadas en plasma (**no están en el ERP**, las saca ella: *"los otros 2 es lo que yo tengo que sacar"*), Material fundido de hierro **$46.794.990** (Fundición y Armado y soldadura) y Material mecanizado **$42.142.162** (Mecanizados, categoría Producto mecanizado) = **$88.937.152**. El **material mecanizado se movió de producto terminado a producto en proceso**, que es donde corresponde: está mecanizado pero todavía no ensamblado. El **fundido va antes del mecanizado** porque ese es el orden de la producción. El fundido estuvo un rato en "Sin clasificar", hasta que ella lo confirmó: *"el material fundido de hierro también es material en proceso"*. Con ese movimiento **producto terminado se quedó un rato solo con Motores**, hasta que ella lo definió el mismo día (fila siguiente) |
| Balance: las casillas de inventario de materias primas escritas a mano | 18/11 | **Dos, y las dos son cifras de Angie, no del ERP** (después escribió tres más, en las filas de abajo): `inv:ferreteria` **$51.472.269** (el ERP no le pone valor al 31/10) e `inv:lamina` **$43.810.244**, que corrige los **$140.726.373** del ERP —**casi $97 millones de diferencia, y la buena es la de ella**—. Al revisarlo apareció un defecto: **guardar desde la pantalla no limpiaba el campo `nota`**, así que Lámina se quedó con la nota de cuando se llenó por SQL ("Inventario del ERP cortado al 31/10/2026…") **mintiendo sobre una cifra que ya era suya**. **Arreglado**: al guardar se pone `nota` en null, y se limpió la de Lámina, la única que estaba así |
| Balance: qué tan completo está el costeo del inventario | 18/11, al corte del 31/10 | **De 891 artículos con existencias al 31 de octubre, 306 no tienen precio de costo (34 %)** y entran valiendo cero, así que el inventario sale por debajo de lo que vale. No son categorías enteras en blanco: están repartidos dentro de categorías que sí muestran cifra (Poleas sale en $0 con sus 10 artículos sin costo, pero Herramienta muestra $3.324.000 con 29 de 43 sin costear). Por eso cada renglón dice cuántos le faltan por costear: Almacén va **264 de 527** |
| Balance: guardar una casilla de inventario | 18/11 | **Probado y funciona.** Angie escribió **$2** en la casilla de Lámina: ese $2 **reemplazó los $63.675.999 del ERP** en el total, y **al borrarlo volvió el valor del ERP** (`eeff_manual`, empresa `total`; ese día el concepto era todavía `inv:<bodega\|categoría>`, y más tarde pasó a ser el del renglón, `inv:lamina`). Funciona en los dos sentidos. **Efecto secundario:** una cifra escrita manda sobre el ERP **sin avisar en el total del grupo**; solo se nota abriendo el grupo, donde la fila dice "escrito por ti" |
| Balance: el inventario cortado a fin de mes | 18/11 | **Verificado, y corrige lo que decía antes esta misma tabla.** Aquí estaba escrito que el corte del mes "no se podía verificar" porque `stock` no guarda historia y hay ~750 movimientos sin fecha: **era falso**. Dos comprobaciones: contra el **Excel que exportó Angie de Fundición al 3 de octubre**, la función da **$48.446.500 y 125 artículos**, **idéntico al archivo**; y **Almacén al 31 de octubre da $94.094.413**, **exactamente** la cifra de su informe del ERP. La regla es **la misma** que la de Reportes › Corte de inventario, copiada a propósito para que no puedan dar cifras distintas: **hay que mantener los dos sitios iguales** (ninguno mira `revertido`) |
| Balance: producto terminado, como lo definió Angie | 18/11, al corte del 31/10 | **Tres renglones**, en este orden: Poleas de aluminio y Máquinas terminadas (**no están en el ERP**, las escribe ella) y **Motores Constru $40.163.403** (bodega Motores, categoría Motores Constru). Palabras de ella: *"en productos terminados va: Poleas de aluminio, Máquinas terminadas y motores constru"*. Los dos primeros no están en el ERP porque **al 31/10 ninguna categoría de aluminio tiene existencias** y **las máquinas ya armadas no se registran como artículo**. El renglón de Motores **dejó de tomar toda la bodega** y toma solo esa categoría, así que **Equipmaster Store quedó un rato en "Sin clasificar"** con **$0** (12 artículos, ninguno con precio de costo), hasta que ella lo mandó sacar del inventario (fila más abajo). **Con esto los tres tipos quedan definidos por ella** |
| Balance: la casilla de Material fundido de hierro | 18/11, octubre | **Resuelto, era un dígito.** Estuvo escrita en **$6.794.990** contra los **$46.794.990** del ERP —exactamente $40.000.000 de diferencia, el mismo número salvo el 4 del principio— y quedó señalada para confirmarla. **Angie la corrigió a $46.794.990.** Ya no hay nada pendiente por ese lado |
| Balance: las otras casillas de inventario escritas a mano | 18/11, octubre | `inv:piezas_plasma` **$21.861.159** (ese renglón **no está en el ERP**) e `inv:material_mecanizado` **$42.142.162**, que es **exactamente lo que trae el ERP**: lo que hizo fue **fijarlo**. Más tarde ese mismo día llenó **las que faltaban** (ver las dos filas de abajo) |
| Balance: Equipmaster Store fuera del inventario | 18/11 | **Sacado a pedido de Angie**, que lo vio en "Sin clasificar": *"EQUIPMASTER STORE · MOTORES esto quítalo por favor"*. Quedó como **renglón sin tipo** al final de la lista: **no se muestra ni suma**, pero **sigue emparejando la categoría** para que no vuelva a caer en "Sin clasificar" y para que quede escrito que **es una decisión y no un olvido**. Hoy **no mueve ninguna cifra**: son 12 artículos, ninguno con precio de costo, **$0**. **El riesgo queda anotado**: si algún día se les cargan precios, **esa plata no entraría al inventario del balance** mientras el renglón siga sin tipo. Con esto **"Sin clasificar" quedó vacío**: todas las categorías del ERP con existencias tienen renglón o exclusión escrita |
| Balance: las doce casillas del inventario de octubre | 18/11, octubre | **Angie llenó las doce**, así que el inventario del balance de octubre **es su conteo, no el del ERP** (`eeff_manual`, mes `2026-10`, empresa `total`): Almacén $94.094.413 · Lámina $43.810.244 · Materia prima de Fundición $20.237.600 · Ferretería $51.472.269 · Mecanizados $37.328.138 · Piezas y partes de máquina $74.494.000 · Piezas cortadas en plasma $21.861.159 · Material fundido de hierro $46.794.990 · Material mecanizado $42.142.162 · Poleas de aluminio $25.859.147 · Máquinas terminadas $106.620.000 · Motores Constru $40.163.403. Totales: materias primas **$246.942.664** · producto en proceso **$185.292.311** · producto terminado **$172.642.550** · **inventario total $604.877.525** |
| Balance: el inventario contra la contabilidad | 18/11, octubre | **A 2,4 %.** La contabilidad de Odoo dice **$619.510.345** en el grupo 14 y el inventario que armó Angie da **$604.877.525**: **$14.632.820** de diferencia. Al empezar el día el inventario del ERP daba **$333 millones** y la diferencia era de **$286 millones**. El acercamiento es **de ella**: definió los renglones y contó lo que el ERP no tiene |
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
| 17/11 | **El balance ya no es "a hoy": tiene selector de mes**, el mismo del modo "Un mes", y muestra los saldos **cortados al último día del mes escogido**, acumulados desde el inicio. La etiqueta en pantalla dice **"A fin de"**. Se hizo así porque los extractos del banco son mensuales: mezclar un extracto de octubre con la cartera de hoy daría un balance falso. Los saldos a fin de mes los trae una función nueva, `finanzas-balance` |
| 17/11 | **El grupo 11 Disponible ya no sale de Odoo.** Son cinco casillas que Angie llena a mano con los extractos (Bancolombia, Davivienda, Efectivo, Fiducias y Caja menor), una serie por mes. Palabras de ella: *"el banco yo lo lleno a mano, con lo de los extractos y eso, no con lo que hay en los odoo, porque casi nunca es verídico"*. Mientras no escriba nada, el disponible muestra **"—" y no cero**, y arriba avisa que falta |
| 17/11 | Esas casillas son **el total de las dos empresas juntas**, no se dividen entre Feisen y FC. Por eso en ese grupo **las columnas de Feisen y FC salen con "—"** y solo hay cifra en el total. Queda advertido porque se ve raro la primera vez |
| 17/11 | **Lo que dice Odoo de bancos (las cuentas 11xx) queda como renglón informativo**, plegado dentro del mismo grupo 11 y solo para comparar: no entra en ninguna suma. Ahí siguen las advertencias en ámbar sobre el banco de FC |
| 17/11 | **La fila de comprobación cambió de significado.** Antes era *activo + transitorias − pasivo − patrimonio*, que siempre daba $0 porque todo salía de Odoo. Ahora es **disponible escrito a mano − disponible de Odoo** y se llama **"Plata mal registrada en bancos"**. Se presenta en ámbar, como trabajo pendiente para contabilidad, **no como un error del informe**; si no hay nada escrito, la cifra no se muestra. Que la suma de todas las cuentas de Odoo dé cero se sigue usando, pero solo para el aviso de arriba de que cada contabilidad cuadra consigo misma |
| 17/11 | Sin cambios: el balance **sigue siendo unificado Feisen + FC**, **no se divide por centro de costo** (un balance por centro no tiene sentido) y la **depreciación y la maquinaria quedan al valor en libros** de Odoo |
| 17/11 | **Este cambio se publicó sin verificarlo contra datos reales de Odoo**, a pedido de Angie. Queda anotado para que lo revise la primera vez que abra el balance. Si algún mes se ve raro, lo primero a mirar son los **saldos a fin de mes**, que son una consulta nueva |
| 18/11 | **Las cuentas 11xx de Odoo salieron del balance por completo**: ya no se leen ni se muestran, y con ellas se fue el renglón informativo "Lo que dice la contabilidad en Odoo". Palabras de Angie: *"quita eso de lo que hay en odoo y deja solo lo que yo voy a ingresar en efectivo y bancos"*. El **grupo 11 Disponible son únicamente las casillas que ella escribe** |
| 18/11 | **Desapareció la fila "Plata mal registrada en bancos"** (disponible escrito − disponible de Odoo): sin el dato de Odoo no hay resta que hacer. El balance **ya no tiene fila de comprobación al pie**. Si algún día se quiere esa comparación, toca hacerla **contra Odoo directamente**, fuera de esta pantalla |
| 18/11 | **Se quitó el aviso de arriba sobre el banco de FC** ($1.567.157.555 y su porcentaje de los activos de FC), porque mostraba justamente esa cifra de Odoo. **El hecho de fondo no desapareció, solo dejó de verse en el balance**: FC sigue teniendo esa plata sin conciliar, sigue excluida del Flujo de caja y sigue siendo trabajo pendiente para contabilidad. Los otros avisos de "Antes de leer estas cifras" siguen igual: los movimientos transitorios de FC, que FC no tiene patrimonio registrado y que cada contabilidad cuadra consigo misma |
| 18/11 | El **conteo de cuentas del pie del balance ya no cuenta las 11xx descartadas**. La **suma de todas las cuentas de Odoo sí las sigue contando**, porque si no, no daría cero: es la que respalda el aviso de que cada contabilidad cuadra consigo misma |
| 18/11 | Sin cambios: el balance sigue siendo **a fin del mes escogido**, **unificado Feisen + FC**, **sin centro de costo**, con la **maquinaria al valor en libros**, y las casillas del disponible siguen siendo el **total de las dos empresas juntas** (por eso las columnas de Feisen y FC salen con "—" en ese grupo) |
| 18/11 | **Se quitó la casilla de "Caja menor" del disponible.** Palabras de Angie: *"elimina en el balance la casilla de 'caja menor', esa no la uso"*. El disponible queda con **cuatro casillas**: Bancolombia, Davivienda, Efectivo y Fiducias. Si algún mes ya tenía escrita una cifra en caja menor, **ese valor deja de verse y deja de sumar al disponible** (el renglón sigue guardado en el ERP, pero la pantalla no lo muestra) |
| 18/11 | **Entró la casilla de "Tarjeta prepago" en el disponible**, en el puesto que dejó libre la caja menor. Palabras de Angie: *"añade una cuenta en el efectivo donde estaba caja menor x tarjeta prepago"*. El disponible queda con **cinco casillas**: Bancolombia, Davivienda, Efectivo, Fiducias y Tarjeta prepago. Se escribe y se guarda igual que las demás, mes por mes |
| 18/11 | **Este cambio tampoco se verificó contra datos reales de Odoo** antes de publicarlo |
| 18/11 | **El balance y el estado de resultados se separaron en dos pestañas de carpeta**: **"Estado de resultados"** y **"Balance general"**. Lo pidió Angie: *"separa el informe de eeff el balance y el pyg... para que no se confundan con los mismos botones"*. Antes los tres botones ("Un mes", "Todo el año" y "Balance") iban en la misma fila y el balance parecía una tercera forma de ver el mismo informe. **Cada pestaña trae ahora solo sus propios controles**: el estado de resultados lleva el período, el mes o el año, el centro de costo y el formato de las cifras; el balance, solo "A fin de" con su mes y el aviso de que los bancos los escribe ella. Ver la sección 1.2 |
| 18/11 | **Las cuentas de socios salieron del balance**: no suman al activo, al pasivo, al patrimonio ni a ningún indicador. Palabras de Angie: *"AFC AVF son las cuentas de socios, eso no lo debemos tener en cuenta para el balance"*. No se borran: van en un **bloque propio al final**, como los movimientos transitorios, con el signo tal como viene de Odoo (positivo = se lo deben al negocio, negativo = el negocio se lo debe al socio). Son Feisen 133002 "Otras Cuentas Por Cobrar AVF" ($582.808.358), Feisen 133003 "Otras Cuentas Por Cobrar AFC" ($51.814.206) y FC 233506 "Cuentas por pagar a socios Angie" (−$25.000); **total del bloque $634.597.564** a octubre. Con eso los **deudores** pasan de $1.096.907.111 a **$462.284.547**, el total activo queda en $2.001.236.418 y el total pasivo en $1.699.653.878. **Se escogen por empresa y no por código**, porque la 233506 de Feisen es "Otras Cuentas Por Pagar" —deuda con terceros— y se queda en el pasivo. Y sin suavizarlo: **es una decisión de cómo leer el balance para gerenciar, no un cambio en la contabilidad**; en los libros siguen registradas y fiscalmente siguen siendo cuentas con los socios, que las tiene que mirar el contador |
| 18/11 | **Ninguna cifra cambió con las pestañas**: es solo cómo se llega a cada informe. Por dentro, lo que antes se recordaba en un solo dato ahora son dos —**qué informe** y, dentro del estado de resultados, **qué período**—, y el equipo los recuerda por separado: al salir al balance y volver se encuentra el período que se tenía. La preferencia vieja se sigue leyendo una vez para que a nadie se le pierda |
| 18/11 | **Cinco cuentas del plan de Feisen se pasaron del inglés al español**: 130500 Customers → **Clientes nacionales** · 135501 → **Anticipo de impuestos y contribuciones o saldos a favor** · 135517 → **Impuesto a las ventas retenido** · 135518 → **Impuesto de industria y comercio retenido** · 135520 → **Retención en la fuente**. Lo pidió Angie: *"Cambia eso de 'customers' por clientes nacionales... la 135501, ponle el nombre en español. la 135517 también en español, la 18 también, la 20 también"*. **Solo cambió el nombre**: ni códigos, ni saldos, ni apuntes, y verificado después contra el balance (saldos idénticos). **Es la primera vez que se escribe en el plan de cuentas de Feisen**, que hasta ahora era el molde intocable de la homologación: desde hoy **Feisen y FC pueden tener nombres distintos para el mismo código** (la 130500 es "Clientes nacionales" en Feisen y "Cuentas por Cobrar a Clientes" en FC). Ver la sección 2.4 |
| 18/11 | **Se abrieron tres cuentas de deudores de Feisen, apunte por apunte**, para saber qué tienen adentro (saldos al 31/10/2026). **La 1365 "Cuentas Por Cobrar A Trabajadores" (−$1.050.000) está mal usada**: el diario de nómina manda los anticipos ahí en vez de a la 136500 "Préstamo a trabajadores", y como solo cae una punta del movimiento la cuenta queda en negativo, como si los trabajadores fueran los acreedores. **Pendiente para la contadora**, también en la sección de Avisos. **La 139000 "Deudas de difícil cobro" ($80.871.859)** son cuatro deudores (Andrés Felipe Millán $56.691.591, Alejandro Carvajal $15.895.828, Oscar Fabián Algarra $8.231.940 y La Casa del Ingeniero JD SAS $52.500), toda entrada con los saldos iniciales de marzo de 2026: viene de antes de Odoo. **La 139901 "Provisión de Cartera NIIF" (−$53.917.269) es el castigo contable y la 139900 "Cartera Fiscal" (−$26.554.590) el fiscal**: dos provisiones sobre la misma deuda porque la norma contable y la fiscal la calculan distinto, y **deudor por deudor está castigada casi al 100 %** (quedan $400.000, todos de Andrés Millán; los otros tres en cero exacto). Queda anotada una **rareza**: dentro de la cartera fiscal hay un apunte de **"FEISEN SAS" por −$31.300.553**, la empresa como tercero de sí misma, que parece arrastre de la migración. **Ninguna cifra del balance cambió con esto** |
| 18/11 | **El grupo 14 Inventarios dejó de leerse de Odoo: ahora se arma con el inventario del ERP**, organizado en los **tres tipos que escogió Angie** y, dentro de cada uno, una fila por cada categoría del ERP (bodega + categoría). **Esas filas por categoría también quedaron reemplazadas el mismo 18/11 por los renglones de Angie** (ver más abajo). Palabras de ella: *"tengo 3 tipos de inventarios pero cada uno tiene categorías internas, y esas categorías ya se pueden sacar de los inventarios que tenemos en el erp. organicemos los inventarios así por ahora, lo que no tengamos valor déjalo en 0 que yo lo lleno"*. En el primer reparto del día las cifras eran: materias primas e insumos $153.922.957 + producto en proceso $72.405.485 + producto terminado y mercancía $102.207.848 = $328.536.290, y aparte "No es inventario de venta" $4.794.977. **Ese reparto se corrigió el mismo 18/11 y esas cifras ya no son las buenas: las vigentes están más abajo.** **La contabilidad de Odoo dice $619.510.345** en ese grupo, y esa cifra queda en la nota del grupo para que la diferencia se vea. El dato lo trae una función nueva de Supabase, `finanzas_inventario()`. Ver la sección 2.3 |
| 18/11 | **Cada fila del inventario tiene su casilla**, igual que los bancos: lo que se escribe **reemplaza** lo del ERP, se guarda mes por mes (`eeff_manual`, concepto `inv:<bodega\|categoría>` —que más tarde ese mismo día pasó a ser el del renglón—) y **vaciarla devuelve el valor del ERP**. Se puso porque en ese momento yo daba por hecho que **el valor del ERP era el de hoy y no el del cierre del mes** —la tabla de existencias no guarda historia y hay unos 750 movimientos sin fecha—. **Eso resultó falso ese mismo día** (ver las filas del final): el ERP sí da el corte. Las casillas se quedan, pero ahora sirven para **corregir a mano**, no para suplir el corte |
| 18/11 | **Sin suavizarlo: el inventario del ERP está incompleto.** De **867 artículos** con existencias, **304 no tienen precio de costo (35 %)** y entran valiendo cero, y **no son categorías enteras en blanco** —esas se verían—: están repartidos dentro de categorías que sí muestran cifra (Poleas sale en $0 con sus 12 artículos sin costo; Herramienta muestra $1.788.000 con 34 de 42 sin costear). Por eso **cada categoría dice cuántos artículos le faltan por costear** y la pantalla avisa en ámbar debajo del grupo |
| 18/11 | Se creó un bloque **"No es inventario de venta"** que se muestra pero **no suma** al inventario (herramienta, dotación, aseo, papelería y mantenimiento). **Más tarde ese mismo día herramienta, dotación y otros se pasaron a materias primas** y el bloque quedó prácticamente vacío (ver más abajo). Y lo que no esté clasificado cae en **"Sin clasificar"**, que **sí suma** al total pero sale marcado en ámbar, a propósito: si alguien crea una categoría nueva en el ERP tiene que verse fuera de sitio y no desaparecer en silencio. Hoy las 24 categorías con existencias están clasificadas y ese bloque está vacío. Ojo: lo que agrupa es **dónde está la existencia**, no de qué bodega es el artículo, por eso "Material fundido hierro" aparece dos veces (Fundición y Armado y soldadura) y las dos van a producto en proceso |
| 18/11 | **Guardar una casilla de inventario quedó probado y funciona.** Angie escribió **$2 de prueba** en la casilla de Lámina: ese $2 **reemplazó los $63.675.999 del ERP** en el total, y **al borrarlo volvió el valor del ERP**. Funciona en los dos sentidos. Queda anotado el **efecto secundario**: una cifra escrita **manda sobre el ERP sin avisar en el total del grupo**, y solo se nota **abriendo el grupo**, donde la fila dice **"escrito por ti"** en vez de "el ERP dice…" |
| 18/11 | **Las "consignaciones sin identificar" (130501, −$70.593.236) se dejan como están por ahora.** Son consignaciones de remisiones que no se han logrado identificar; Angie ya le pidió a la contadora un informe de esa cuenta y hasta que llegue no se reclasifica nada |
| 18/11 | **Angie redefinió qué va en "materias primas", categoría por categoría.** Palabras de ella: *"en Materia prima debe ir, 1. Almacen... Adicional Materia prima también es Lamina, Ferreteria (este no está en el ERP), de la bodega de fundicion, la catgoria de Materia prima, de la bodega de mecanizados (aceros, ferreteria, fundicion)"*. Entra **toda la bodega Almacén, las doce categorías**, incluida **"Fundición - Almacén"** —al verlo dijo *"eso de fundicion almacen si deberia contarlo"*; ese día quedó escrito que su informe de $94.094.413 era Almacén **sin** esa categoría, **y eso era falso**: era el corte al 31/10 de **toda** la bodega (ver las filas del final)—, más **Lámina** (Corte y doblez), **Ferretería**, la categoría **"Materia prima" de Fundición** y, de **Mecanizados**, **Aceros, Ferretería - Mecanizados y Fundición - Mecanizados**. **La estructura no cambió: cambió el reparto** |
| 18/11 | **"Fundición - Mecanizados" pasó de producto en proceso a materia prima**: el fundido que llega a Mecanizados **es la materia prima de esa etapa**, aunque venga de Fundición. Y **herramienta, dotación y otros salieron del bloque "No es inventario de venta" y entraron a materias primas**, porque el informe de Almacén de Angie los cuenta; con eso **ese bloque quedó prácticamente vacío** y ya no se ve en pantalla. **En producto en proceso queda solo** el hierro fundido que todavía no entró a mecanizar ni a ensamblar: "Material fundido hierro" en Fundición y en Armado y soldadura |
| 18/11 | **Con el reparto nuevo, las cifras del grupo 14 quedan así** (verificadas contra la base de datos y contra la pantalla): materias primas e insumos **$212.768.273** + producto en proceso **$42.952.735** + producto terminado y mercancía **$77.665.699** = **$333.386.707**. **Ninguna de las 24 categorías con existencias quedó sin clasificar.** La contabilidad de Odoo sigue diciendo **$619.510.345** en ese grupo. **Ojo: esas cifras son el stock de hoy.** El mismo día se vio que el ERP sí sabe dar el corte del mes, y al 31/10 el total es **$421.487.079** (ver las filas del final) |
| 18/11 | **La bodega de Ferretería está casi sin cargar en el ERP**: 45 artículos y solo **2 con existencias ($1.966.580)**. Angie ya lo sabía (*"este no está en el ERP"*), así que **esa cifra hay que escribirla a mano** en la casilla de ese renglón |
| 18/11 | **Informe nuevo: `Articulos sin precio - Almacen - 18-11-2026.csv`**, en la raíz del proyecto. Son los **262 artículos de Almacén con existencias y sin precio de costo**, de **519 con existencias** (la mitad), **15.484 unidades entrando al balance valiendo cero**. **Poleas y "Para venta" no tienen precio en ningún artículo** (12 de 12 y 4 de 4), **Herramienta 34 de 42**, y **Tornillería concentra 11.448 unidades sin precio** (tres cuartas partes de todo lo no valorizado). El informe también detectó **posibles duplicados en el maestro** ("FRESA EN T 40 MM" dos veces, "POLIURETANO AZUL CIELO" y "POLIURETANO (AZUL CIELO)") y **unidades de medida inconsistentes**, que conviene **unificar antes de cargar precios** |
| 18/11 | **El inventario dejó de mostrarse categoría por categoría: ahora se ven los renglones de Angie.** Paró la versión de 24 filas: *"yo materia prima estoy viendo todo por separado, no me tienes que dejar todo por separado, mete almacén (sin sus categorías), lámina, materia prima de la bodega de fundición, ferretería, aceros - fundición - ferretería de mecanizados"*. **Un renglón puede juntar varias categorías del ERP**: "Almacén" son las doce de esa bodega en una sola línea y "Mecanizados" son tres (aceros, fundición y ferretería de esa bodega). **De 24 filas se pasó a 9.** El reparto por tipo y el total **no cambiaron**: materias primas e insumos $212.768.273 · producto en proceso $42.952.735 · producto terminado y mercancía $77.665.699 = **$333.386.707** (el stock de hoy; el corte bueno al 31/10 está en las filas del final), y Odoo sigue diciendo $619.510.345. Lo de fondo: **las líneas que se ven son las líneas en las que piensa Angie**, no las que el ERP tiene por dentro. Ver la sección 2.3 |
| 18/11 | **Los nueve renglones, verificados en la pantalla** (con el stock de hoy; el corte al 31/10 está en las filas del final): Almacén $102.885.940 · Lámina $63.675.999 · Mecanizados $25.625.854 · Materia prima de Fundición $18.613.900 · Ferretería $1.966.580 · Material fundido de hierro $42.952.735 · Producto mecanizado $39.272.134 · Motores $38.393.565. **Nada cayó en "Sin clasificar"**, que sigue estando ahí en ámbar por si alguien crea una categoría nueva en el ERP. Cada renglón dice cuántos artículos le faltan por costear (Almacén: 262 de 519) |
| 18/11 | **El renglón de Ferretería se muestra aunque el ERP no traiga nada**, para que Angie pueda escribir la cifra: esa bodega casi no está cargada (2 artículos con existencias de 45). Palabras de ella: *"el único dato que no está en el erp es el de ferretería solita, eso lo ingreso yo a mano"* |
| 18/11 | **Las casillas del inventario pasaron a guardarse por renglón**: el concepto de `eeff_manual` ya no es `inv:<bodega\|categoría>` sino `inv:<id del renglón>` (`inv:almacen`, `inv:lamina`…), porque **lo que ella escribe es la línea que ve**. **No había ninguna casilla guardada, así que no hubo nada que migrar** |
| 18/11 | **Se escribieron en octubre las cuatro cifras de materias primas que ya están en el ERP**, a pedido de Angie (*"en el inventario de una vez, en materia prima llena la parte que tienes ya en el erp y solo deja ferretería para que yo llene"*): Almacén $102.885.940 · Lámina $63.675.999 · Mecanizados $25.625.854 · Materia prima de Fundición $18.613.900. **Ferretería se dejó vacía** para que la escriba ella (mientras tanto muestra los $1.966.580 parciales del ERP, que sí suman). El total de materias primas **no cambió** ($212.768.273), porque lo escrito es lo mismo que traía el ERP; lo que cambió es que esas cuatro cifras **quedaron fijas**. **En ese momento el valor escrito era el del 18 de noviembre, no el del cierre de octubre**, porque yo daba por hecho que el ERP no podía dar el corte. **Resultó falso y las cuatro casillas se reescribieron el mismo día** con el corte al 31/10 (ver las filas del final). Ver la sección 2.3 |
| 18/11 | **Se corrigió una afirmación mía que era falsa: el inventario del ERP sí se puede cortar a fin de mes.** Aquí quedó escrito varias veces que no se podía —que la tabla `stock` solo guarda la cantidad actual, que no hay historia y que los ~750 movimientos sin fecha impedían reconstruirla—. Angie lo corrigió: *"te vas a inventarios, corte de inventarios, y debería sacarte la información a la fecha de lo que había"*. La pantalla **Reportes › Corte de inventario** ya lo hacía desde hace tiempo: parte del stock de hoy y **deshace los movimientos posteriores**, y los movimientos sin fecha **no estorban** porque usa `created_at` como respaldo |
| 18/11 | **La función `finanzas_inventario()` recibe ahora una fecha** y aplica **la misma regla** que ese informe. El balance le pide el corte al **último día del mes que se esté mirando**, así que el grupo 14 ya está a la misma fecha que el resto del balance. **La regla se copió a propósito**, para que el balance y el informe no puedan dar cifras distintas del mismo día; la contrapartida es que **son dos sitios que hay que mantener iguales** —**ninguno de los dos mira el campo `revertido`**—, y si se cambia uno hay que cambiar el otro |
| 18/11 | **Comprobado dos veces, y las dos cuadran.** Contra el **Excel que exportó la propia Angie de Fundición al 3 de octubre**: la función da **$48.446.500 y 125 artículos**, **idéntico al archivo**. Y **Almacén al 31 de octubre da $94.094.413**, que es **exactamente** la cifra que ella tenía de su informe del ERP |
| 18/11 | **Octubre cambia de cifras, porque pasa del stock de hoy al del cierre:** materias primas e insumos **$212.768.273 → $292.386.524** · producto en proceso **$42.952.735 → $46.794.990** · producto terminado y mercancía **$77.665.699 → $82.305.565** · **total $333.386.707 → $421.487.079**. Las cuatro casillas de materias primas de octubre **se reescribieron con el corte bueno**: `inv:almacen` $94.094.413 · `inv:lamina` $140.726.373 · `inv:mecanizados` $37.328.138 · `inv:mp_fundicion` $20.237.600. **Ferretería no la trae el ERP a esa fecha**, y la escribió Angie: **$51.472.269** |
| 18/11 | **Corregida otra deducción mía equivocada, esta sobre el informe de Almacén.** Aquí quedó escrito que los **$94.094.413** de su informe eran "la bodega **sin** la categoría Fundición - Almacén", porque con las cifras de hoy las dos casi cuadraban (**$15.873** de diferencia). **Era casualidad.** Su cifra era el **corte al 31 de octubre de toda la bodega**, Fundición - Almacén incluida, y cuadra **al peso**. **Angie tenía razón desde el principio** cuando dijo *"eso de fundicion almacen si deberia contarlo"* |
| 18/11 | **Angie definió qué va en producto en proceso.** Palabras de ella: *"Ahora vamos con el tema de material en proceso: Piezas y partes de máquina · Piezas cortadas en plasma · Material mecanizado (este sí está en el erp), los otros 2 es lo que yo tengo que sacar"*. **Piezas y partes de máquina** y **Piezas cortadas en plasma** no están en el ERP: son conteos suyos y se muestran aunque el ERP no traiga nada, para que pueda escribirlos. **Material mecanizado** (Mecanizados, categoría "Producto mecanizado", $42.142.162 al 31/10) **se movió de producto terminado a producto en proceso**, que es donde corresponde: está mecanizado pero todavía no ensamblado. Con eso **producto terminado queda solo con Motores ($40.163.403)**, a la espera de que ella lo defina |
| 18/11 | **El material fundido de hierro también es producto en proceso.** No estaba en su lista de tres y quedó un rato en "Sin clasificar" ($46.794.990, en Fundición y en Armado y soldadura), hasta que ella lo confirmó: *"el material fundido de hierro también es material en proceso"*. Entra como renglón propio **antes del mecanizado**, porque ese es el orden de la producción: primero se funde, después se mecaniza. **"Sin clasificar" quedó vacío**: todas las categorías del ERP con existencias tienen renglón. **Producto en proceso al 31/10 queda en $88.937.152** (fundido $46.794.990 + mecanizado $42.142.162), más lo que ella escriba en los dos renglones que saca a mano |
| 18/11 | **Arreglado un defecto al guardar las casillas: no se limpiaba el campo `nota`.** Las cuatro cifras de materias primas se habían llenado por SQL con la nota "Inventario del ERP cortado al 31/10/2026, misma regla que Reportes › Corte de inventario"; cuando Angie corrigió **Lámina** desde la pantalla, esa nota **se quedó ahí mintiendo sobre una cifra que ya era suya**. Ahora al guardar se pone **`nota` en null**, y se limpió la de Lámina, que era la única en ese caso |
| 18/11 | **Angie escribió dos casillas de inventario a mano, y son cifras suyas, no del ERP:** `inv:ferreteria` **$51.472.269** (el ERP no le pone valor al 31/10) e `inv:lamina` **$43.810.244**, corrigiendo los **$140.726.373** del ERP: **casi $97 millones de diferencia, y la cifra buena es la de ella**. Con esas dos, el inventario de octubre en pantalla queda en **materias primas $246.942.664 · producto en proceso $88.937.152 · producto terminado $40.163.403 = $376.043.219**. La contabilidad de Odoo sigue diciendo **$619.510.345** en el grupo 14 |
| 18/11 | **Angie definió qué va en producto terminado, y con eso los tres tipos quedan definidos por ella.** Palabras suyas: *"en productos terminados va: Poleas de aluminio, Máquinas terminadas y motores constru"*. **Tres renglones**: **Poleas de aluminio** y **Máquinas terminadas**, que **no están en el ERP** —al 31/10 **no hay ninguna categoría de aluminio con existencias** y **las máquinas ya armadas no se registran como artículo**—, así que se muestran aunque el ERP no traiga nada para que ella las escriba, igual que Ferretería en materias primas y que los dos renglones de piezas en producto en proceso; y **Motores Constru $40.163.403** al 31/10. **Antes el reparto de los tipos era mío**; desde hoy los tres son suyos. Ver la sección 2.3 |
| 18/11 | **El renglón de Motores dejó de tomar toda la bodega y toma solo la categoría Motores Constru.** Lo otro que hay en esa bodega, **Equipmaster Store**, no estaba en la lista de Angie y quedó en **"Sin clasificar"**, en ámbar: son **12 artículos, ninguno con precio de costo**, así que entra valiendo **$0** y no mueve ningún total. Se queda a la vista **hasta que ella diga dónde va** — que es justo para lo que está ese bloque |
| 18/11 | **Angie escribió tres casillas de inventario más a mano** (octubre de 2026): `inv:piezas_plasma` **$21.861.159** (ese renglón **no está en el ERP**), `inv:material_mecanizado` **$42.142.162**, que es **exactamente lo que trae el ERP** —lo que hizo fue **fijarlo**—, e `inv:fundido` **$6.794.990**. **Siguen vacías** `inv:piezas_maquina`, `inv:poleas_aluminio` e `inv:maquinas`. Con las dos de materias primas que ya tenía escritas, **van cinco casillas**; ese mismo día terminó las doce (ver las filas del final) |
| 18/11 | **Ojo con la casilla del material fundido: parece faltarle un dígito.** Ella escribió **$6.794.990** y el ERP dice **$46.794.990** al 31/10: la diferencia es de **exactamente $40.000.000** y el número es **el mismo salvo el 4 del principio**. **No se tocó**, porque es su cifra y puede ser su conteo real, pero quedó señalado para que lo confirmara. **Resuelto el mismo día: era un dígito y Angie la corrigió a $46.794.990** |
| 18/11 | **Equipmaster Store salió del inventario del balance, a pedido de Angie**, que lo vio en el bloque de "Sin clasificar": *"EQUIPMASTER STORE · MOTORES esto quítalo por favor"*. Se hizo con un **renglón sin tipo** al final de la lista: **no se muestra ni suma**, pero **sigue emparejando la categoría** para que no caiga en "Sin clasificar" y, sobre todo, **para que quede escrito que es una decisión y no un olvido**. **Hoy no mueve ninguna cifra** —12 artículos, ninguno con precio de costo, **$0**—, pero **si algún día se les cargan precios, esa plata no entraría al inventario del balance** mientras el renglón siga sin tipo. Con esto **"Sin clasificar" quedó vacío**: todas las categorías del ERP con existencias tienen renglón o exclusión escrita. Ver la sección 2.3 |
| 18/11 | **Angie terminó de llenar las doce casillas del inventario de octubre**, así que el grupo 14 del balance de ese mes **ya no es del ERP: es su conteo** (`eeff_manual`, mes `2026-10`, empresa `total`). Materias primas: Almacén $94.094.413 · Lámina $43.810.244 · Materia prima de Fundición $20.237.600 · Ferretería $51.472.269 · Mecanizados $37.328.138. En proceso: Piezas y partes de máquina $74.494.000 · Piezas cortadas en plasma $21.861.159 · Material fundido de hierro $46.794.990 · Material mecanizado $42.142.162. Terminado: Poleas de aluminio $25.859.147 · Máquinas terminadas $106.620.000 · Motores Constru $40.163.403. Totales: **$246.942.664** + **$185.292.311** + **$172.642.550** = **inventario total $604.877.525** |
| 18/11 | **El inventario y la contabilidad quedaron a 2,4 %.** Odoo dice **$619.510.345** en el grupo 14 y el inventario de Angie da **$604.877.525**: **$14.632.820** de diferencia. Al empezar el día el inventario del ERP daba **$333 millones** y la diferencia era de **$286 millones**. Lo que cerró esa brecha fue **que ella definiera los renglones y contara lo que el ERP no tiene** |

> El detalle de cada decisión, con los números con que se comprobó, está en `OBSERVACIONES.md`, en las secciones del 11 y el 13 de noviembre de 2026.
