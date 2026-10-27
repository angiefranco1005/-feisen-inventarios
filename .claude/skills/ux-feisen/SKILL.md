---
name: ux-feisen
description: Usar al diseñar o rediseñar cualquier pantalla de las apps de Feisen (inventario/ERP, órdenes de fabricación, costeo). Principios de UX, patrones de pantalla inspirados en ERPs e inventarios líderes (Odoo, Zoho Inventory, Sortly, inFlow, Katana, Linear) y lista de chequeo antes de entregar.
---

# UX para las apps de Feisen

Feisen es una planta metalmecánica (fundición, mecanizados, ensamble, motores). Los usuarios
son gerencia (escritorio, decide con números), jefes de área y almacenistas (celular en planta,
manos ocupadas, poco tiempo) y consulta comercial (solo lectura). Diseña para que **una persona
sin capacitación entienda la pantalla en 5 segundos**.

## Principios

1. **Primero la pregunta, después el dato.** Cada pantalla responde una pregunta concreta
   ("¿qué se está acabando?", "¿cuánto vale la bodega?"). Si no puedes nombrar la pregunta, sobra.
2. **Excepciones arriba, todo lo demás abajo.** Lo que requiere acción (agotado, bajo mínimo,
   pendiente de aprobar) va primero y con color; lo normal va neutro. (Patrón de Odoo/Katana.)
3. **Un color = un significado.** Rojo `#B4271D` = problema/agotado. Ámbar = bajo mínimo/atención.
   Verde = solo para confirmar algo que el usuario hizo. Azul `#064794` = acción principal y enlaces.
   Nunca uses color solo como decoración.
4. **Lista → detalle sin perder el sitio.** Clic en una fila abre un panel lateral (drawer) en
   escritorio o pantalla completa en celular; la lista y sus filtros se conservan. (Linear, Zoho.)
5. **Filtros visibles, no escondidos.** Búsqueda + chips de filtro arriba de la lista; el filtro
   activo se ve y se quita con una "x". Los conteos van dentro del chip ("Agotados · 12").
6. **Números que se comparan, alineados.** Cifras a la derecha, `tabular-nums`, misma unidad en la
   columna. Dinero en COP sin decimales con separador de miles ("$ 37.698.551"); en tarjetas
   resumidas usar "$37,7 M".
7. **Una acción principal por pantalla.** Un solo botón azul relleno; lo demás es secundario
   (borde) o va en el menú "⋯".
8. **Celular de verdad.** Objetivos táctiles ≥ 44 px, tablas se convierten en tarjetas, acción
   principal fija abajo, nada de hover como única forma de ver información.
9. **Estados vacíos que enseñan.** Nunca "No hay datos": di por qué y qué hacer
   ("Este producto no tiene stock mínimo. Defínelo para recibir alertas →").
10. **Permisos sin ruido.** Lo que el rol no puede ver no aparece (ni deshabilitado). Precios y
    valores solo para ADMIN.
11. **Cada perfil ve solo su bodega.** Todo perfil tiene al menos una bodega asignada y solo ve
    los productos, conteos y movimientos de esa bodega. **Solo ADMIN ve todas las bodegas** y el
    valor por bodega; ningún otro rol (tampoco Logística) tiene vista global. En pantallas
    no-admin se muestra la bodega asignada en el encabezado y se ocultan columna y filtro de bodega.
12. **Buscar sin saber la categoría.** La búsqueda por nombre es la vía principal: palabras sueltas,
    en cualquier orden, sin importar tildes ni mayúsculas ("polea 8" encuentra "POLEA 8 X 2B").
    El filtro por categoría es un complemento con conteos, nunca un paso obligatorio.

## Estética (igual al menú lateral y a la app de OF)

- Fondo `feisen-fondo #F7F8FA`; superficies blancas con `border border-feisen-borde` y `rounded-xl`.
  Sin sombras pesadas: como mucho `shadow-sm` en elementos flotantes (drawer, menús).
- Texto `feisen-texto #1F2937`; secundario `feisen-texto-2 #5B6472`; fuente Inter.
- Jerarquía con tamaño y peso, no con cajas: título de página 20–22 px semibold, etiquetas 12 px
  `uppercase tracking-wide` en gris, cifras clave 24–28 px semibold.
- Separadores de 1 px (`divide-feisen-borde-suave`), espaciado en múltiplos de 4 (gap-3/4/6).
- Íconos lucide-react a 16–18 px, del mismo gris del texto secundario.
- Badges de estado: fondo suave + texto del color (`bg-feisen-rojo-suave text-feisen-rojo`),
  `rounded-md px-2 py-0.5 text-xs font-medium`.

## Patrones de pantalla

**Encabezado de módulo:** título + subtítulo de una línea (qué es y para quién) a la izquierda;
acción principal a la derecha. Debajo, pestañas si el módulo tiene vistas (Productos · Bodegas · Conteos).

**Franja de indicadores (KPI):** 3–4 tarjetas máximo. Cada una: etiqueta, cifra, contexto
("12 productos · 3 bodegas"). Las tarjetas de excepción son clicables y aplican el filtro
correspondiente en la lista de abajo.

**Lista de registros:** búsqueda (atajo `/`), chips de filtro (bodega, categoría, estado),
orden por columna, paginación o "cargar más" con total visible ("Mostrando 50 de 1.253").
Fila: nombre en negrita + dato secundario gris debajo (categoría · unidad), estado como badge,
cifra principal a la derecha con una barra mini del nivel frente al mínimo.

**Panel de detalle (drawer):** encabezado con nombre, badges y acciones; bloques: existencias por
bodega, niveles (mínimo/máximo/punto de pedido), últimos movimientos (5) con enlace al historial
completo, datos del producto. Cerrar con `Esc` o la "x".

**Formularios:** una columna en celular, dos en escritorio; etiqueta arriba del campo; validar al
salir del campo; botón principal abajo a la derecha (fijo abajo en celular).

## Referentes y qué tomar de cada uno

- **Odoo Inventario:** tablero por bodega con conteo de "por hacer" y filtros guardados.
- **Zoho Inventory:** ficha de producto con existencias por bodega y transacciones en pestañas.
- **Sortly:** inventario visual y simple, foto + cantidad grande, pensado para celular.
- **inFlow / Katana:** "punto de pedido": el mínimo dispara la alerta y sugiere cantidad a pedir.
- **Linear:** densidad, tipografía limpia, cortes de 1 px, atajos de teclado, drawer de detalle.

## Antes de entregar una pantalla

- [ ] ¿Qué pregunta responde? ¿Se responde sin hacer scroll?
- [ ] ¿Las excepciones están arriba y el resto en neutro?
- [ ] ¿Hay una sola acción principal?
- [ ] ¿Funciona a 375 px de ancho sin scroll horizontal?
- [ ] ¿Los números están alineados a la derecha y con formato COP?
- [ ] ¿El estado vacío explica qué hacer?
- [ ] ¿Cada rol ve solo lo suyo: su bodega asignada, y precios/valores solo ADMIN?
- [ ] ¿Se puede encontrar un producto escribiendo parte del nombre, sin elegir categoría?
- [ ] ¿Usa los tokens `feisen-*` y no colores sueltos?
- [ ] Se anotó la decisión en `OBSERVACIONES.md`.
