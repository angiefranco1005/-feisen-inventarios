# Cómo se calculan los EEFF

Este documento dice **de dónde sale cada número** de la pantalla Finanzas › EEFF del ERP.
Es la referencia: si un criterio cambia, se cambia aquí y en el código al mismo tiempo.

- Pantalla: **Finanzas › EEFF** (`src/components/finanzas/Eeff.jsx`). Solo la ve ADMIN.
- Empresas: **Feisen** (Construequipos Franco S.A.S.) y **FC**. Cada renglón muestra las dos y el total.
- Última actualización: **24 de noviembre de 2026**. Mes de referencia con el que se calibró: **octubre 2026**.

> **Antes de comparar dos cifras de este documento, ten esto en cuenta: los datos de Odoo se mueven mientras contabilidad trabaja.** Dos números tomados con horas de diferencia pueden **no coincidir sin que ninguno esté mal**. Pasó **tres veces el 18/11/2026**: el **inventario**, las **cuentas de socios** y el **IVA por pagar** (la cuenta 240814 subió $10.000.000 en medio de la sesión y con eso cambió el pasivo del balance). Así que si ves dos cifras que no cuadran, **mira primero la fecha y la hora de cada una** antes de concluir que algo está mal calculado. Esto vale solo de **octubre en adelante**: los meses que salen del Excel ya están cerrados y no se mueven.

---

## 1. De dónde salen los datos

| Fuente | Qué trae | Cómo |
|---|---|---|
| **Odoo Feisen y Odoo FC** | Estado de resultados del mes, por cuenta y centro | Función `finanzas-odoo`, acción `pyg`. **Solo lectura** |
| **Odoo Feisen y Odoo FC** | Facturas de compra del mes, con proveedor, cuenta y centro | Función `finanzas-odoo`, acción `resultado`. **Solo lectura** |
| **Odoo Feisen y Odoo FC** | Saldos de todas las cuentas **a fin del mes escogido**, para el **balance general**. **Las cuentas de bancos (11xx) no se usan**: ni suman ni se muestran. **El inventario (14xx) tampoco**: el grupo 14 sale del ERP, y de Odoo solo se guarda el total para poder decirlo en la nota del grupo. **El patrimonio (las cuentas de clase 3) tampoco**: desde el 18/11/2026 se descartan enteras y el patrimonio es la utilidad del estado de resultados de esta misma pantalla; lo que Odoo tiene registrado se guarda aparte y queda escrito en este documento (desde el 18/11/2026 ya no se muestra en la pantalla). **Las cuentas de socios tampoco suman**: se leen, pero quedan fuera de todos los totales y **desde el 18/11/2026 tampoco se muestran en el balance**; se ven en **Finanzas › Impuestos** | Función `finanzas-balance`. **Solo lectura** |
| **A mano** | El **disponible** del balance: los cinco saldos de banco de cada mes. Es la **única** fuente del disponible | Tabla `eeff_manual`, concepto `banco:…` |
| **ERP (Supabase)** | El **inventario** del balance (grupo 14): el inventario valorizado **cortado al último día del mes que estés mirando**, por bodega y categoría, con cuántos artículos no tienen precio de costo | Función `finanzas_inventario(hasta)`. **Solo lectura** |
| **A mano** | El **valor del inventario al corte del mes**, una casilla por renglón. Lo que se escribe **reemplaza** lo que trae el ERP | Tabla `eeff_manual`, concepto `inv:<renglón>` |
| **ERP (Supabase)** | Salidas de Fundición, para la transferencia interna de Hierro | Tabla `movimientos` |
| **ERP (Supabase)** | Nómina de producción | RRHH › Nómina (`nomina_liquidaciones`) |
| **A mano** | Lo que todavía no está en ningún sistema | Tabla `eeff_manual` |
| **El Excel de Angie (EEFF 2026)** | Los meses **anteriores a octubre de 2026**, enteros | `src/components/finanzas/eeffHistorico.js` |

Las cuentas contables son **las mismas en las dos empresas** desde la homologación del 11/11/2026.

> **Ojo con esto desde el 18/11/2026: el mismo código ya puede llamarse distinto en Feisen y en FC.** Ese día se cambiaron **diecinueve** nombres de cuenta del plan de **Feisen**, en tres pasadas (ver la sección 2.4). Hasta entonces Feisen era el **molde intocable** de la homologación —todo se arreglaba en FC y nunca en Feisen—, y esta es **la primera vez que se escribe en el plan de Feisen**. La **130500**, por ejemplo, ahora se llama **"Clientes nacionales"** en Feisen y sigue llamándose **"Cuentas por Cobrar a Clientes"** en FC. **Para juntar las dos empresas manda el código, no el nombre**, así que ninguna cifra se mueve por esto; pero si algún día se comparan los dos planes nombre contra nombre, hay que saberlo.

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

> **Desde el 19/11/2026 son tres pestañas:** entró **"Indicadores"**, que trae los del **balance** —cortados a fin del mes que escojas— y, debajo, los del **estado de resultados** mes a mes. Sus únicos controles son **"A fin de"** y el selector de mes. Se explica en la **sección 2.5**.

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

**De dónde sale.** De los **saldos acumulados de Odoo de las dos empresas**, Feisen y FC, con **tres excepciones**: el **disponible**, que lo escribe Angie a mano; el **inventario**, que sale del ERP; y el **patrimonio**, que desde el 18/11/2026 sale del **estado de resultados de esta misma pantalla** y no de las cuentas de clase 3 de Odoo. Los saldos los trae la función **`finanzas-balance`** (`supabase/functions/finanzas-balance/index.ts`), una llamada por empresa, **solo lectura**. De cada cuenta se usa **solo el saldo**, y **las cuentas de bancos (11xx) se descartan de entrada**: no entran a ninguna suma y no se muestran en ninguna parte.

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

### Al pie del balance está la "Comprobación", y nada más

Esto cambió varias veces en dos días, y conviene saber de dónde viene:

- **Hasta el 17/11/2026** al pie del balance había una comprobación —**activo + transitorias − pasivo − patrimonio**— que **siempre daba $0**, porque todo salía de Odoo y eso era lo mismo que sumar el saldo de todas las cuentas. Dejó de servir cuando el disponible pasó a escribirse a mano.
- **El 17/11/2026** se reemplazó por una fila llamada **"Plata mal registrada en bancos"**: el disponible escrito **menos** el saldo de las cuentas 11xx de Odoo. Medía cuánto se había equivocado la contabilidad registrando los bancos.
- **El 18/11/2026 esa fila desapareció.** Al sacar las 11xx del balance se fue el dato con el que se restaba: **sin lo que dice Odoo no hay resta que hacer**.
- **Ese mismo día, al final, entró la sección "Comprobación"**, que es lo que hay hoy: la ecuación del balance y la diferencia, sin nada más. Palabras tuyas: *"solo deja la información de la ecuación de pasivo+patrimonio=activo y si hay diferencia mencionar de cuánto es la diferencia, el resto no lo tengas en cuenta"*.

**Qué tiene la sección Comprobación**, y no tiene nada más que esto: **tres renglones** —**Pasivo + patrimonio**, **Activo** y **Diferencia**— y **una frase corta** que dice de cuánto es la diferencia. **No explica la diferencia ni la reparte entre causas**: eso es justo lo que pediste quitar. Las cifras al **31/10/2026** están en el apartado "Cómo queda la ecuación del balance", más abajo.

**Si falta información del mes, la sección no muestra la diferencia.** Mientras no estén escritos los bancos del disponible, o mientras el resultado del ejercicio se esté calculando, en vez de los dos primeros renglones y la cifra sale una frase que dice que **faltan datos y que todavía no tiene sentido comparar**.

**Si algún día se quiere la comparación contra los bancos de Odoo, hay que hacerla contra Odoo directamente, fuera de esta pantalla.** El balance ya no la calcula ni la muestra.

**Lo que sí se sigue usando por dentro:** que la **suma de todas las cuentas de Odoo dé cero**. Esa suma **sí sigue contando las cuentas 11xx** —si no las contara no daría cero— y es la que respalda que **cada contabilidad cuadra consigo misma**. **Eso ya no se ve en la pantalla** (desapareció con el recuadro de arriba el 18/11/2026): sigue siendo cierto y queda escrito aquí.

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

### El patrimonio no sale de Odoo: es la utilidad de tu estado de resultados

Desde el **18/11/2026** el patrimonio del balance **ya no se lee de las cuentas de clase 3 de Odoo**. Palabras de Angie: *"el capital social sé que es más, mis papás han reinvertido pero eso nunca quedó registrado contablemente; lo de las reservas nunca hemos tenido reservas reales; solo deberíamos contar el resultado del ejercicio, del PYG del erp"*.

Las cuentas de clase 3 **se descartan enteras** y el patrimonio queda en **un solo renglón**: la **utilidad de nuestro propio estado de resultados**, la de la otra pestaña de esta misma pantalla, **acumulada de enero hasta el mes del balance**. Para octubre de 2026 son **diez meses** y dan **$608.645.364**. Antes de este cambio el patrimonio daba **$3.008.568.525**.

**Por qué es mejor así**, en corto:

- **El capital registrado está incompleto.** Los **$100.000.000** de la cuenta 310500 no son el capital real: hubo **reinversión de los papás de Angie que nunca se registró contablemente**, así que esa cifra dice menos de lo que de verdad se puso en el negocio.
- **Las reservas nunca existieron.** Los **$50.000.000** de la 330500 no corresponden a reservas de verdad.
- **Arregla de paso el problema de FC.** Su "resultado del periodo" en Odoo eran **varios años acumulados**, porque allá **nunca se hicieron los cierres**. Nuestro P&G es de **2026** y nada más. Por eso también **desapareció el aviso que decía que FC no tiene patrimonio registrado**: en su lugar hay otro que explica que el patrimonio sale del P&G.

**El patrimonio no se reparte entre Feisen y FC.** Nuestro P&G es **consolidado**, así que en ese renglón **las columnas de las dos empresas van con "—" y la única cifra está en el total**, igual que pasa con el disponible y con el inventario. No es un dato que falte: es que ese renglón no está dividido por empresa.

**Lo que Odoo tiene registrado no desaparece, pero ya no se ve en el balance.** Se guarda aparte y **queda escrito aquí**: capital **$100.000.000**, reservas **$50.000.000** y los **resultados de años anteriores**. El cálculo también sigue trayendo el **resultado que Odoo calcula por su cuenta** (sus cuentas de las clases 4 a 7), **solo para comparar**, que no entra en ninguna suma. Hasta el 18/11/2026 esto lo decía un recuadro arriba del balance; **ese recuadro se quitó** y hoy **la pantalla no lo dice en ninguna parte**.

**Un detalle que vale la pena saber: esto no hace lenta la pantalla.** Los meses anteriores a octubre salen del **Excel** (la regla de la sección 1.1) y **no le piden nada a la red**, así que un balance de octubre cuesta **las consultas de un solo mes** a Odoo y al ERP, no las de doce.

#### Cómo queda la ecuación del balance

Esto es lo que muestra la sección **Comprobación**, al final del balance. Al **31/10/2026**, con lo que Angie lleva escrito:

| Comprobación | Valor |
|---|---|
| Pasivo + patrimonio | $2.318.299.242 |
| Activo | $1.986.603.598 |
| **Diferencia** | **$331.695.644** |

Debajo de los tres renglones la pantalla dice, en una frase, que **el balance todavía no cuadra y de cuánto es la diferencia**. Cuando la diferencia sea cero dirá que cuadra. **Nada más: la pantalla no explica la diferencia ni la reparte entre causas**, porque así lo pediste.

El **pasivo** de esa suma son **$1.709.653.878** y el **patrimonio**, $608.645.364. (Si alguna vez ves escrito un pasivo de $1.699.653.878, es de más temprano ese mismo día: contabilidad registró $10.000.000 más de IVA por pagar en la cuenta 240814 mientras trabajábamos. Ver el aviso sobre los datos de Odoo, más abajo.)

**Antes del cambio del patrimonio esa diferencia era de unos $2.700 millones**, así que el balance quedó muchísimo más cerca de cuadrar. **Lo que todavía la explica** —esto queda escrito aquí, **no en la pantalla**— son cosas ya conocidas y que están fuera de los totales **a propósito**: las **cuentas de socios** ($634.597.564), las **partidas por aclarar** de clase 9 y el **banco sin conciliar de FC**.

### Dos cosas que hay que decir sin suavizar, y que ya no se ven en la pantalla

Angie decidió ver las dos empresas juntas **sabiendo estas dos cosas**. Hasta el 18/11/2026 iban en un recuadro ámbar arriba del balance; **ese recuadro se quitó** y **la pantalla ya no dice nada de esto**. Siguen siendo ciertas, y por eso quedan escritas aquí:

1. **FC tiene $575.445.392 en "Partidas por aclarar":** plata ya contabilizada que todavía no tiene cuenta definitiva (las cuentas de **clase 9** de Odoo). No es ni activo ni pasivo y **no suma a ningún total**. Hasta el 18/11/2026 se veía en un bloque propio al final del balance; **ese bloque se quitó el mismo día** y hoy **esas cuentas no se ven en ninguna parte del balance**: entran dentro de la diferencia de la Comprobación y nada más. Las **cuentas de socios** también están fuera de todos los totales y tampoco se muestran aquí: se ven en Finanzas › Impuestos (ver más abajo).
2. **El patrimonio no sale de Odoo:** el capital registrado ($100.000.000) está incompleto, las reservas ($50.000.000) nunca existieron de verdad y los resultados de años anteriores tampoco entran. El patrimonio es la **utilidad de tu estado de resultados** (ver el apartado de arriba). **Esto reemplaza lo que decía aquí antes** —que FC no tiene patrimonio registrado y que su "resultado del periodo" (unos $2.046 millones) era de varios años—: ese problema sigue existiendo en la contabilidad de FC, pero **ya no toca el balance**, porque el patrimonio no se lee de ahí. Qué queda fuera **ya no lo dice la pantalla**; está escrito aquí.

**La conclusión:** **las dos contabilidades cuadran consigo mismas; el problema no es un descuadre sino dónde está ubicada la plata.** Eso también salía en el recuadro de arriba y hoy **solo está en este documento**.

### Las cuentas de socios: fuera de todos los totales, y ahora se ven en Impuestos

Desde el **18/11/2026** las **cuentas de socios** no cuentan para el balance. Palabras de Angie: *"AFC AVF son las cuentas de socios, eso no lo debemos tener en cuenta para el balance"*.

- Salen del **activo**, del **pasivo**, del **patrimonio** y de **cualquier indicador** que se calcule con esos totales (el endeudamiento, por ejemplo). Es plata que se movió entre el negocio y los socios, no cartera ni deuda con un tercero. **Eso no ha cambiado.**
- **Lo que cambió el mismo 18/11, después:** tampoco **se muestran** en el balance. Estuvieron un rato en un bloque propio al final y luego como un renglón informativo dentro del grupo 24 del pasivo, hasta que Angie pidió *"quita lo de cuentas de socios en el balance, por favor, y déjala en el módulo de impuestos aparte"*. **En el balance ya no hay ningún renglón de socios.**
- **Dónde están ahora:** en **Finanzas › Impuestos**, en un bloque al final de esa pantalla, con el saldo de cada cuenta y su **reparto por tercero**. Está **fuera de todo cálculo de esa pantalla**: no suma a la renta, ni a los anticipos, ni a los impuestos por pagar. Palabras de Angie: *"según la DIAN esa plata todavía se debe, pero me gusta tenerlo presente"*.

Cuáles son, con los saldos verificados **al 31 de octubre de 2026** (los que el balance deja fuera):

| Empresa | Cuenta | Saldo |
|---|---|---|
| Feisen | 133002 Otras Cuentas Por Cobrar AVF | $582.808.358 |
| Feisen | 133003 Otras Cuentas Por Cobrar AFC | $51.814.206 |
| FC | 233506 Cuentas por pagar a socios Angie | −$25.000 |
| **Total que queda fuera del balance** | | **$634.597.564** |

**Se escogen por empresa, no por código, y eso es a propósito.** El mismo código significa cosas distintas en los dos libros: la **233506 de FC** es "Cuentas por pagar a socios Angie", pero la **233506 de Feisen** es "Otras Cuentas Por Pagar", que sí es deuda con terceros y **se queda en el pasivo**. Clasificar por código habría sacado la cuenta equivocada.

**Lo que se ve en pantalla, con octubre:** los **deudores** pasaron de **$1.096.907.111** a **$462.284.547** (Feisen $407.426.943 + FC $54.857.604). Con eso el **total activo** queda en **$2.001.236.418** y el **total pasivo**, en **$1.699.653.878**.

> **Ojo con las cifras de Impuestos: no son las mismas de arriba, y está bien que no lo sean.** En Impuestos el saldo es **a hoy y de toda la historia**, no al corte del mes, así que **no coincide** con lo que el balance deja fuera a fin de octubre. La propia pantalla lo advierte al pie.

#### Quiénes son AVF y AFC: dos personas, y eso corrige algo que estaba escrito

Al mostrar el **reparto por tercero** quedó claro de quién es cada cuenta (saldos **a hoy**, de toda la historia):

| Cuenta | Tercero | Saldo a hoy | Movimientos |
|---|---|---|---|
| 133002 Otras Cuentas Por Cobrar AVF | ANGIE VIVIANA FRANCO CADENA | $598.783.358 | 557 |
| 133003 Otras Cuentas Por Cobrar AFC | ALFONSO FRANCO CASTAÑEDA | $67.120.706 | 137 |

**Esto corrige una suposición mía que era falsa:** yo había dado por hecho que "AFC" quería decir *"a FC"*, o sea que esa cuenta era el **puente entre la contabilidad de Feisen y la de FC**. **No lo es.** Son las **iniciales de dos personas**, y las dos cuentas son de socios, sin nada que ver con la otra empresa.

**Y conecta con lo del patrimonio:** son las mismas personas que, como contó Angie, **reinvirtieron en el negocio sin que quedara registrado contablemente** (por eso el capital social de Odoo, $100.000.000, está incompleto). Plata que entró y salió entre los socios y la empresa, movida por estas cuentas en vez de por el patrimonio.

> **Esto hay que decirlo sin suavizar: sacarlas del balance es una decisión de cómo quieres leer el balance para gerenciar, no un cambio en la contabilidad.** En los libros siguen registradas, y para efectos fiscales siguen siendo cuentas con los socios, con su propio tratamiento. **Eso lo tiene que mirar tu contador.** La pantalla de Impuestos lo dice en el bloque; queda escrito aquí también.

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

#### Esa cartera va en el balance como **no corriente**: lo decidió Angie el 20/11/2026

La **1390 "Deudas de difícil cobro"** y la **1399 "Provisiones de cartera"** se muestran en el balance del lado **no corriente**, o sea **fuera de lo que se espera cobrar en los próximos doce meses**. La razón es simple: es cartera que **viene de antes de Odoo y lleva años sin cobrarse**, así que contarla como plata disponible a doce meses sería engañarse.

Palabras de Angie: *"las deudas de difícil cobro es mejor dejarlas como no corrientes"*.

**Qué cambió el 20/11/2026 y qué no.** Las cifras **no se movieron**: el balance ya las venía mostrando así. Lo que cambia es **de quién es el criterio**: hasta el 19/11 era una **propuesta mía pendiente de confirmar**, y desde el 20/11 es una **decisión tomada por Angie**. Con eso el punto queda cerrado y la pantalla ya no pide confirmarlo.

**Cuánto mueve el indicador: muy poco.** Entre las dos cuentas quedan unos **$400.000** —la deuda está castigada casi al 100 %, como dice el punto anterior—, así que estén de un lado o del otro, la razón corriente y el capital de trabajo **casi no se enteran**.

> **Ojo, que son dos decisiones distintas y no hay que confundirlas:** los **anticipos de impuestos (1355, $192.719.153)** van como **corrientes**, y eso lo decidió Angie el **19 de noviembre de 2026**; esa sí movió las cifras de liquidez. Lo del **difícil cobro (1390 y 1399)**, que es lo de aquí, es del **20 de noviembre** y **no movió ninguna cifra**.

#### 130501 "Consignaciones sin identificar" (−$70.593.236): se deja como está por ahora

Son **consignaciones de remisiones que no se han logrado identificar**: entró la plata y no se sabe a qué venta corresponde. Angie ya le **pidió un informe de esa cuenta a la contadora**, así que **no se toca ni se reclasifica hasta que llegue ese informe**.

### Las obligaciones financieras de Feisen: hay tres leasing, no dos

El **18/11/2026** Angie mandó un pantallazo con los nombres que deben tener las obligaciones financieras y, de paso, preguntó **cuántos leasing tenía**. La respuesta es **tres**, y uno estaba escondido detrás de un nombre de fábrica.

| Leasing | Máquina | Saldo al 31/10/2026 |
|---|---|---|
| 566 | Dobladora | $116.149.760 |
| 962 | Torno | $85.256.752 |
| 833 | Cizalla | $115.138.828 |
| **Total** | | **$316.545.340** |

Dos de ellos ya lo decían en el nombre (el torno 962 y la cizalla 833). El tercero, la cuenta **211500**, se llamaba **"Financial corporations"** —el nombre que trae Odoo de fábrica— y parecía una obligación cualquiera. **Es el leasing de la dobladora**, y lo confirma todo lo que tiene adentro: está en el grupo de corporaciones financieras, es todo con Bancolombia, abrió con un **saldo inicial de $123.000.000 en marzo de 2026** y desde entonces abona **$856.280 puntuales todos los meses**.

**FC no tiene ningún leasing**: los tres son de Feisen.

#### Ojo con el leasing de la cizalla: dos movimientos por exactamente el mismo valor

Esto hay que revisarlo. La cuenta del leasing de la cizalla (**211503**) tiene **dos movimientos por el mismo valor al peso, $58.861.575**:

| Fecha | Documento | Tercero | Valor |
|---|---|---|---|
| 31/03/2026 | Saldo inicial | Bancolombia | $58.861.575 |
| 21/08/2026 | COMPRA CIZALLA | INOMAQ | $58.861.575 |

Que dos movimientos coincidan **al peso**, con **distinta fecha** y **distinto tercero**, no suele ser casualidad: **puede ser la misma operación registrada dos veces**, una al migrar los saldos iniciales y otra al contabilizar la compra. Si fuera así, **esa deuda estaría inflada en $58,8 millones**.

**No se tocó nada.** Lo que hay que hacer es mirar el **contrato del leasing** y el **soporte de la compra** con la contadora. Si resulta duplicado, **el pasivo baja $58,8 millones** y el endeudamiento mejora de verdad: no por un cambio de criterio, sino porque esa deuda no existía.

### Cuánto de la deuda financiera vence en doce meses (19/11/2026)

El grupo **21 Obligaciones financieras** es el único del balance que se parte a mano entre **corriente** (lo que hay que pagar dentro de los próximos doce meses) y **no corriente** (lo que vence después). Odoo no trae esa división, y el número de cuenta no la dice, así que la cifra se escribe en una casilla: **`corriente:deuda_financiera`** en la tabla `eeff_manual`, con el mes del balance y `empresa = 'total'`.

**Para octubre de 2026 ya está escrita, y se escribió dos veces.** El **19/11/2026** quedó en **$155.919.009**, calculada **obligación por obligación** —no con un porcentaje ni a ojo— con los extractos y las cuentas de cobro que Angie entregó ese día. El **20/11/2026 se corrigió a $202.905.009**, cuando aparecieron las dos cuentas del grupo 21 que no estaban en esos papeles. **La cifra vigente es $202.905.009**; lo de abajo explica cómo se llegó a la primera y, más adelante, por qué se quedó corta.

#### El método no es el mismo para los créditos que para los leasing

Son dos tipos de papel distintos y cada uno dice cosas distintas, así que hay dos formas de llegar al mismo dato:

- **Créditos bancarios.** El extracto de Bancolombia **separa el abono a capital del interés**, así que la cuenta es directa: la parte corriente es el **abono a capital del mes × 12**, **topado al saldo**. Si al crédito le quedan menos de doce cuotas, **todo es corriente**. **Los intereses no entran**: todavía no se han causado, no se deben hoy.
- **Leasing.** Las cuentas de cobro de Leasing Bancolombia **no traen el saldo a capital**, solo lo que se paga ese mes, así que el saldo **hay que despejarlo**: se divide el **interés del mes** entre la **tasa mensual equivalente** (la tasa efectiva anual del documento elevada a 1/12). Con ese saldo y el **canon fijo** (capital + interés, **sin seguros**) se amortizan **doce meses hacia adelante**; **lo que baje el saldo en esos doce meses es la parte corriente**.

#### El detalle, obligación por obligación (corte octubre 2026)

**Créditos**

| Obligación | Línea | Saldo | Abono mensual | Cuotas | Corriente | No corriente |
|---|---|---|---|---|---|---|
| 1000112247 | Ordinaria IBR | $11.666.670 | $1.666.666 | 7 | $11.666.670 | — |
| 1000111602 | Cesantías IBR | $15.863.336 | $3.965.833 | 4 | $15.863.336 | — |
| 1000111089 | Ordinaria IBR | $83.333.337 | $3.333.333 | 25 | $39.999.996 | $43.333.341 |
| 1000110545 | Ordinaria IBR | $59.183.478 | $2.573.194 | 23 | $30.878.328 | $28.305.150 |
| Credipago 10081012737 | — | $8.333.336 | vence 27/11/2026 | — | $8.333.336 | — |
| Credipago 10081013292 | — | $3.333.334 | vence 27/11/2026 | — | $3.333.334 | — |
| **Subtotal créditos** | | **$181.713.491** | | | **$110.075.000** | **$71.638.491** |

Los dos primeros y los dos Credipago quedan **enteros en corriente** porque les faltan menos de doce meses. Los dos últimos sí se parten.

**Leasing (maquinaria y equipo)**

| Operación | Canon | Tasa | Saldo | Corriente | No corriente |
|---|---|---|---|---|---|
| 2-10-379566 | 8 | 20,17 % EA | $116.155.392 | $11.366.491 | $104.788.901 |
| 2-10-382883 | 2 | 22,52 % EA | $115.120.283 | $17.338.746 | $97.781.537 |
| 2-10-369662 | 15 | 18,70 % EA | $85.070.244 | $17.138.772 | $67.931.472 |
| **Subtotal leasing** | | | **$316.345.919** | **$45.844.009** | **$270.501.911** |

**Total de las nueve obligaciones: saldo $498.059.410 · corriente $155.919.009 · no corriente $342.140.402.**

#### Una comprobación que vale la pena dejar escrita

Los **libros** traen los tres leasing en **$316.545.340** y el saldo **despejado desde los intereses de los extractos** dio **$316.345.919**: se diferencian en **$199.421**, un **0,06 %**. Son **dos caminos independientes** —la contabilidad por un lado, el documento del banco por el otro— que llegan prácticamente al mismo número, así que **el método de despejar el saldo desde el interés es confiable** y lo que se calculó con él se puede usar sin desconfianza.

#### Una advertencia que hay que leer antes de usar esta cifra

- **Del cupo CrediExpress de Davivienda 6700456801301403, al balance solo entra lo usado.** El **cupo aprobado son $50.000.000** y un cupo disponible **no es deuda**: no se registra como pasivo ni corriente ni no corriente, así que nadie debe sumarlo al verlo en los papeles del banco. **Ojo: el 19/11 se dio por intacto** —el extracto de agosto lo mostraba en cero—, y el **20/11/2026 Angie confirmó que hay $13.650.000 usados**, los de la cuenta **210511**, que sí entran. Ver más abajo.

#### Los $88.391.205 que faltaban ya casi todos tienen nombre (20/11/2026)

Al escribir la casilla quedó una diferencia sin explicar: el grupo 21 del balance de octubre trae **$586.450.615** y los nueve documentos que entregó Angie el 19/11/2026 solo explicaban **$498.059.410**. Esos **$88.391.205** quedaron del lado **no corriente por descarte**, sin que nadie lo confirmara.

El **20/11/2026** se cerró casi todo, y **sin entrar a Odoo**: se cruzó el total del grupo 21 contra los **saldos por cuenta al 31/10/2026** que ya estaban guardados en estos documentos, de cuando se renombraron las nueve obligaciones el 18/11.

**Lo primero: el faltante no está en los leasing.** Los tres leasing en libros dan **$316.545.340** (211500 dobladora $116.149.760 + 211502 torno $85.256.752 + 211503 cizalla $115.138.828) y el despeje desde los intereses había dado **$316.345.919**. Cuadran. Así que **todo el faltante está del lado de los créditos**.

Sacando los leasing, en libros quedan **$269.905.275** de créditos y los seis créditos documentados explican **$181.713.491**: faltan **$88.191.784**, que son los mismos $88.391.205 menos los $199.421 de diferencia de redondeo de los leasing.

| Qué es | Cuenta | Saldo al 31/10 |
|---|---|---|
| Préstamo con tabla de amortización (ver abajo) | 219500 Otras Obligaciones Particulares | $69.498.000 |
| Cupo rotativo CrediExpress (ver abajo) | 210511 Crédito Davivienda No. 1403 Oct 2026 | $13.650.000 |
| **Ya tiene nombre** | | **$83.148.000** |
| Sin nombre todavía | | $5.043.784 |
| **Faltante** | | **$88.191.784** |

Dos cuentas explican el **94 %** de lo que faltaba.

##### El préstamo de la 219500: $100.000.000 al 2 % mensual

Angie mandó el PDF **"Tabla de amortizacion prestamo Construequipos junio 17 de 2025.pdf"** (está en su Escritorio, no en el repositorio). Es un préstamo **a** Construequipos Franco S.A.S., titulado *"PRESTAMO CORRIENTE CUOTA SOBRE SALDO"*.

| | |
|---|---|
| Valor | **$100.000.000**, desembolsado el **17/06/2025** |
| Tasa | **2,00 % mensual** (equivale a **26,8 % efectivo anual**) |
| Cuotas | **36**. Los primeros seis meses (junio a noviembre de 2025) **solo interés**, $2.000.000 al mes y **sin abonar capital**. Desde el **17/12/2025** abona **$2.778.000 de capital** cada mes |
| Saldo al 17/10/2026 | **$69.442.000** |
| Última cuota | **17/11/2028** |

El libro dice **$69.498.000** y la tabla **$69.442.000**: **$56.000** de diferencia, redondeo de la tabla. **Es la misma obligación, sin duda.**

**Esa plata es cara.** 2 % mensual son **26,8 % EA**, por encima de todos los créditos bancarios de Feisen, que van entre **18,70 % y 22,52 % EA**.

**Quién prestó la plata no lo dice el documento.** El nombre de la cuenta ("Otras Obligaciones Particulares") hace pensar en un particular y no en un banco, pero **eso hay que confirmarlo**: aquí queda como pregunta, no como dato.

**La parte corriente de ese préstamo son $33.336.000.** Son las **doce cuotas que van del 17/11/2026 al 17/10/2027**, a $2.778.000 de capital cada una. Se comprueba contra la propia tabla: saldo al 17/10/2026 **$69.442.000** menos saldo al 17/10/2027 **$36.106.000** = **$33.336.000**. Sobre el saldo del libro ($69.498.000) queda **corriente $33.336.000 · no corriente $36.162.000**.

##### La Davivienda son $13.650.000 y nada más, y van enteros en corriente

Ese pendiente **quedó cerrado el 20/11/2026**: Angie confirmó que **la deuda con Davivienda son solo los $13.650.000 de la cuenta 210511**, y que no hay más. **Ya no hace falta el extracto de octubre.**

Todo ese saldo se clasificó **corriente**, y el razonamiento hay que leerlo como **supuesto, no como dato**: el 1403 es el **cupo rotativo CrediExpress** ($50.000.000 aprobados), y un cupo rotativo **no tiene tabla de amortización a varios años** —se usa y se repone—, así que **lo usado se asume exigible dentro del año**. **Si algún día resulta que fue a plazo fijo con cuotas, hay que partirlo.**

##### El desglose definitivo del grupo 21 al 31/10/2026

| Concepto | Saldo | Corriente |
|---|---|---|
| Créditos Bancolombia 1000112247 / 1000111602 / 1000111089 / 1000110545 y Credipago Davivienda 10081012737 / 10081013292 | $181.713.491 | $110.075.000 |
| Los tres leasing Bancolombia 2-10-379566 / 382883 / 369662 (saldo en libros) | $316.545.340 | $45.844.009 |
| Cuenta 219500, préstamo particular | $69.498.000 | $33.336.000 |
| Cuenta 210511, CrediExpress Davivienda 1403 | $13.650.000 | $13.650.000 |
| Sin identificar | $5.043.784 | — |
| **Total grupo 21** | **$586.450.615** | **$202.905.009** |

##### La casilla YA se corrigió

**`corriente:deuda_financiera` de octubre pasó de $155.919.009 a $202.905.009 el 20/11/2026**, con el visto bueno expreso de Angie (*"Sí, escríbela"*). Se hizo con un **UPDATE por SQL** sobre `eeff_manual` (mes `2026-10`, concepto `corriente:deuda_financiera`, `empresa = 'total'`), cambiando `valor`, `nota` y `updated_at`; la nota de la fila quedó con el desglose completo de las cuatro partes y con lo que falta.

**Esto ya no es cierto y queda corregido:** aquí decía que la casilla seguía en $155.919.009 y que la cifra correcta era $189.255.009. Los $189.255.009 eran $155.919.009 + los $33.336.000 de la 219500, **sin contar todavía los $13.650.000 de Davivienda**. Con ellos adentro, la cifra es **$202.905.009**.

**Lo que esto le hace al balance de octubre, sin suavizarlo:** el **pasivo corriente sube $46.986.000** frente a lo que el balance venía mostrando, **casi un 30 % más de deuda financiera corriente**. **La razón corriente, la prueba ácida y el capital de trabajo de octubre empeoran**, y los indicadores de balance que se ven en la app van a cambiar. **No es que el negocio esté peor que ayer**: es que la cifra que se mostraba estaba incompleta. **Quien haya mirado esos indicadores antes del 20/11/2026 los vio mejores de lo que eran** — la misma clase de problema que el defecto de `useBalanceMeses` del 19/11, explicado en la sección 2.5, solo que allá la casilla no llegaba al cálculo y aquí la casilla misma estaba corta.

**Sin verificar en la pantalla.** El cambio se escribió **directo en la base de datos** y **no se abrió el balance** para comprobar que la pantalla lo tomó, porque la sesión del navegador está cerrada. Queda pendiente mirarlo (ver la sección 10).

##### Lo que todavía falta, y es poco

- **$5.043.784 sin identificar**, el **0,86 % del grupo 21**. Siguen contados como **no corrientes por defecto**. Ahí dentro está casi con seguridad el enredo de la **210510**, que está en menos $6.666.666 (lo de abajo).
- **Quién prestó los $100.000.000 de la 219500.** Sigue sin saberse.

#### La 210510 está en negativo, y eso no es parte del faltante

Salió el mismo **20/11/2026** y conviene no mezclarlo con lo anterior. La cuenta **210510 "Crédito Bancolombia No. 3292 Sept 2026"** está en **menos $6.666.666** al 31/10. **Un pasivo en negativo no existe**: o se pagó de más, o se registró al revés.

Y hay algo más: ese **"3292"** se parece al **Credipago de Davivienda 10081013292**, que debe **$3.333.334**. Puede ser **la misma deuda registrada en dos lados y mal**.

**No se tocó nada.** Es pregunta para la contadora.

#### La casilla es por mes, y solo hace falta de octubre en adelante

Lo calculado aquí **vale para octubre de 2026 y nada más**: cada mes tiene su propia casilla, porque la deuda se abona y las cuotas que faltan cambian. **De enero a septiembre no se usa**: esos meses salen del **Excel de Angie**, que ya trae la deuda financiera partida entre corto y largo plazo.

### Las cuentas por pagar, los impuestos y las obligaciones laborales (23, 24 y 25) se leen solo de Feisen

Decisión de Angie del **18/11/2026**: *"en las cuentas por pagar 23, usa las cuentas de odoo feisen solamente. lo mismo que la 24 y la 25"*.

**Hoy no cambia ninguna cifra**, y vale la pena saber por qué: **FC no tiene ninguna cuenta de las clases 23, 24 ni 25**. La única suya que empieza por 23 es la **233506** de socios, que ya estaba fuera de todos los totales por lo que se explicó más arriba.

Los saldos de esos tres grupos **al 31 de octubre de 2026**, todos de Feisen:

| Grupo | Saldo |
|---|---|
| 23 Cuentas por pagar | $58.947.554 |
| 24 Impuestos, gravámenes y tasas | $267.749.816 |
| 25 Obligaciones laborales | $85.769.597 |

**La regla queda puesta, y hecha de modo que no pueda esconder nada.** Si algún día FC llega a tener algo en esas clases, **el grupo lo avisa en ámbar, con los códigos y el monto**, en vez de dejarlo caer en silencio. Es el mismo criterio del "Sin clasificar" del inventario: lo que se saca de un total se muestra. Hoy el grupo dice *"solo Feisen · FC no tiene nada en estas cuentas"*.

#### Dentro de esos impuestos hay $113.655.000 de ICA de Soacha sin pagar, de 2017, 2018 y 2019

Esto apareció el **18/11/2026 de rebote**: la cuenta **241200** se iba a renombrar y, antes de ponerle nombre, se abrió con `finanzas-cuenta` para ver qué tenía adentro. Lo que tiene no son impuestos del año en curso.

Son **seis apuntes**, todos con tercero **"MUNICIPIO DE SOACHA"** y concepto **"ICA por pagar Soacha 2017 / 2018 / 2019"**, y **todos entraron con los saldos iniciales de marzo de 2026**, o sea que **vienen de antes de Odoo**. Entre los tres años suman **$113.655.000**, que son el **42 % de los $267.749.816** del grupo 24.

Dicho sin rodeos: es una **deuda vieja con una entidad pública**, de hasta nueve años atrás, que sigue registrada como por pagar. **No se tocó nada.** Lo que hay que averiguar con la contadora son dos cosas: **si eso está dentro de algún acuerdo de pago con el municipio**, o **si sigue corriendo por su cuenta** —porque en impuestos municipales los intereses y las sanciones siguen creciendo—.

### El aviso del banco de FC se quitó del balance, pero el problema sigue ahí

Hasta el 17/11/2026 arriba del balance había un tercer aviso: **"El banco de FC dice $1.567.157.555 y no es plata real"**, con su porcentaje sobre los activos de FC (el **97 %**). **Se quitó el 18/11/2026**, y por una razón sencilla: esa cifra salía de las cuentas 11xx de Odoo, y esas cuentas ya no se leen. No se puede avisar de un número que el balance ya no tiene.

**Esto hay que decirlo sin suavizarlo: el hecho de fondo no desapareció, solo dejó de verse en el balance.** FC sigue teniendo esa plata sin conciliar en su contabilidad, sigue estando **excluida de la pantalla de Flujo de caja** y sigue siendo **trabajo pendiente para contabilidad**. Lo único que cambió es que **el balance ya no es el sitio donde se ve**.

**Y más tarde ese mismo 18/11/2026 se quitó el recuadro entero.** El bloque ámbar de **"Antes de leer estas cifras"**, que iba arriba del balance, **ya no existe**: con él se fueron los otros tres avisos que todavía llevaba —las **partidas por aclarar de FC**, que el **patrimonio sale del estado de resultados y no de Odoo** (con lo que queda fuera: capital, reservas y resultados de años anteriores) y que **cada contabilidad cuadra consigo misma**—. Lo pediste así junto con lo de la Comprobación. **Las tres cosas siguen siendo ciertas y están escritas en este documento**; lo único que cambió es que **el balance ya no las dice**. Hoy, arriba del balance, solo está el título con el mes y el total del activo.

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
- **La división entre corriente y no corriente no sale de Odoo.** Odoo no la trae y deducirla por el número de cuenta **sería adivinar**, así que se decidió **cuenta por cuenta**. La regla general va **por grupo del PUC**, y hay **excepciones por cuenta que mandan sobre su grupo**; las dos que hay hoy **ya están decididas por Angie**: los **anticipos de impuestos (1355)** son **corrientes** (19/11/2026) y las **deudas de difícil cobro y sus provisiones (1390 y 1399)**, **no corrientes** (20/11/2026). El caso que no se puede resolver así es el de las **obligaciones financieras (grupo 21)**, que se parten con una **casilla que se escribe a mano**, mes por mes: ver "Cuánto de la deuda financiera vence en doce meses" más arriba.

Y sigue siendo un **balance unificado Feisen + FC**: las dos empresas en el mismo informe, cada renglón con su columna y el total.

### La hoja de BALANCE del Excel de Angie no cuadra

Queda anotado: en esa hoja la fila **"VERIFICACIÓN (debe ser 0)"** da entre **−$136.620.337** (marzo) y **$282.265.443** (septiembre).

Son dos causas:
- El **patrimonio** solo lleva el capital y la utilidad del mes, **sin utilidades acumuladas**.
- La **propiedad, planta y equipo** es un **avalúo**, no el valor en libros.

Por eso el balance del ERP **no se arma copiando esa hoja**, sino desde Odoo.

## 2.4 Diecinueve cuentas de Feisen cambiaron de nombre (18/11/2026)

El plan de cuentas de Feisen traía **nombres en inglés** de cuando se instaló Odoo, y además los **"(copia)"** que había dejado la duplicación de cuentas. Se arreglaron en **tres pasadas el mismo día**.

#### Primera pasada: cinco nombres del inglés al español

Angie pidió arreglarlos: *"Cambia eso de 'customers' por clientes nacionales... la 135501, ponle el nombre en español. la 135517 también en español, la 18 también, la 20 también"*.

| Código | Antes | Ahora |
|---|---|---|
| 130500 | Customers | Clientes nacionales |
| 135501 | Advance payment of taxes and contributions or balances in favor | Anticipo de impuestos y contribuciones o saldos a favor |
| 135517 | Sales Tax Withheld | Impuesto a las ventas retenido |
| 135518 | Industry and commerce tax withheld | Impuesto de industria y comercio retenido |
| 135520 | Withheld at source | Retención en la fuente |

#### Segunda pasada: las nueve obligaciones financieras

Angie mandó un pantallazo con los nombres buenos: *"Mira las obligaciones financieras como deben salir"*. Eran cinco créditos que seguían en inglés o con "(copia)" pegado al nombre, y las tres cuentas de leasing.

| Código | Antes | Ahora | Saldo al 31/10 |
|---|---|---|---|
| 210500 | National banks | Crédito Bancolombia No. 1000104793 May 2023 | $0 |
| 210502 | Crédito Bancolombia No. 1000104293 Feb 2025 | Crédito Bancolombia No. 1000109243 Feb 2025 | $0 |
| 210508 | …Feb 2026 (copia) | Crédito Bancolombia No. 1000112247 May 2026 | $11.666.670 |
| 210510 | …(copia) (copia) (copia) | Crédito Bancolombia No. 3292 Sept 2026 | −$6.666.666 |
| 210511 | …(copia) ×4 | Crédito Davivienda No. 1403 Oct 2026 | $13.650.000 |
| 211500 | Financial corporations | Contratos De Arrendamiento Financiero (Leasing Dobladora) 566 | $116.149.760 |
| 211502 | …(Leasing) 962 | Contratos De Arrendamiento Financiero (Leasing Torno) 962 | $85.256.752 |
| 211503 | …(Leasing) 833 | Contratos De Arrendamiento Financiero (Leasing Cizalla) 833 | $115.138.828 |
| 219500 | Others | Otras Obligaciones Particulares | $69.498.000 |

**Lo que reveló ese pantallazo vale más que los nombres:** que la 211500 fuera el **leasing de la dobladora** es lo que permitió saber que **hay tres leasing y no dos**. Eso está explicado arriba, en el punto 2.3.

#### Tercera pasada: lo que todavía se veía en inglés en el balance

Angie lo pidió así: *"todo lo que esté en inglés en el balance pásalo a español como se debe"*. Se buscaron las cuentas con nombre en inglés **que de verdad se alcanzan a ver en el balance** —o sea, las que tienen saldo y están en las clases que la pantalla muestra— y quedaron cinco:

| Código | Antes | Ahora | Saldo al 31/10 |
|---|---|---|---|
| 220500 | National | Proveedores nacionales | $553.126.138 |
| 241200 | On industry and commerce | Impuesto de industria y comercio | $113.655.000 |
| 236800 | Industry and commerce tax withheld | Impuesto de industria y comercio retenido | $37.300 |
| 135505 | VAT Receivable | Saldo a favor de IVA | $6.000 |
| 139901 | Provision de Cartera NIIF | Provisión de cartera NIIF | $53.917.269 |

La última no estaba en inglés: lo que le faltaba era la tilde.

**Antes de ponerles nombre se abrieron una por una con `finanzas-cuenta`, para no traducir a ciegas**, y menos mal: la **220500** tiene **2.077 apuntes con proveedores** (GYJ Ferreterías, Ferreoxi, Aceros Mapa), así que lo que hay ahí son **proveedores nacionales**; y la **135505** son **tres apuntes de saldos iniciales con proveedores**, así que es un **saldo a favor de IVA**. Traducir el nombre en inglés palabra por palabra habría dado otra cosa.

**Con esta pasada ya no queda ninguna cuenta en inglés en el balance.**

**Y aquí salió lo que más importa de todo el día en esta cuenta:** al abrir la **241200** se vio que esos **$113.655.000 son ICA del municipio de Soacha de 2017, 2018 y 2019, todavía sin pagar**. Está explicado arriba, en el punto 2.3, y está en los avisos.

#### Lo que vale para las tres pasadas

- **Solo cambió el nombre.** Ni los códigos, ni los saldos, ni los apuntes. En Odoo todo apunta al identificador interno de la cuenta, así que cambiarle el nombre no mueve un solo asiento.
- **Verificado después:** se volvió a leer el balance y **los saldos quedaron idénticos**.
- Se hizo con una función de un solo uso (`renombrar-feisen`), que **volvió a quedar apagada** después de la tercera pasada, igual que se hizo en su día con la de la homologación.

**Lo importante para quien venga después:** el 18/11/2026 es **la primera vez que se escribe en el plan de cuentas de Feisen**. Hasta el 18/11/2026 Feisen era el **molde**: todo se arreglaba en FC copiando a Feisen, y a Feisen no se le tocaba nada. Desde hoy **las dos empresas pueden tener nombres distintos para el mismo código** —la 130500 es "Clientes nacionales" en Feisen y "Cuentas por Cobrar a Clientes" en FC—, y eso **no es un error**: la pantalla junta las dos empresas **por el código**.

---

## 2.5 La pestaña de Indicadores: dos sub-pestañas, mes a mes (19/11/2026)

Hasta el 19/11/2026 la pestaña **Indicadores** mostraba solo cuatro cifras del **balance**, cortadas a fin del mes que se escogiera arriba. Ese mismo día Angie pidió los del estado de resultados: *"necesito mirar indicadores del estado de resultados, y no solo del balance, así como en el excel, necesito el comparativo de dichos indicadores mes a mes a ver si han mejorado y el promedio del año"*.

Al final del día la pestaña quedó **partida en dos sub-pestañas**:

| Sub-pestaña | Qué trae | Periodo |
|---|---|---|
| **Del resultado** | Los **diez** indicadores del estado de resultados | Todos los meses del año **+ columna del año** |
| **Del balance** | Los **cuatro** de liquidez y endeudamiento | Todos los meses del año, **sin columna del año** |

**Por qué así.** Le mostré a Angie tres formas: la **A** separaba los dos grupos en sub-pestañas, la **B** los mostraba en tarjetas con minigráfico y la **C** los dejaba todos en una sola tabla larga. Ella escogió *"una combinación entre la A y la B"*. Así quedó: **dentro de cada sub-pestaña van primero las tarjetas con minigráfico** —el nombre, la última cifra en grande, cómo viene y la frase que explica qué quiere decir— **y debajo la tabla mes a mes**.

- Las fórmulas del resultado viven en **`src/components/finanzas/indicadoresResultados.js`**.
- Las del balance, en **`src/components/finanzas/indicadoresBalance.js`** (archivo nuevo del mismo día).
- **Las dos tablas las pinta un solo componente, `TablaIndicadores`**, dentro de `src/components/finanzas/Eeff.jsx`. (Al principio hubo un `TablaIndicadoresPyg` aparte, con su propia lista de renglones; ya no existe, y eso es a propósito: una sola tabla es una sola forma de leer las flechas, los avisos y los "—".)

### Los del estado de resultados ("Del resultado")

#### De dónde salen

Son **los mismos diez indicadores de la hoja `📊 INDICADORES`** del Excel `EEFF 2026.xlsx` de Angie, **con las mismas fórmulas**, pero calculados **sobre nuestro propio estado de resultados**, no sobre el de esa hoja.

**Ninguno de ellos vuelve a sumar cuentas.** Todos salen del objeto que devuelve **`calcularMes`** —o **`calcularMesHistorico`** para los meses que vienen del Excel, enero a septiembre—, que es el mismo cálculo que pinta el P&G y la vista del año. Esto es a propósito y es lo que importa de todo el diseño: **la tabla de indicadores no puede decir algo distinto del estado de resultados**, y si algún día cambia una regla de costos allá, estos indicadores cambian solos.

#### Los diez, agrupados como en la pantalla

| Grupo | Indicador | Cómo se calcula |
|---|---|---|
| **Rentabilidad** | Margen bruto | Utilidad bruta ÷ ingresos |
| | Margen operativo | Utilidad operacional ÷ ingresos |
| | Margen neto | Utilidad neta ÷ ingresos |
| **Estructura de costos** | Costos directos / ventas | Costos directos ÷ ingresos |
| | CIF / ventas | CIF ÷ ingresos |
| | Gastos operacionales / ventas | Gastos operacionales ÷ ingresos |
| **Eficiencia operativa** | Punto de equilibrio | (CIF + gastos operacionales) ÷ (1 − costos directos/ingresos) |
| | Apalancamiento operativo | Margen bruto ÷ margen operativo |
| **Comparativo con el mes anterior** | Crecimiento de las ventas | Cuánto subieron o bajaron las ventas frente al mes anterior |
| | Variación del margen bruto | Cuántos **puntos** ganó o perdió el margen bruto frente al mes anterior |

Cada renglón trae debajo del nombre **una frase que explica qué quiere decir**, para no tener que acordarse de la fórmula.

#### Tres decisiones que hay que entender antes de usar la tabla

##### a) La columna "Año" **no es el promedio de los meses**

Es **el indicador calculado sobre los totales del año**: la utilidad del año dividida entre las ventas del año. Es lo que hace el Excel (su columna "AÑO 2026" apunta a la columna de totales del P&G, no al promedio de las otras columnas) y **es lo correcto**: si en un mes se vendieron $200 millones y en otro $700, promediar los dos márgenes le daría al mes flojo el mismo peso que al bueno. Haciéndolo sobre los totales, **cada mes pesa lo que vendió**.

##### b) El margen neto es distinto al del Excel, **a propósito**

En el Excel el margen neto es **un estimado**: toma la utilidad operacional y la multiplica por **0,67**, como si lo único que faltara fuera el **33 % de renta**. Lo hace porque esa hoja no baja de la utilidad operacional.

El nuestro es el de verdad: **descuenta los gastos no operacionales reales** —intereses bancarios, gravámenes (el 4x1000) e intereses de impuestos— y va **antes del impuesto de renta**. Por eso no coincide con el del Excel, y **el de aquí es el bueno**.

##### c) Los márgenes no dan exactamente iguales a los del Excel, y **no es error de ninguno de los dos**

En la hoja consolidada del Excel **los ingresos netos dejan por fuera las ventas no operacionales**; en nuestro P&G **entran**, porque para nosotros también son plata que entró por vender (ver la sección 3).

**Comprobado en enero de 2026:** nuestros ingresos son **$459.595.504** y los del Excel **$455.130.004**. La diferencia son **exactamente los $4.465.500** de la fila de ventas no operacionales. Eso solo sube el **margen bruto de enero de 20,6 % a 21,6 %**.

> **Queda un resto pequeño sin explicar:** unos **$910.000** en la utilidad bruta de enero. No mueve la lectura del indicador, pero **conviene revisarlo algún día** y dejarlo cerrado.

### Los del balance ("Del balance")

Son los cuatro de siempre, pero **ya no solo del mes que se escoja arriba: ahora se calculan para todos los meses del año**, para poder ver de dónde vienen.

| Grupo | Indicador | Cómo se calcula | Qué quiere decir |
|---|---|---|---|
| **Liquidez** | Razón corriente | Activo corriente ÷ pasivo corriente | Por cada peso que hay que pagar en doce meses, cuántos hay para hacerlo. **Por debajo de 1 no alcanza.** |
| | Prueba ácida | (Activo corriente − inventario) ÷ pasivo corriente | Lo mismo, pero sin contar con vender el inventario, que es lo más lento de volverse plata |
| | Capital de trabajo | Activo corriente − pasivo corriente | Lo que queda después de pagar todo lo que vence en doce meses. En negativo, es lo que falta |
| **Endeudamiento** | Razón de endeudamiento | Pasivo total ÷ activo total | De todo lo que tiene la empresa, qué parte está financiada con deuda y no con plata de los socios |

**De dónde salen.** Igual que los del resultado, **no vuelven a sumar cuentas**: cada mes entra ya resuelto por **`calcularBalance`** (o `calcularBalanceHistorico`), que es el mismo cálculo del balance de la sección 2.3, y aquí solo se dividen cifras ya hechas. Los trae el enganche **`useBalanceMeses`**, el mismo del comparativo del balance; **hasta septiembre esos meses salen del Excel de Angie sin pedirle nada a la red**, y solo de octubre en adelante se consulta Odoo.

**Cifras verificadas en pantalla el 19/11/2026, octubre 2026:**

| Indicador | Octubre 2026 |
|---|---|
| Razón corriente | **0,94** |
| Prueba ácida | **0,47** |
| Capital de trabajo | **−$76.796.516** |
| Razón de endeudamiento | **86,1 %** |

#### Estos NO llevan columna de año, y es a propósito

Un indicador del estado de resultados **suma meses**, así que "el margen del año" existe. **Un balance no: es una foto de un día.** No existe "la razón corriente del año" —no se pueden sumar doce fotos—, así que en esta sub-pestaña **la cifra de cierre de la tarjeta es la del último mes cerrado, no un total del año**.

Esto además explica algo que estaba en el Excel de Angie y nadie había escrito: **en su hoja esa casilla quedaba en blanco todos los años**. No era un olvido.

#### La serie llega solo hasta el último mes cerrado

**El mes en curso no tiene balance todavía**, y meterlo dañaba la lectura. Un balance a mitad de mes sale casi vacío: **sin los saldos de bancos escritos, sin la casilla de deuda corriente y con el activo a medias**, mientras el pasivo ya está casi completo. El 19/11/2026 **noviembre daba 10.287 % de endeudamiento**, y con eso el minigráfico de la tarjeta no servía para nada.

Es una diferencia real entre los dos grupos, y conviene decirla así: **un margen de medio mes al menos es un margen; un balance de medio mes no es nada.** Por eso en "Del resultado" el mes en curso **sí aparece** (marcado "va a mitad") y en "Del balance" **no aparece**: la serie termina en el último mes cerrado.

### Lo que avisa la pantalla

- **La flechita de cada celda: la flecha dice para dónde se movió la cifra y el color dice si eso conviene.** Son dos cosas distintas y se leen por separado: **▲** = la cifra subió, **▼** = bajó; **verde** = fue bueno, **rojo** = fue malo. En "costos directos / ventas", que bajó de **67,4 % a 53,7 %**, se ve una **flecha hacia abajo pintada de verde**.
  > **Esto cambió el mismo 19/11/2026 y corrige lo que decía antes esta sección.** Al principio la flecha apuntaba hacia arriba cuando el indicador **mejoraba**, y el color repetía exactamente lo mismo. El resultado era una flecha hacia **arriba** encima de una cifra que había **bajado**, que es justo lo que uno no espera ver. Ahora la flecha sigue el movimiento de la cifra y el color hace el juicio.
- **Un movimiento menor a la décima que se muestra no pinta flecha**, porque eso es redondeo y no un cambio.
- **La tarjeta avisa en la cifra misma cuando el último mes con dato va a mitad de camino:** al lado de la cifra grande aparece **"Nov · va a mitad"** en ámbar. La advertencia ya estaba al pie, pero quedaba lejos: **la cifra grande es lo primero que se lee**, y tenía que avisar ahí.
- **Los meses sin mano de obra cargada van marcados en ámbar**, igual que en la tabla del año (ver la sección 2.2). Su **margen bruto sale inflado**, así que la flecha de ese mes —y la del que viene justo después— **se leería como una mejora que no existe**. La pantalla lo dice con el nombre de los meses.
- **El mes en curso va marcado "va a mitad"** en la tabla del resultado, con su propio aviso: todavía le **faltan ventas por entrar**, pero **los gastos fijos del mes ya pesan casi completos**. Su margen **no se puede comparar** con el de los meses cerrados y su flecha no quiere decir que la cosa haya mejorado ni empeorado.
- **El apalancamiento operativo sale "—"** cuando el **margen operativo es cero o negativo**. No es un dato que falte: es que ahí el indicador **no significa nada**. En el Excel ese caso daba cifras sin sentido, como **−18,14 en junio**.

### Cada sub-pestaña pide solo sus datos

Cuál de las dos sub-pestañas está puesta **no vive dentro de la vista, sino arriba, en el componente `Eeff`** (la variable `grupoInd`), y **de ella depende qué se carga**:

- **"Del resultado"** llama a **`useAno`**, el mismo enganche de la vista de "Todo el año". No toca el balance.
- **"Del balance"** llama a **`useBalanceMeses`**. No toca el estado de resultados del año.

**Por qué quedó así, y no es un detalle técnico.** Cuando la pestaña cargaba las dos cosas de una, **Odoo contestó "Rate limit exceeded"**: son dos lecturas pesadas disparadas al mismo tiempo. Y además la pantalla **exigía el balance del mes aunque uno estuviera parado en la sub-pestaña del resultado**, así que un error de Odoo en el balance **tapaba una vista que no lo necesita**. Ahora cada sub-pestaña se defiende sola: si el balance falla, los indicadores del resultado se siguen viendo.

**La sub-pestaña que se deja puesta se recuerda** para la próxima vez que se entre.

**Dos cortes de tiempo distintos conviven en la pestaña**, y hay que tenerlo claro:

- **El mes que se escoge arriba** sigue mandando en el **balance de un mes** (pestaña Balance) y, dentro de Indicadores, en nada: los del balance van del año completo.
- **Las dos sub-pestañas de Indicadores van siempre del año**, mes por mes, sin importar qué mes esté escogido arriba. La de resultado llega hasta el mes en curso; la de balance, hasta el último mes cerrado.

**No se le pide nada de más a la red:** los meses de enero a septiembre salen del **Excel** y se calculan ahí mismo —tanto el P&G como el balance—, y los de octubre en adelante salen de lo que el enganche de esa sub-pestaña ya trajo. Mientras el año termina de llegar, la tabla muestra "cargando…" en las columnas que faltan.

### Dos errores de cálculo que se encontraron y se arreglaron (19/11/2026)

Quedan escritos los dos, porque **uno de ellos venía de antes y alcanzó a verse en otra pantalla**.

#### a) El endeudamiento salía multiplicado por cien (error del mismo día)

La razón de endeudamiento **se multiplicaba por 100 en el cálculo**, y después el formato de porcentaje de la pantalla **volvía a multiplicarla**. Octubre salía en **8.606 %** en vez de **86,1 %**. Se quitó la multiplicación del cálculo: ahora el valor se guarda como fracción y **el único que multiplica es el formato**. Error nuevo, nacido y muerto el mismo día.

#### b) `useBalanceMeses` no pasaba la casilla de deuda corriente — **este venía de antes**

En el balance de un mes hay una **casilla escrita a mano con cuánto de la deuda financiera vence en doce meses** (está explicada arriba, en el punto 2.3). **`useBalanceMeses` no se la estaba pasando a `calcularBalance`**, así que para esos meses **toda la deuda financiera contaba como no corriente**: el pasivo corriente salía más chico de lo que es y la liquidez, mucho mejor de lo que es.

Lo que se vio en pantalla, octubre 2026:

| Indicador | Decía (malo) | Es (bueno) |
|---|---|---|
| Razón corriente | 1,07 | **0,94** |
| Capital de trabajo | +$79.122.493 | **−$76.796.516** |

O sea: decía que **sobraban $79 millones** cuando en realidad **faltan $77 millones**. El error se notó porque **la misma cifra daba distinto en dos pantallas**: 1,07 en las tarjetas nuevas y 0,94 en el balance del mes, que sí pasaba la casilla. La buena era la del balance del mes.

> **Lo que hay que leer de esto:** `useBalanceMeses` es el mismo enganche que arma **el comparativo del balance entre meses**, así que **el error también estaba ahí**. **Cualquier cifra de liquidez (razón corriente, prueba ácida, capital de trabajo) que se haya mirado en ese comparativo antes del 19/11/2026 se veía mejor de lo que era.** Las cifras de hoy ya están buenas; las que se hayan copiado a un correo o a una presentación antes de esa fecha, no.

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

#### Qué mes es el que manda: el de las cuentas, y nada más (decidido por Angie el 24/11/2026)

**La mano de obra se toma tal como sale en las cuentas del estado de resultados del mes. No se mira la fecha de causación ni la de pago.** Si la cuenta de nómina de un mes trae un valor, ese es el valor que entra al renglón, y punto. No se reparte, no se corre de mes, no se ajusta.

Dicho renglón por renglón, que es lo que de verdad hace el cálculo hoy:

- **Feisen** va por la **fecha del asiento** en Odoo. Es la única fecha que Odoo tiene: **no hay ningún campo que diga a qué mes pertenece la nómina**. Si el asiento quedó con fecha de octubre, es mano de obra de octubre.
- **FC** va por el **periodo trabajado** —el año y el mes del periodo de nómina del ERP—, **no por la fecha en que se paga**. Hoy el ERP tiene cargadas dos quincenas: la del **16 al 31 de octubre**, aprobada, por **$91.177.004**, y la del **1 al 15 de noviembre**, todavía en **borrador**, por **$81.522.734**. **La primera quincena de octubre no está en el ERP**: esa se escribió a mano en las casillas de octubre.

Dos advertencias que hay que leer junto con la decisión:

- **Como Feisen va por la fecha del asiento, una nómina causada en el mes equivocado se ve corrida.** Si contabilidad causa la nómina de un mes con fecha del mes siguiente, el estado de resultados la muestra en el mes que no es. **Eso no se corrige en el EEFF**: se corrige **causando cada nómina con la fecha de su mes**. Mientras cada mes tenga **una sola** nómina causada, el **nivel** del renglón es correcto aunque la etiqueta esté corrida; **el riesgo real es un mes con ninguna o con dos**.
- **El cálculo no mira el estado de la quincena.** Una quincena en **borrador** ya entra al estado de resultados. Si alguien le mueve algo a un borrador, **la cifra del mes cambia sola**, sin que nadie toque el EEFF.

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
- **El balance tiene además una casilla sola para la deuda financiera**: cuánto del grupo 21 vence **dentro de los próximos doce meses** (`corriente:deuda_financiera`, una por mes, el total de las dos empresas juntas). Es la única parte del corriente / no corriente que no se puede deducir de la contabilidad. **Octubre de 2026 ya está escrita: $202.905.009.** El 19/11/2026 quedó en $155.919.009, calculada obligación por obligación con los extractos de ese día, y el **20/11/2026 se corrigió a $202.905.009** al aparecer las cuentas 219500 y 210511. **De enero a septiembre no se usa**: esos meses vienen del Excel, que ya trae la deuda partida. Ver la sección 2.3.
- Todo queda guardado en el ERP, mes por mes.

---

## 9. Avisos

- **El periodo de nómina de octubre está en borrador.** Al cerrarlo las cifras pueden cambiar.
- **La mano de obra se toma como salga en las cuentas del mes, sin mirar causación ni pago** (decisión de Angie del 24/11/2026). Feisen va por la **fecha del asiento** de las cuentas 7205xx —la única fecha que Odoo tiene— y FC por el **periodo trabajado** de la nómina del ERP. De ahí salen dos cosas que conviene tener presentes: si contabilidad **causa la nómina de un mes con fecha del mes siguiente**, el estado de resultados la muestra **corrida**, y eso **no se arregla en el EEFF** sino causando cada nómina con la fecha de su mes; y como **el cálculo no mira el estado de la quincena**, una quincena **en borrador ya está sumando**, así que si alguien le mueve algo, la cifra del mes **cambia sola**. Ver la sección 5.2.
- **Desde noviembre, con las dos quincenas en el ERP, hay que borrar las casillas de la primera quincena** o quedarán sumando de más. Son dos sitios: las de **mano de obra de FC** (una por centro), que se borran desde la pantalla, y la de **nómina administrativa de FC** (una sola para toda la empresa), que **ya no está en la pantalla y hay que pedir que la borren**.
- **Los datos de Odoo se mueven mientras contabilidad trabaja el mes.** Conviene volver a mirar antes de dar un mes por cerrado. Esto solo pasa de octubre en adelante: los meses del Excel ya están cerrados y no se mueven. **Y no es teoría: el 18/11/2026 pasó tres veces en un día** —el **inventario**, las **cuentas de socios** y el **IVA por pagar**—. El último se vio claro: la cuenta **240814 "Iva Por Pagar"** pasó de **$60.356.000** a **$70.356.000** en medio de la sesión, y con eso el pasivo total del balance subió de $1.699.653.878 a **$1.709.653.878**. **Dos cifras tomadas con horas de diferencia pueden no coincidir sin que ninguna esté mal**: antes de concluir que algo está mal cuadrado, mira a qué hora se tomó cada una.
- **No hay que "arreglar" los meses viejos leyéndolos de Odoo.** Antes de octubre Odoo está incompleto y daría cifras que parecen buenas y no lo son. Si alguna vez hay que cambiar un mes de enero a septiembre, se cambia el Excel y se vuelve a generar `eeffHistorico.js`.
- **El balance hay que revisarlo la primera vez.** Los cambios del **17 y del 18/11/2026** se publicaron **sin verificarlos contra Odoo**. Y si algún mes se ve raro, lo primero a mirar son los **saldos a fin de mes**, que son una consulta nueva.
- **Sin los bancos escritos, el balance queda incompleto.** Mientras no se copien los extractos del mes, el disponible sale en "—" y el total del activo va sin él. Y como las cuentas de bancos de Odoo ya no se leen, **no hay ningún otro sitio del balance de donde sacar esa cifra**.
- **El patrimonio del balance ya no sale de Odoo: es la utilidad de tu estado de resultados.** Desde el 18/11/2026 las cuentas de clase 3 se descartan enteras y el patrimonio es un solo renglón con la utilidad del P&G acumulada de enero al mes del balance ($608.645.364 a octubre, diez meses, contra los $3.008.568.525 que daba antes). **Queda fuera** lo que Odoo tiene registrado —capital $100.000.000, reservas $50.000.000 y resultados de años anteriores—. **Eso ya no lo dice la pantalla**: lo decía el recuadro de arriba, que se quitó ese mismo día, y hoy solo está escrito aquí. **Como el P&G es consolidado, ese renglón no se reparte entre Feisen y FC**: las dos columnas salen con "—" y la cifra está en el total. Ver la sección 2.3.
- **El balance todavía no cuadra, pero quedó mucho más cerca.** La sección **Comprobación**, al final del balance, lo dice con tres renglones: a octubre, pasivo + patrimonio **$2.318.299.242** (pasivo $1.709.653.878 + patrimonio $608.645.364) contra un activo de **$1.986.603.598**, o sea **$331.695.644 de diferencia** (antes del cambio del patrimonio, el 18/11/2026, eran unos **$2.700 millones**). **La pantalla dice de cuánto es la diferencia y nada más.** Lo que la explica —y esto **solo está aquí**— es lo que está fuera de los totales a propósito: las **cuentas de socios** ($634.597.564), las **partidas por aclarar** de clase 9 y el **banco sin conciliar de FC**.
- **Las partidas por aclarar ya no se ven en el balance.** Las cuentas de **clase 9** (los **$575.445.392** de FC y el residuo de los saldos iniciales) **siguen fuera de todos los totales, igual que antes**, pero desde el 18/11/2026 **no se muestran en ninguna parte del balance**: están dentro de la diferencia de la Comprobación y en ningún otro sitio. El cálculo las sigue trayendo, así que **volver a mostrarlas es cosa de la pantalla, no de las cifras**.
- **Las cuentas de socios salieron del balance, pero no de la contabilidad.** Desde el 18/11/2026 no suman al activo, al pasivo, al patrimonio ni a ningún indicador ($634.597.564 a octubre), y **ya ni siquiera se muestran en el balance**: se ven en **Finanzas › Impuestos**, fuera de los cálculos de esa pantalla. **Ojo:** allá el saldo es **a hoy y de toda la historia**, así que no coincide con esa cifra de octubre. En los libros siguen registradas y fiscalmente siguen siendo cuentas con los socios: **eso lo tiene que mirar el contador**.
- **Son dos personas, no dos contabilidades.** El reparto por tercero mostró que la **133002 "AVF"** es de **Angie Viviana Franco Cadena** ($598.783.358 a hoy, 557 movimientos) y la **133003 "AFC"** es de **Alfonso Franco Castañeda** ($67.120.706, 137 movimientos). **Corrige lo que quedó supuesto antes**: "AFC" no era *"a FC"* ni el puente con la otra contabilidad. Es la misma historia del capital social incompleto: los papás reinvirtieron y eso nunca se registró.
- **Un total sacado de una lista topada puede mentir, y mintió.** La función `finanzas-cuenta` sumaba los apuntes que traía, y los apuntes vienen **topados en 500**: por eso la **133002** llegó a reportar **$215.378.221**, una cifra truncada que parecía buena. **Corregido el 18/11/2026**: el total y el reparto por tercero los calcula ahora Odoo en el servidor, sin tope, y la respuesta avisa cuándo los apuntes listados son solo una muestra. **Lo que ya se había concluido con esa función sigue valiendo** (la 1365, las dos cuentas de cartera y los tres leasing), porque todas esas cuentas tienen menos de 500 apuntes.
- **El banco sin conciliar de FC sigue siendo trabajo pendiente para contabilidad.** Desde el 18/11/2026 ya no se ve en el balance —las cuentas 11xx de Odoo salieron de la pantalla—, pero la plata sin conciliar sigue en su contabilidad y sigue excluida del **Flujo de caja**.
- **El inventario del balance sí viene cortado a fin de mes.** Esto corrige un aviso anterior: aquí decía que el grupo 14 traía el valor **de hoy** y que no se podía reconstruir hacia atrás por los ~750 movimientos sin fecha, y **era falso**. Desde el 18/11/2026 el balance pide el inventario **al último día del mes que estés mirando**, con la **misma regla** que la pantalla **Reportes › Corte de inventario** (se parte del stock de hoy y se deshacen los movimientos posteriores; los movimientos sin fecha no estorban porque se usa `created_at`). **Ojo con una cosa:** esa regla está escrita **en dos sitios**, el informe y el balance, y hay que **cambiarlos a la vez** si algún día se toca. Ver la sección 2.3.
- **Las cuatro cifras de materias primas de octubre ya están escritas, y son el corte al 31 de octubre.** El 18/11/2026 se escribieron en octubre Lámina $140.726.373, Almacén $94.094.413, Mecanizados $37.328.138 y Materia prima de Fundición $20.237.600. **Corrige lo que decía este aviso antes**, cuando esas casillas llevaban el stock del 18 de noviembre y aquí quedó escrito que no había forma de sacar el saldo del cierre: sí la había. **Dos de esas casillas ya las escribió Angie a mano, y mandan sobre el ERP:** **Ferretería $51.472.269** (el ERP no le pone valor a esa fecha) y **Lámina $43.810.244**, corrigiendo los $140.726.373 del ERP. Ver la sección 2.3.
- **El inventario del ERP está incompleto, y no por donde se espera.** De **891 artículos** con existencias al 31 de octubre, **306 no tienen precio de costo (34 %)** y entran valiendo cero, así que **el inventario sale por debajo de lo que vale**. No son categorías enteras en blanco: están **repartidos dentro de categorías que sí muestran cifra**. Por eso cada renglón dice cuántos le faltan por costear (Almacén va **264 de 527**), y **hay que cargarles el costo** para que la cifra sirva.
- **Hay 262 artículos de Almacén con existencias y sin precio de costo**, de 519 con existencias (la mitad): **15.484 unidades entrando al balance valiendo cero**. El detalle, artículo por artículo, está en **`Articulos sin precio - Almacen - 18-11-2026.csv`**, en la raíz del proyecto. **Poleas y "Para venta" no tienen precio en ningún artículo** (12 de 12 y 4 de 4), **Herramienta va 34 de 42** y **Tornillería concentra 11.448 unidades sin precio** (tres cuartas partes de todo lo no valorizado). El mismo informe muestra **posibles duplicados en el maestro** ("FRESA EN T 40 MM" dos veces, "POLIURETANO AZUL CIELO" y "POLIURETANO (AZUL CIELO)") y **unidades de medida inconsistentes**: conviene **unificar eso antes de cargar precios**, para no costear dos veces el mismo artículo.
- **Las casillas de inventario ya quedaron probadas: sí guardan** (18/11/2026). Pero **ojo con el efecto secundario**: una cifra escrita **manda sobre el ERP sin avisar en el total del grupo**. Solo se nota **abriendo el grupo**, donde la fila dice **"escrito por ti"** en vez de "el ERP dice…". Si un mes el inventario sale raro, **lo primero a mirar es si algún renglón tiene valor escrito**.
- **La nómina está mandando los anticipos a la cuenta equivocada.** Los anticipos de nómina están cayendo en la **1365 "Cuentas Por Cobrar A Trabajadores"** y no en la **136500 "Préstamo a trabajadores"**, que es la correcta. Ahí quedó una sola punta del movimiento, por eso la cuenta está en **−$1.050.000** (siete apuntes de cinco trabajadores). **Pendiente para la contadora:** apuntar la regla de nómina a la 136500 y reclasificar esos siete apuntes; mientras no se haga, **cada quincena vuelve a ensuciar la misma cuenta**. Ver la sección 2.3.
- **Hay un apunte de "FEISEN SAS" dentro de la cartera fiscal de Feisen (−$31.300.553).** La empresa aparece como tercero de sí misma, que es imposible; parece arrastre de la migración y hay que revisarlo con contabilidad.
- **Las "consignaciones sin identificar" (130501, −$70.593.236) están a la espera de un informe.** Son consignaciones de remisiones que no se han logrado identificar; Angie ya se lo pidió a la contadora y **hasta que llegue no se reclasifica nada**.
- **La deuda del leasing de la cizalla puede estar duplicada ($58.861.575).** En la cuenta 211503 hay **dos movimientos por exactamente el mismo valor**: el saldo inicial del 31/03/2026 con tercero Bancolombia y una "COMPRA CIZALLA" del 21/08/2026 con tercero INOMAQ. **No se tocó nada**: hay que mirar el contrato y el soporte de la compra con la contadora. Si resulta duplicado, **el pasivo baja $58,8 millones**.
- **Hay $113.655.000 de ICA del municipio de Soacha sin pagar, de 2017, 2018 y 2019.** Están en la cuenta **241200** de Feisen y son el **42 % de los $267.749.816** del grupo 24 de impuestos: **seis apuntes**, todos con tercero **"MUNICIPIO DE SOACHA"** y concepto "ICA por pagar Soacha 2017 / 2018 / 2019", **todos de los saldos iniciales de marzo de 2026**, o sea de antes de Odoo. Apareció al abrir la cuenta para renombrarla. Es una **deuda vieja con una entidad pública**: hay que mirar con la contadora **si está dentro de algún acuerdo de pago** o si sigue corriendo con intereses y sanciones. **No se tocó nada.** Ver la sección 2.3.
- **La casilla de deuda corriente de octubre ya se corrigió: $202.905.009.** El 20/11/2026 pasó de **$155.919.009** a **$202.905.009** en `eeff_manual`, por SQL y con el visto bueno de Angie. **El pasivo corriente de octubre sube $46.986.000**, casi un **30 % más de deuda financiera corriente**: **la razón corriente, la prueba ácida y el capital de trabajo de octubre empeoran** y los indicadores de balance de la app cambian. **No es que el negocio esté peor**: la cifra que se mostraba estaba incompleta, y **quien los haya mirado antes del 20/11/2026 los vio mejores de lo que eran**. Ver la sección 2.3.
- **El desglose del grupo 21 ya está completo al 99 %.** De los $586.450.615 del grupo: créditos documentados $181.713.491, leasing $316.545.340, la **219500** (préstamo particular) $69.498.000 y la **210511** (CrediExpress Davivienda 1403) $13.650.000. Lo de la 210511 **va entero en corriente por supuesto, no por dato**: es un cupo rotativo, no tiene tabla de amortización a varios años, así que lo usado se asume exigible dentro del año. **Si resulta que fue a plazo fijo con cuotas, hay que partirlo.**
- **Quedan $5.043.784 del grupo 21 sin identificar**, el **0,86 %**. Siguen contados como **no corrientes por defecto**. Ahí dentro está casi con seguridad el enredo de la 210510.
- **No se sabe quién prestó los $100.000.000 de la 219500.** La tabla de amortización no lo dice. El nombre de la cuenta sugiere un particular, no un banco, pero **eso hay que confirmarlo**.
- **La cuenta 210510 "Crédito Bancolombia No. 3292 Sept 2026" está en menos $6.666.666.** Un pasivo en negativo no existe: o se pagó de más o se registró al revés. Y el "3292" se parece al **Credipago de Davivienda 10081013292** ($3.333.334), así que puede ser la **misma deuda registrada en dos lados y mal**. No se tocó nada; es pregunta para la contadora.
- **Del cupo CrediExpress de Davivienda (6700456801301403) hay $13.650.000 usados, no cero.** El cupo aprobado son **$50.000.000** y lo no usado **no es deuda** y no entra al balance; lo usado está en la **210511** y ya está contado. **Corrige lo que decía antes este aviso**, cuando con el extracto de agosto se dio el cupo por intacto. Ver la sección 2.3.
- **Lo que está pedido a contabilidad** (carta en `Desktop/EEFF`): marcar el centro de costo en todas las compras, registrar el costo de ventas todos los meses, acordar el criterio de materia prima contra insumos, revisar junio y unificar el proveedor HIGH SIERRA. Falta agregarle el caso de METAL BARCAS, que tiene el centro equivocado, y **causar cada nómina con la fecha del mes que le corresponde**: el estado de resultados lee la mano de obra de Feisen por la fecha del asiento, así que una nómina causada con fecha del mes siguiente se muestra en el mes que no es, y ahí el arreglo está en la causación, no en el informe (ver la sección 5.2).

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
| Balance: que cada contabilidad cuadre consigo misma | 13/11 | **Exacto**: la suma del saldo de **todas** las cuentas da **$0** en las dos empresas. El 17/11 dejó de ser la fila al pie del balance y pasó al aviso de arriba; el 18/11 **ese aviso también se quitó**, así que hoy **no se ve en la pantalla** y queda escrito aquí: las dos contabilidades cuadran consigo mismas; el problema no es un descuadre sino dónde está ubicada la plata. Esa suma **sigue contando las cuentas 11xx** aunque el balance ya no las muestre: si no, no daría cero |
| Balance: el corte a fin de mes y el disponible a mano | — | **Sin verificar.** El cambio del 17/11/2026 (selector de mes, saldos cortados al último día y disponible escrito a mano) se publicó **sin contrastarlo contra Odoo**, a pedido de Angie. Queda pendiente revisarlo la primera vez que se abra |
| Balance: sacar las cuentas 11xx de Odoo | — | **Sin verificar.** El cambio del 18/11/2026 (las 11xx fuera del balance, sin renglón informativo, sin la fila "Plata mal registrada en bancos" y sin el aviso del banco de FC) tampoco se contrastó contra Odoo antes de publicarlo |
| Balance: la casilla de deuda corriente corregida a $202.905.009 | 20/11, octubre | **Sin verificar.** El cambio se escribió **directo en la base de datos** con un UPDATE por SQL (`eeff_manual`, mes `2026-10`, concepto `corriente:deuda_financiera`, `empresa = 'total'`) y **no se abrió el balance** para comprobar que la pantalla lo toma: la sesión del navegador estaba cerrada. Queda pendiente mirar que el pasivo corriente de octubre y los indicadores de balance muestren el valor nuevo |
| Balance: banco de FC | 13/11 | **$1.567.157.555**, el **97 % de los activos de FC**, y no es plata real: es donde caen los movimientos sin conciliar. Excluido en Flujo de caja. El 17/11 dejó de entrar al activo y quedó como renglón informativo; **desde el 18/11 ya no se muestra en el balance**, junto con el aviso de arriba que daba esa cifra (y ese mismo día se quitó el recuadro entero de avisos). **El problema sigue ahí**: la plata sin conciliar sigue en la contabilidad de FC y sigue siendo trabajo pendiente, solo que el balance ya no es donde se ve |
| Balance: partidas por aclarar de FC | 13/11 | **$575.445.392** de plata contabilizada sin cuenta definitiva (cuentas de clase 9). **Sigue sin sumar a ningún total.** Estuvo en su propio bloque al final del balance —llamado "Movimientos transitorios" hasta el 18/11/2026 y "Partidas por aclarar" después—, pero **ese mismo 18/11 el bloque se quitó y hoy no se ve en ninguna parte del balance**: queda dentro de la diferencia de la Comprobación |
| Balance: resultado del periodo de FC | 13/11, **ya no se usa** | Unos **$2.046 millones**, pero son de **varios años acumulados**: FC no tiene patrimonio registrado ni cierre de años anteriores (allá nunca se hicieron los cierres). **Desde el 18/11 esto dejó de afectar el balance**: el patrimonio ya no sale de las cuentas de Odoo sino del estado de resultados, que es de 2026. El resultado que Odoo calcula por su cuenta se sigue trayendo solo para comparar, pero **desde el 18/11 tampoco se muestra**: se fue con el recuadro de avisos |
| Balance: el patrimonio sale del P&G | 18/11, octubre | **Sin verificar contra Odoo**, como los otros cambios del 18/11. Las cuentas de clase 3 se descartan enteras y el patrimonio queda en un solo renglón: la utilidad del estado de resultados de enero a octubre, **$608.645.364** (diez meses), contra los **$3.008.568.525** que daba antes. Queda fuera lo que Odoo tiene registrado: capital **$100.000.000** (incompleto: hubo reinversión que nunca se registró), reservas **$50.000.000** (nunca existieron de verdad) y los resultados de años anteriores. **No se reparte entre Feisen y FC**, porque el P&G es consolidado |
| Balance: la ecuación, después del cambio del patrimonio | 18/11, al corte del 31/10 | Activo **$1.986.603.598** − pasivo **$1.699.653.878** = **$286.949.720**, contra un patrimonio de **$608.645.364**: **$321.695.644 de diferencia**. **Antes del cambio eran unos $2.700 millones.** Lo que sigue explicándola es lo que está fuera de los totales a propósito: cuentas de socios **$634.597.564**, partidas por aclarar **$559.246.309** y el banco sin conciliar de FC. **Esta fila es la foto de ese momento del día**: unas horas después el pasivo subió $10.000.000 por un registro de IVA por pagar y las cifras vigentes son las de la fila siguiente |
| Balance: la ecuación, como la muestra la sección Comprobación | 18/11, al corte del 31/10 | Pasivo + patrimonio **$2.318.299.242** · activo **$1.986.603.598** · **diferencia $331.695.644**. Son los tres renglones que se publicaron al final del balance. Son los tres renglones que se publicaron al final del balance, y **son las cifras vigentes**. **Por qué no coinciden con la fila de arriba, que daba $321.695.644: el pasivo se movió mientras trabajábamos.** La cuenta **240814 "Iva Por Pagar"** pasó de **$60.356.000** a **$70.356.000** —contabilidad registró $10.000.000 más de IVA por pagar ese mismo día—, así que el pasivo de Feisen subió de $1.541.886.646 a $1.551.886.646 y el **pasivo total**, de $1.699.653.878 a **$1.709.653.878**. Con ese pasivo la ecuación cuadra exacta: $1.709.653.878 + $608.645.364 = **$2.318.299.242**, contra un activo de $1.986.603.598 = **$331.695.644**. **No era un descuadre**: eran dos números tomados con horas de diferencia |
| Balance: quiénes son los terceros de las cuentas de socios | 18/11, a hoy | **Verificado con `finanzas-cuenta`**, leyendo el reparto por tercero: la **133002 "Otras Cuentas Por Cobrar AVF"** es de **ANGIE VIVIANA FRANCO CADENA**, **$598.783.358** en **557 movimientos**; la **133003 "Otras Cuentas Por Cobrar AFC"** es de **ALFONSO FRANCO CASTAÑEDA**, **$67.120.706** en **137 movimientos**. **Corrige una suposición escrita antes:** "AFC" **no** era *"a FC"* ni el puente entre las dos contabilidades, son las iniciales de una persona. Son saldos **a hoy y de toda la historia**, por eso no coinciden con los $634.597.564 que el balance deja fuera al 31/10 |
| El total de `finanzas-cuenta` venía truncado | 18/11 | **Defecto propio, encontrado y corregido.** La función sacaba el total **sumando los apuntes que devolvía**, y los apuntes vienen **topados en 500**: la **133002** reportó **$215.378.221** cuando el saldo real es **$598.783.358**. Ahora el total y el reparto por tercero los agrega Odoo en el servidor (`formatted_read_group`), sin tope, y la respuesta avisa cuando los apuntes listados son solo una muestra. **Las comprobaciones hechas antes con esta función siguen valiendo** —la 1365, la 139000 y las dos provisiones, y los tres leasing—, porque todas esas cuentas tienen **menos de 500 apuntes** |
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
| 18/11 | **Se quitó el aviso de arriba sobre el banco de FC** ($1.567.157.555 y su porcentaje de los activos de FC), porque mostraba justamente esa cifra de Odoo. **El hecho de fondo no desapareció, solo dejó de verse en el balance**: FC sigue teniendo esa plata sin conciliar, sigue excluida del Flujo de caja y sigue siendo trabajo pendiente para contabilidad. Los otros avisos de "Antes de leer estas cifras" siguieron un rato más —las partidas por aclarar de FC (que ese mismo día dejaron de llamarse "movimientos transitorios"), el patrimonio y que cada contabilidad cuadra consigo misma—, **hasta que más tarde ese mismo día se quitó el recuadro entero** (ver las filas del final) |
| 18/11 | El **conteo de cuentas del pie del balance ya no cuenta las 11xx descartadas**. La **suma de todas las cuentas de Odoo sí las sigue contando**, porque si no, no daría cero: es la que respalda el aviso de que cada contabilidad cuadra consigo misma |
| 18/11 | Sin cambios: el balance sigue siendo **a fin del mes escogido**, **unificado Feisen + FC**, **sin centro de costo**, con la **maquinaria al valor en libros**, y las casillas del disponible siguen siendo el **total de las dos empresas juntas** (por eso las columnas de Feisen y FC salen con "—" en ese grupo) |
| 18/11 | **Se quitó la casilla de "Caja menor" del disponible.** Palabras de Angie: *"elimina en el balance la casilla de 'caja menor', esa no la uso"*. El disponible queda con **cuatro casillas**: Bancolombia, Davivienda, Efectivo y Fiducias. Si algún mes ya tenía escrita una cifra en caja menor, **ese valor deja de verse y deja de sumar al disponible** (el renglón sigue guardado en el ERP, pero la pantalla no lo muestra) |
| 18/11 | **Entró la casilla de "Tarjeta prepago" en el disponible**, en el puesto que dejó libre la caja menor. Palabras de Angie: *"añade una cuenta en el efectivo donde estaba caja menor x tarjeta prepago"*. El disponible queda con **cinco casillas**: Bancolombia, Davivienda, Efectivo, Fiducias y Tarjeta prepago. Se escribe y se guarda igual que las demás, mes por mes |
| 18/11 | **Este cambio tampoco se verificó contra datos reales de Odoo** antes de publicarlo |
| 18/11 | **El balance y el estado de resultados se separaron en dos pestañas de carpeta**: **"Estado de resultados"** y **"Balance general"**. Lo pidió Angie: *"separa el informe de eeff el balance y el pyg... para que no se confundan con los mismos botones"*. Antes los tres botones ("Un mes", "Todo el año" y "Balance") iban en la misma fila y el balance parecía una tercera forma de ver el mismo informe. **Cada pestaña trae ahora solo sus propios controles**: el estado de resultados lleva el período, el mes o el año, el centro de costo y el formato de las cifras; el balance, solo "A fin de" con su mes y el aviso de que los bancos los escribe ella. Ver la sección 1.2 |
| 18/11 | **Las cuentas de socios salieron del balance y se fueron a Finanzas › Impuestos.** Primero dejaron de sumar: no entran al activo, al pasivo, al patrimonio ni a ningún indicador —palabras de Angie: *"AFC AVF son las cuentas de socios, eso no lo debemos tener en cuenta para el balance"*—. Ese día pasaron por dos sitios (un bloque propio al final y después un renglón informativo, sin sumar, dentro del grupo 24 del pasivo) hasta que ella pidió *"quita lo de cuentas de socios en el balance, por favor, y déjala en el módulo de impuestos aparte"*: **en el balance ya no se muestra ningún renglón de socios, pero siguen excluidas de todos sus totales, igual que antes**. Son Feisen 133002 "Otras Cuentas Por Cobrar AVF" ($582.808.358), Feisen 133003 "Otras Cuentas Por Cobrar AFC" ($51.814.206) y FC 233506 "Cuentas por pagar a socios Angie" (−$25.000); **$634.597.564 fuera del balance** a octubre. Con eso los **deudores** pasan de $1.096.907.111 a **$462.284.547**, el total activo queda en $2.001.236.418 y el total pasivo en $1.699.653.878. **Se escogen por empresa y no por código**, porque la 233506 de Feisen es "Otras Cuentas Por Pagar" —deuda con terceros— y se queda en el pasivo. Y sin suavizarlo: **es una decisión de cómo leer el balance para gerenciar, no un cambio en la contabilidad**; en los libros siguen registradas y fiscalmente siguen siendo cuentas con los socios, que las tiene que mirar el contador |
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
| 18/11 | **Nueve cuentas de obligaciones financieras de Feisen cambiaron de nombre**, con el pantallazo que mandó Angie (*"Mira las obligaciones financieras como deben salir"*): cinco créditos que seguían en inglés o con "(copia)" —210500, 210502, 210508, 210510 y 210511— y las tres de leasing (211500, 211502 y 211503), más la 219500 "Others" → **Otras Obligaciones Particulares**. **Solo cambió el nombre**: ni códigos, ni saldos, ni apuntes, y se comprobó después leyendo el balance |
| 18/11 | **Hay tres leasing, no dos: Dobladora 566, Torno 962 y Cizalla 833, $316.545.340 al 31/10.** La cuenta **211500**, que se llamaba "Financial corporations", **no era una obligación genérica: es el leasing de la dobladora** (todo con Bancolombia, saldo inicial de $123.000.000 en marzo de 2026 y abonos de $856.280 puntuales cada mes). **FC no tiene ningún leasing** |
| 18/11 | **Señalado para revisar: el leasing de la cizalla (211503) puede estar duplicado.** Tiene **dos movimientos por exactamente $58.861.575** —saldo inicial del 31/03/2026 con tercero Bancolombia y "COMPRA CIZALLA" del 21/08/2026 con tercero INOMAQ—, que es lo que pasa cuando una misma operación se registra dos veces. **No se tocó nada**; hay que mirar el contrato y el soporte de la compra. Si resulta duplicado, **el pasivo baja $58,8 millones** |
| 18/11 | **Los grupos 23 (cuentas por pagar), 24 (impuestos) y 25 (obligaciones laborales) del pasivo se leen solo de Feisen.** Palabras de Angie: *"en las cuentas por pagar 23, usa las cuentas de odoo feisen solamente. lo mismo que la 24 y la 25"*. **Hoy no cambia ninguna cifra** porque FC no tiene cuentas de esas clases (su única 23 es la 233506 de socios, ya fuera de los totales). Al 31/10, todo de Feisen: $58.947.554 · $267.749.816 · $85.769.597. Si algún día FC tiene algo ahí, **el grupo lo avisa en ámbar con los códigos y el monto** en vez de dejarlo caer en silencio |
| 18/11 | **El patrimonio dejó de salir de Odoo: es la utilidad del estado de resultados.** Palabras de Angie: *"el capital social sé que es más, mis papás han reinvertido pero eso nunca quedó registrado contablemente; lo de las reservas nunca hemos tenido reservas reales; solo deberíamos contar el resultado del ejercicio, del PYG del erp"*. Las cuentas de **clase 3 se descartan enteras** y el patrimonio queda en **un solo renglón**: la utilidad del P&G **acumulada de enero al mes del balance**. A octubre son **diez meses** y dan **$608.645.364**, contra los **$3.008.568.525** que daba antes. **Como el P&G es consolidado, el patrimonio no se reparte entre Feisen y FC**: las dos columnas van con "—" y la cifra está en el total, igual que el disponible y el inventario |
| 18/11 | **Lo que Odoo tiene registrado como patrimonio no desaparece: se dice en el aviso de arriba del balance qué queda fuera** —capital **$100.000.000** (está incompleto: hubo reinversión de los papás de Angie que nunca se registró contablemente), reservas **$50.000.000** (nunca hubo reservas de verdad) y los **resultados de años anteriores**—, más el **resultado que Odoo calcula por su cuenta** con sus cuentas de las clases 4 a 7, que queda **solo para comparar**. **Se quitó el aviso que decía que FC no tiene patrimonio registrado** y lo reemplazó este: el "resultado del periodo" de FC en Odoo eran varios años acumulados porque allá nunca se hicieron los cierres, y nuestro P&G es de 2026. **Más tarde ese mismo día se quitó el recuadro de avisos entero**, así que esto dejó de verse en la pantalla y quedó solo en este documento (ver las filas del final) |
| 18/11 | **Calcular el patrimonio así no hace lenta la pantalla.** Los meses anteriores a octubre salen del **Excel** y no le piden nada a la red, así que un balance de octubre cuesta **las consultas de un solo mes** a Odoo y al ERP, no las de doce. Con esto la ecuación del balance queda, al 31/10: activo **$1.986.603.598** − pasivo **$1.699.653.878** = **$286.949.720** contra un patrimonio de **$608.645.364**, o sea **$321.695.644 de diferencia**, cuando antes del cambio eran unos **$2.700 millones**. Lo que la explica sigue siendo lo que está fuera de los totales a propósito: las cuentas de socios, los movimientos transitorios y el banco sin conciliar de FC |
| 18/11 | **"Movimientos transitorios" se llama ahora "Partidas por aclarar".** Palabras de Angie: *"quita lo de cuentas transitorias y reemplázalo por partidas por aclarar"*. **Es el mismo bloque** —las cuentas de clase 9 de Odoo, al final del balance, con el signo tal como viene y **sin sumar a ningún total**—: lo único que cambió es el nombre, porque dice mejor lo que son, **plata ya contabilizada que todavía no tiene cuenta definitiva**. Ninguna cifra se movió. **Más tarde ese mismo día el bloque se quitó del balance** (ver las filas del final): el nombre quedó solo en el cálculo y en este documento |
| 18/11 | **El bloque de cuentas de socios vive ahora en Finanzas › Impuestos**, al final de esa pantalla y **fuera de todos sus cálculos**: no suma a la renta, ni a los anticipos, ni a los impuestos por pagar. Muestra cada cuenta con su saldo, cuántos movimientos tiene y su **reparto por tercero**. Angie: *"según la DIAN esa plata todavía se debe, pero me gusta tenerlo presente"*. **Un detalle que la propia pantalla advierte:** ahí el saldo es **a hoy y de toda la historia**, no al corte del mes, **así que no coincide con la cifra que el balance deja fuera** |
| 18/11 | **AVF y AFC son dos personas, y eso corrige algo que estaba escrito.** Con el reparto por tercero se vio que la **133002 "Otras Cuentas Por Cobrar AVF"** es de **ANGIE VIVIANA FRANCO CADENA** ($598.783.358 a hoy, 557 movimientos) y la **133003 "Otras Cuentas Por Cobrar AFC"**, de **ALFONSO FRANCO CASTAÑEDA** ($67.120.706, 137 movimientos). **Yo había supuesto que "AFC" quería decir *"a FC"***, o sea que era el puente entre la contabilidad de Feisen y la de FC: **era falso**, son iniciales de personas. **Conecta con lo del patrimonio**: son los mismos que reinvirtieron sin que quedara registrado contablemente |
| 18/11 | **Se corrigió un defecto de `finanzas-cuenta`, la función con la que se abren las cuentas por dentro.** Calculaba el total **sumando los apuntes que devolvía**, y los apuntes vienen **topados en 500**, así que una cuenta con más movimientos daba **un total truncado que parecía bueno**: la **133002** reportó **$215.378.221** cuando el saldo real es **$598.783.358**. Ahora el total y el reparto por tercero los agrega Odoo en el servidor, sin tope, y la respuesta avisa cuando los apuntes listados son solo una muestra. **Lo que ya se había concluido con esta función no cambia** —la 1365, las dos cuentas de cartera y los tres leasing—, porque todas tienen menos de 500 apuntes |
| 18/11 | **Cinco cuentas más de Feisen pasaron al español, y con eso ya no queda ninguna en inglés en el balance** (tercera pasada del día; en total van diecinueve): 220500 National → **Proveedores nacionales** ($553.126.138) · 241200 On industry and commerce → **Impuesto de industria y comercio** ($113.655.000) · 236800 Industry and commerce tax withheld → **Impuesto de industria y comercio retenido** ($37.300) · 135505 VAT Receivable → **Saldo a favor de IVA** ($6.000) · 139901 "Provision de Cartera NIIF" → **Provisión de cartera NIIF** ($53.917.269; esa no estaba en inglés, le faltaba la tilde). Palabras de Angie: *"todo lo que esté en inglés en el balance pásalo a español como se debe"*. Se buscaron solo las que **se ven en el balance**: con saldo y en las clases que la pantalla muestra. **Antes de nombrarlas se abrieron con `finanzas-cuenta`, para no traducir a ciegas**: la 220500 tiene **2.077 apuntes con proveedores**, así que son proveedores nacionales, y la 135505 son **tres apuntes de saldos iniciales con proveedores**, así que es un saldo a favor de IVA. **Solo cambió el nombre**: ni códigos, ni saldos, ni apuntes, y se comprobó después leyendo el balance. `renombrar-feisen` volvió a quedar apagada como cascarón 410. Ver la sección 2.4 |
| 18/11 | **Aparecieron $113.655.000 de ICA del municipio de Soacha sin pagar, de 2017, 2018 y 2019.** Salió al abrir la cuenta **241200** para renombrarla: son **seis apuntes**, todos con tercero "MUNICIPIO DE SOACHA" y concepto "ICA por pagar Soacha 2017 / 2018 / 2019", y **todos entraron con los saldos iniciales de marzo de 2026**, así que vienen de antes de Odoo. Son el **42 % de los $267.749.816** del grupo 24. **No se tocó nada**: hay que mirar con la contadora **si está dentro de algún acuerdo de pago** o si sigue corriendo con intereses y sanciones. Ver la sección 2.3 |
| 18/11 | **Al final del balance entró la sección "Comprobación", y es lo único que queda al pie.** Palabras de Angie: *"no coloques nada de partidas por aclarar entonces, por ahora. Solo deja la información de la ecuación de pasivo+patrimonio=activo y si hay diferencia mencionar de cuánto es la diferencia, el resto no lo tengas en cuenta"*. Son **tres renglones** —**Pasivo + patrimonio**, **Activo** y **Diferencia**— más una **frase corta** que dice de cuánto es la diferencia. Al 31/10: **$2.318.299.242** contra **$1.986.603.598**, o sea **$331.695.644**. **No se explica la diferencia ni se reparte entre causas**: eso es justo lo que ella pidió quitar. **Si faltan datos del mes** —los bancos del disponible sin escribir o el resultado del ejercicio todavía calculándose— **la sección no muestra la diferencia** y dice que falta información y que no tiene sentido comparar |
| 18/11 | **Salió del balance el bloque "Partidas por aclarar"** (las cuentas de clase 9: los $575.445.392 de FC y el residuo de los saldos iniciales). **Esto hay que leerlo con cuidado, porque es deliberado y no es obvio:** esas cuentas **siguen fuera de todos los totales, exactamente igual que antes**, pero ahora **ya no se ven en ninguna parte del balance**; entran dentro de la **diferencia** de la Comprobación y nada más. El cálculo **las sigue devolviendo**, así que **volver a mostrarlas es cosa de la pantalla, no de las cifras** |
| 18/11 | **Se quitó el recuadro ámbar de "Antes de leer estas cifras" que iba arriba del balance.** Lo pidió Angie junto con lo anterior. Con él se fueron sus tres avisos: las **partidas por aclarar de FC**, que el **patrimonio no sale de Odoo** (con lo que queda fuera: capital $100.000.000, reservas $50.000.000 y resultados de años anteriores, más el resultado que Odoo calcula por su cuenta) y que **cada contabilidad cuadra consigo misma**. **Las tres siguen siendo ciertas y están escritas en este documento**: lo único que cambió es que **la pantalla ya no las dice**. Arriba del balance queda solo el título con el mes y el total del activo |

| 19/11 | **La deuda financiera de octubre quedó partida entre corriente y no corriente: $155.919.009 vencen dentro de doce meses.** Se escribió en la casilla `corriente:deuda_financiera` de `eeff_manual` (mes `2026-10`, empresa `total`), calculada **obligación por obligación** con los extractos y las cuentas de cobro que entregó Angie ese día. **El método es distinto según el papel:** en los **créditos** el extracto separa capital de interés, así que lo corriente es el **abono a capital × 12 topado al saldo** (y si faltan menos de doce cuotas, todo es corriente), **sin los intereses**, que aún no se causan; en los **leasing** la cuenta de cobro no trae el saldo, así que se **despeja dividiendo el interés del mes entre la tasa mensual equivalente** (la EA elevada a 1/12) y se amortizan doce meses con el canon fijo, sin seguros. Seis créditos por $181.713.491 (corriente $110.075.000) y tres leasing por $316.345.919 (corriente $45.844.009). Ver la sección 2.3 |
| 19/11 | **El saldo de los leasing despejado desde los intereses coincide con los libros: $316.345.919 contra $316.545.340, $199.421 de diferencia (0,06 %).** Dos caminos independientes dan el mismo número, así que el método de despejar el saldo desde el interés **se puede usar con confianza** para los meses que vengan |
| 19/11 | **Quedan $88.391.205 del grupo 21 sin identificar, clasificados como no corrientes por descarte.** El balance trae $586.450.615 y los nueve documentos explican $498.059.410. **Nadie ha confirmado que esa diferencia sea de largo plazo**: hay que pedirle a la contadora las cuentas que componen el grupo 21 y cotejarlas. Una posibilidad es el presunto doble registro de $58.861.575 del leasing de la cizalla |
| 19/11 | **El cupo CrediExpress de Davivienda 6700456801301403 no entra al balance**: está en cero, son $50.000.000 de cupo aprobado y sin usar, y un cupo disponible **no es deuda** |
| 19/11 | **La pestaña de Indicadores muestra también los del estado de resultados, mes a mes y con columna del año.** Pedido de Angie: *"necesito mirar indicadores del estado de resultados, y no solo del balance, así como en el excel, necesito el comparativo de dichos indicadores mes a mes a ver si han mejorado y el promedio del año"*. Son **los mismos diez** de la hoja `📊 INDICADORES` de su Excel y **con las mismas fórmulas**, pero calculados sobre **nuestro** P&G: salen del objeto que devuelve `calcularMes` (o `calcularMesHistorico` de enero a septiembre), así que **no hay ninguna cuenta repetida** y la tabla **no puede decir algo distinto del estado de resultados**. Fórmulas en `src/components/finanzas/indicadoresResultados.js` (nuevo); las pinta `TablaIndicadoresPyg` en `Eeff.jsx`. Ver la sección 2.5 |
| 19/11 | **La columna "Año" de esos indicadores no es el promedio de los meses**: es el indicador calculado **sobre los totales del año**, igual que en el Excel (su columna "AÑO 2026" apunta a la columna de totales del P&G). Es lo correcto, porque así **cada mes pesa lo que vendió** y no lo mismo que los demás |
| 19/11 | **El margen neto de aquí es distinto al del Excel, a propósito.** En el Excel es un **estimado** —utilidad operacional × **0,67**, como si lo único que faltara fuera el 33 % de renta—, porque esa hoja no baja de la utilidad operacional. El nuestro **descuenta los gastos no operacionales reales** (intereses bancarios, 4x1000 e intereses de impuestos) y va **antes del impuesto de renta**. **El de aquí es el bueno** |
| 19/11 | **Los márgenes tampoco dan exactamente iguales a los del Excel, y no es error de ninguno de los dos:** en la hoja consolidada los ingresos netos **dejan por fuera las ventas no operacionales** y en nuestro P&G **entran**. Comprobado en **enero**: nuestros ingresos son **$459.595.504** y los del Excel **$455.130.004**, y la diferencia son **exactamente los $4.465.500** de esa fila; con eso el margen bruto de enero pasa de **20,6 % a 21,6 %**. **Queda un resto pequeño sin explicar** —unos **$910.000** en la utilidad bruta de enero— **que conviene revisar algún día** |
| 19/11 | **Avisos de la tabla de indicadores:** cada celda lleva **flecha verde (▲ mejoró) o roja (▼ empeoró)** frente al mes anterior, **mirando para el lado que le convenga al indicador** (en un margen subir es bueno; en un costo sobre ventas, malo), y **un movimiento menor a la décima que se muestra no pinta flecha** porque es redondeo. Los meses **sin mano de obra cargada** van **en ámbar**, igual que en la tabla del año, porque su margen bruto sale inflado y la flecha se leería como una mejora que no existe. El **mes en curso** queda marcado **"va a mitad"**, también en ámbar: le faltan ventas por entrar pero los gastos fijos ya pesan casi completos, así que su margen no se puede comparar con el de los meses cerrados. Y el **apalancamiento operativo** sale **"—"** cuando el margen operativo es **cero o negativo** (en el Excel ese caso daba cifras sin sentido, como **−18,14 en junio**) |
| 19/11 | **La pestaña de Indicadores carga ahora el año entero** (`useAno`), no solo el mes escogido. Dentro conviven **dos cortes de tiempo**: el mes que se escoge arriba manda en los **indicadores de liquidez del balance**, y los del **estado de resultados van siempre del año completo**. No pide nada de más a la red: enero a septiembre salen del Excel y de octubre en adelante, de lo que `useAno` ya trajo |
| 20/11 | **De los $88.391.205 del grupo 21 sin identificar ya solo quedan $5.043.784, y se resolvió sin entrar a Odoo.** Se cruzó el total del grupo contra los **saldos por cuenta al 31/10/2026** que ya estaban guardados de cuando se renombraron las nueve obligaciones el 18/11. **El faltante no estaba en los leasing**: los tres dan $316.545.340 en libros contra $316.345.919 despejados desde los intereses, así que estaba todo en los **créditos** ($269.905.275 en libros contra $181.713.491 documentados = $88.191.784). De eso, **$83.148.000 (el 94 %) lo explican dos cuentas con nombre propio**: la **219500 "Otras Obligaciones Particulares" $69.498.000** y la **210511 "Crédito Davivienda No. 1403 Oct 2026" $13.650.000**. Ver la sección 2.3 |
| 20/11 | **La 219500 es un préstamo de $100.000.000 al 2 % mensual, y su parte corriente son $33.336.000.** Angie mandó la tabla de amortización ("Tabla de amortizacion prestamo Construequipos junio 17 de 2025.pdf", en su Escritorio): desembolsado el **17/06/2025**, **36 cuotas**, los primeros seis meses solo interés ($2.000.000) y desde el **17/12/2025** abona **$2.778.000 de capital** al mes, última cuota **17/11/2028**. Saldo según la tabla al 17/10/2026 **$69.442.000** contra **$69.498.000** del libro: **$56.000** de redondeo, es la misma obligación. Lo corriente son las doce cuotas del 17/11/2026 al 17/10/2027 ($69.442.000 − $36.106.000), así que sobre el saldo del libro queda **corriente $33.336.000 · no corriente $36.162.000**. **El 2 % mensual son 26,8 % EA: es plata cara** frente a los créditos bancarios de Feisen (18,70 % a 22,52 % EA). **Quién prestó la plata no lo dice el documento** y queda por confirmar |
| 20/11 | **La deuda con Davivienda son solo los $13.650.000 de la 210511, y van enteros en corriente.** Lo confirmó Angie, así que **el pendiente del extracto de octubre se cierra**. Que todo sea corriente es **supuesto, no dato**: el 1403 es el **cupo rotativo CrediExpress** ($50.000.000 aprobados) y un cupo rotativo **no tiene tabla de amortización a varios años** —se usa y se repone—, así que lo usado se asume exigible dentro del año. **Si resulta que fue a plazo fijo con cuotas, hay que partirlo**. Ver la sección 2.3 |
| 20/11 | **La casilla `corriente:deuda_financiera` de octubre se corrigió: de $155.919.009 a $202.905.009.** Se hizo con un **UPDATE por SQL** sobre `eeff_manual` (mes `2026-10`, `empresa = 'total'`), cambiando `valor`, `nota` y `updated_at`, **con el visto bueno expreso de Angie** (*"Sí, escríbela"*). El desglose definitivo del grupo 21 al 31/10: créditos $181.713.491 (corriente $110.075.000) · leasing $316.545.340 (corriente $45.844.009) · 219500 $69.498.000 (corriente $33.336.000) · 210511 $13.650.000 (toda corriente) · sin identificar $5.043.784 → total **$586.450.615**, corriente **$202.905.009**. **Los $189.255.009 que se habían calculado el día anterior se quedaron cortos en los $13.650.000 de Davivienda** |
| 20/11 | **El pasivo corriente de octubre sube $46.986.000 con esa corrección**, casi un **30 % más de deuda financiera corriente**. **La razón corriente, la prueba ácida y el capital de trabajo de octubre empeoran** y los indicadores de balance de la app cambian. **No es que el negocio esté peor que ayer**: la cifra que se mostraba estaba incompleta, y **quien haya mirado esos indicadores antes del 20/11/2026 los vio mejores de lo que eran**. Mismo tipo de problema que el defecto de `useBalanceMeses` del 19/11, pero por otra vía: allá la casilla no llegaba al cálculo, aquí la casilla misma estaba corta |
| 20/11 | **La corrección de la casilla NO se verificó contra la pantalla.** Se escribió directo en la base de datos y no se abrió el balance, porque la sesión del navegador está cerrada. **Queda pendiente** (está en la tabla de la sección 10). Y queda abierto lo de siempre: **$5.043.784 sin identificar** (el 0,86 % del grupo 21, no corrientes por defecto), la **210510** en negativo y **quién prestó los $100.000.000** de la 219500 |
| 20/11 | **La cuenta 210510 "Crédito Bancolombia No. 3292 Sept 2026" está en menos $6.666.666 al 31/10, y eso no es parte del faltante.** Un pasivo en negativo no existe: o se pagó de más o se registró al revés. El "3292" se parece al **Credipago de Davivienda 10081013292** ($3.333.334), así que puede ser la **misma deuda registrada en dos lados y mal**. **No se tocó nada**; es pregunta para la contadora. Ver la sección 2.3 |
| 20/11 | **Las deudas de difícil cobro quedan como no corrientes, y ya no es propuesta mía: lo decidió Angie.** Palabras suyas: *"las deudas de difícil cobro es mejor dejarlas como no corrientes"*. La **1390** y la **1399** siguen mostrándose igual que antes —**ninguna cifra del balance cambió**—; lo que cambia es que el criterio **deja de estar pendiente de confirmar**. Entre las dos quedan unos **$400.000**, así que mueven muy poco la razón corriente y el capital de trabajo. **No confundir con la decisión del 19/11**, que es otra: esa fue la de los **anticipos de impuestos (1355), que sí son corrientes**. Ver la sección 2.3 |
| 24/11 | **La mano de obra se toma como salga en las cuentas del mes: no se mira causación ni pago.** Lo decidió Angie. Si la cuenta de nómina de un mes trae un valor, ese es el valor que entra. **Feisen** sale de Odoo, cuentas **7205xx** sin la 720511, **por la fecha del asiento** —es la única fecha que Odoo tiene, no hay campo que diga a qué mes pertenece la nómina—. **FC** sale de la nómina del ERP **por el periodo trabajado**, no por la fecha de pago; hoy el ERP tiene la quincena del **16 al 31 de octubre** aprobada ($91.177.004) y la del **1 al 15 de noviembre** en borrador ($81.522.734), y **la primera quincena de octubre está escrita a mano**. Quedan dos advertencias: una nómina **causada con fecha del mes siguiente** se ve **corrida** y eso se arregla en la causación, no en el EEFF (con una sola nómina al mes el nivel del renglón es correcto; el riesgo es un mes con ninguna o con dos), y **una quincena en borrador ya suma**, así que si se la mueven, la cifra del mes cambia sola. Ver la sección 5.2 |

> El detalle de cada decisión, con los números con que se comprobó, está en `OBSERVACIONES.md`, en las secciones del 11 y el 13 de noviembre de 2026.
