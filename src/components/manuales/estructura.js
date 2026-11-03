// Estructura de los documentos que se escriben en la app (asistente guiado). Cada tipo tiene sus
// partes en orden; cada parte dice qué editor usa, la ayuda para quien escribe, un ejemplo y
// revisiones automáticas. De aquí salen el asistente, la vista en pantalla, el PDF y el Word,
// así que agregar o cambiar una parte se hace solo aquí. El contenido se guarda en
// manual_versiones.contenido como { [clave]: valor }.
//
// Editores: 'texto' (string) · 'lista' (string[]) · 'tabla' (objetos con `columnas`) ·
// 'pasos' (tabla de actividades con decisiones; de ahí sale el diagrama de flujo) · 'numero'.

const palabras = t => String(t || '').trim().split(/\s+/).filter(Boolean)
const vacio = v => Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim()
// Primera palabra en infinitivo: "Establecer", "Definir", "Recibir"
export const empiezaConVerbo = t => /^(¿)?[a-záéíóúñ]+(ar|er|ir)(se|lo|la|los|las)?$/i.test(palabras(t)[0] || '')

// Revisiones comunes
const largo = (min, texto) => v => ({ ok: palabras(v).length >= min, texto: texto || `Tiene al menos ${min} palabras` })
const conVerbo = v => ({ ok: empiezaConVerbo(v), texto: 'Empieza con un verbo en infinitivo (establecer, definir, recibir…)' })
const minimo = (n, cosa) => v => ({ ok: (v || []).length >= n, texto: `Tiene al menos ${n} ${cosa}` })
const filasCompletas = (claves, texto) => v => ({ ok: (v || []).length > 0 && v.every(f => claves.every(k => !vacio(f[k]))), texto })

const PASOS_REVISA = [
  minimo(3, 'pasos'),
  filasCompletas(['actividad', 'responsable'], 'Cada paso dice qué se hace y quién lo hace'),
  v => ({ ok: (v || []).length > 0 && v.every(p => empiezaConVerbo(p.actividad) || p.decision), texto: 'Cada actividad empieza con un verbo (recibir, revisar, registrar…)' }),
  v => ({ ok: (v || []).every(p => !p.decision || !vacio(p.siNo)), texto: 'Cada pregunta de sí/no dice qué pasa si la respuesta es NO' }),
]

const PARTE = {
  objetivo: {
    clave: 'objetivo', titulo: 'Objetivo', editor: 'texto', obligatorio: true,
    pregunta: '¿Para qué existe este documento?',
    ayuda: 'Una o dos frases que digan qué se logra al seguirlo. Empieza con un verbo en infinitivo.',
    consejos: ['Piensa: si alguien nuevo lo lee, ¿qué debe quedar claro en la primera línea?', 'No expliques cómo se hace; eso va en los pasos.'],
    ejemplo: 'Establecer cómo se reciben, inspeccionan y almacenan las materias primas que llegan a la planta, para que a producción solo pase material que cumple.',
    revisa: [conVerbo, largo(10)],
  },
  alcance: {
    clave: 'alcance', titulo: 'Alcance', editor: 'texto', obligatorio: true,
    pregunta: '¿A qué aplica, dónde empieza y dónde termina?',
    ayuda: 'Di a qué áreas, productos o personas aplica, y cuál es el primer y el último momento del proceso.',
    consejos: ['Usa la fórmula: «Aplica a… Empieza cuando… y termina cuando…».', 'Si hay algo que NO cubre, dilo: evita discusiones después.'],
    ejemplo: 'Aplica a toda materia prima e insumo que llega a las bodegas de Feisen. Empieza cuando el proveedor entrega el material y termina cuando queda almacenado o devuelto al proveedor.',
    revisa: [largo(10), v => ({ ok: /(empieza|inicia|comienza|desde)/i.test(v || '') && /(termina|finaliza|hasta)/i.test(v || ''), texto: 'Dice dónde empieza y dónde termina' })],
  },
  responsables: {
    clave: 'responsables', titulo: 'Responsables', editor: 'tabla', obligatorio: true,
    pregunta: '¿Quién hace qué?',
    ayuda: 'Cada cargo que participa y de qué responde. Usa cargos, no nombres de personas: la gente cambia, los cargos no.',
    consejos: ['Incluye a quien aprueba o verifica, no solo a quien ejecuta.', 'Si un cargo no tiene ningún paso a su nombre, probablemente sobra.'],
    columnas: [
      { clave: 'cargo', titulo: 'Cargo', placeholder: 'Almacenista', ancho: 30 },
      { clave: 'responsabilidad', titulo: 'Responsabilidad', placeholder: 'Recibe el material y verifica cantidades contra la orden de compra', ancho: 70, largo: true },
    ],
    ejemplo: [
      { cargo: 'Almacenista', responsabilidad: 'Recibe el material, verifica cantidades y lo registra en la app.' },
      { cargo: 'Jefe de Calidad', responsabilidad: 'Inspecciona el material y decide si se acepta o se rechaza.' },
      { cargo: 'Coordinador de Logística', responsabilidad: 'Gestiona la devolución con el proveedor cuando el material no cumple.' },
    ],
    revisa: [minimo(2, 'cargos'), filasCompletas(['cargo', 'responsabilidad'], 'Cada cargo tiene su responsabilidad')],
  },
  definiciones: {
    clave: 'definiciones', titulo: 'Definiciones', editor: 'tabla',
    pregunta: '¿Qué palabras podría no entender alguien nuevo?',
    ayuda: 'Términos técnicos, siglas o palabras que en Feisen se usan con un sentido especial. Si no hay, puedes saltar esta parte.',
    consejos: ['Piensa en el operario que llegó ayer: ¿qué palabra le preguntaría a un compañero?'],
    columnas: [
      { clave: 'termino', titulo: 'Término', placeholder: 'Material no conforme', ancho: 30 },
      { clave: 'significado', titulo: 'Qué significa', placeholder: 'Material que no cumple lo pedido en la orden de compra…', ancho: 70, largo: true },
    ],
    ejemplo: [
      { termino: 'Material no conforme', significado: 'Material que no cumple con lo pedido (cantidad, medida, calidad o documentos).' },
      { termino: 'OC', significado: 'Orden de compra generada desde la app.' },
    ],
    revisa: [filasCompletas(['termino', 'significado'], 'Cada término tiene su significado')],
  },
  recursos: {
    clave: 'recursos', titulo: 'Equipos, materiales y documentos', editor: 'lista',
    pregunta: '¿Qué se necesita para hacerlo?',
    ayuda: 'Herramientas, equipos, materiales, otros documentos o normas que se usan. Si no aplica, salta esta parte.',
    consejos: ['Incluye los instrumentos de medición: luego ayudan a saber qué hay que calibrar.'],
    placeholder: 'Calibrador pie de rey',
    ejemplo: ['Báscula de piso', 'Calibrador pie de rey', 'Orden de compra en la app', 'Formato de inspección de recepción'],
    revisa: [],
  },
  pasos: {
    clave: 'pasos', titulo: 'Paso a paso', editor: 'pasos', obligatorio: true,
    pregunta: '¿Cómo se hace, en orden?',
    ayuda: 'El corazón del documento. Un paso = una acción. Para cada paso: qué se hace, quién lo hace y qué evidencia queda. Si hay una pregunta (¿cumple?), márcala como decisión y di qué pasa si la respuesta es no.',
    consejos: [
      'Escríbelo con quien hace el trabajo todos los días, no de memoria desde la oficina.',
      'Frases cortas que empiecen con un verbo: «Pesar el material», no «Se procede a realizar el pesaje».',
      'Del paso a paso sale solo el diagrama de flujo del documento.',
    ],
    ejemplo: [
      { actividad: 'Recibir el material', detalle: 'Pedir al transportador la remisión y buscar la orden de compra en la app.', responsable: 'Almacenista', registro: 'Remisión del proveedor' },
      { actividad: 'Verificar cantidades', detalle: 'Contar o pesar y comparar contra la orden de compra.', responsable: 'Almacenista', registro: 'Formato de inspección de recepción' },
      { actividad: '¿El material cumple?', detalle: 'Revisar medidas, estado y certificados de calidad.', responsable: 'Jefe de Calidad', registro: 'Formato de inspección de recepción', decision: true, siNo: 'Separar el material, marcarlo como NO CONFORME y avisar a Logística para la devolución.' },
      { actividad: 'Registrar la entrada', detalle: 'Registrar la entrada en la app para que sume al inventario.', responsable: 'Almacenista', registro: 'Movimiento de entrada en la app' },
      { actividad: 'Almacenar el material', detalle: 'Ubicarlo en su estantería, identificado.', responsable: 'Almacenista', registro: '' },
    ],
    columnas: [
      { clave: 'actividad', titulo: 'Actividad', placeholder: 'Verificar cantidades' },
      { clave: 'detalle', titulo: 'Cómo se hace', placeholder: 'Contar o pesar y comparar contra la orden de compra', largo: true },
      { clave: 'responsable', titulo: 'Responsable', placeholder: 'Almacenista', sugerir: 'responsables' },
      { clave: 'registro', titulo: 'Registro / evidencia', placeholder: 'Formato de inspección de recepción', sugerir: 'registros' },
    ],
    revisa: PASOS_REVISA,
  },
  seguridad: {
    clave: 'seguridad', titulo: 'Seguridad y precauciones', editor: 'texto',
    pregunta: '¿Qué riesgos hay y cómo se evitan?',
    ayuda: 'Riesgos para las personas, el equipo o el producto, y la protección que se debe usar. En un proceso de oficina puedes saltar esta parte.',
    consejos: ['Sé concreto: «guantes de carnaza y careta para manipular metal caliente», no «usar EPP».'],
    ejemplo: 'Usar botas de seguridad, guantes y casco al descargar material. Cargas de más de 25 kg se mueven con montacargas o entre dos personas.',
    revisa: [],
  },
  registros: {
    clave: 'registros', titulo: 'Registros', editor: 'tabla',
    pregunta: '¿Qué evidencia queda y dónde se guarda?',
    ayuda: 'Los formatos, reportes o pantallas de la app donde queda constancia de lo que se hizo. Un auditor ISO siempre pide estos registros.',
    consejos: ['Si un registro está en la app, dilo: «Movimientos de inventario en la app (se guarda indefinidamente)».'],
    columnas: [
      { clave: 'nombre', titulo: 'Registro', placeholder: 'Formato de inspección de recepción', ancho: 34 },
      { clave: 'responsable', titulo: 'Quién lo diligencia', placeholder: 'Almacenista', ancho: 22 },
      { clave: 'donde', titulo: 'Dónde se guarda', placeholder: 'Carpeta de calidad / app', ancho: 26 },
      { clave: 'tiempo', titulo: 'Tiempo', placeholder: '2 años', ancho: 18 },
    ],
    ejemplo: [
      { nombre: 'Formato de inspección de recepción', responsable: 'Jefe de Calidad', donde: 'Carpeta de calidad', tiempo: '2 años' },
      { nombre: 'Movimientos de entrada', responsable: 'Almacenista', donde: 'App Feisen (Inventario)', tiempo: 'Indefinido' },
    ],
    revisa: [filasCompletas(['nombre', 'donde'], 'Cada registro dice dónde se guarda')],
  },
}

// Partes propias de otros tipos
const INSTRUCTIVO_PASOS = {
  ...PARTE.pasos,
  ayuda: 'Los pasos exactos para operar el equipo o hacer la tarea, como si le explicaras a alguien nuevo frente a la máquina. Agrega la precaución de cada paso cuando aplique.',
  ejemplo: [
    { actividad: 'Revisar el equipo antes de encender', detalle: 'Verificar que no haya fugas, que las guardas estén puestas y el área limpia.', responsable: 'Operario', registro: 'Lista de chequeo diaria' },
    { actividad: 'Encender el equipo', detalle: 'Girar el selector a ON y esperar que la luz verde quede fija.', responsable: 'Operario', registro: '' },
  ],
  revisa: [minimo(3, 'pasos'), filasCompletas(['actividad'], 'Cada paso dice qué se hace'), PASOS_REVISA[2], PASOS_REVISA[3]],
}

const ESTRUCTURA = {
  procedimiento: {
    nombre: 'Procedimiento',
    que: 'Un procedimiento dice cómo se hace un proceso completo: quién participa, en qué orden y qué evidencia queda. Por ejemplo: cómo se compra, cómo se recibe materia prima o cómo se trata un producto que salió malo.',
    tiempo: '1 a 2 horas',
    partes: [PARTE.objetivo, PARTE.alcance, PARTE.responsables, PARTE.definiciones, PARTE.recursos, PARTE.pasos, PARTE.seguridad, PARTE.registros],
  },
  instructivo: {
    nombre: 'Instructivo',
    que: 'Un instructivo explica una sola tarea con mucho detalle, normalmente en un puesto de trabajo o una máquina. Por ejemplo: cómo operar el torno CNC o cómo preparar la arena de moldeo.',
    tiempo: '30 a 60 minutos',
    partes: [
      { ...PARTE.objetivo, ejemplo: 'Explicar cómo se opera el torno CNC de forma segura para mecanizar piezas dentro de tolerancia.' },
      { ...PARTE.alcance, pregunta: '¿A qué equipo, puesto o tarea aplica?', ejemplo: 'Aplica al torno CNC del área de Mecanizados. Empieza con la revisión del equipo al inicio del turno y termina cuando se apaga y se limpia.' },
      { clave: 'epp', titulo: 'Elementos de protección', editor: 'lista', obligatorio: true, pregunta: '¿Qué protección debe usar quien lo hace?',
        ayuda: 'Lista de elementos de protección personal obligatorios para esta tarea.', consejos: ['Si no se necesita protección especial, escribe «Dotación normal».'],
        placeholder: 'Gafas de seguridad', ejemplo: ['Gafas de seguridad', 'Botas con puntera', 'Protectores auditivos'], revisa: [minimo(1, 'elemento')] },
      { ...PARTE.recursos, titulo: 'Herramientas y materiales' },
      INSTRUCTIVO_PASOS,
      PARTE.seguridad,
    ],
  },
  formato: {
    nombre: 'Formato',
    que: 'Un formato es la hoja (o tabla) donde se anota lo que se hizo: una inspección, una asistencia, un control de temperatura. Lo que diseñas aquí sale como una hoja en blanco lista para imprimir y llenar.',
    tiempo: '15 a 30 minutos',
    partes: [
      { clave: 'proposito', titulo: 'Para qué sirve', editor: 'texto', obligatorio: true, pregunta: '¿Para qué se llena y cuándo?',
        ayuda: 'Una frase: qué se registra, quién lo llena y en qué momento.', consejos: ['Ejemplo de fórmula: «Registrar… Lo llena… cada vez que…».'],
        ejemplo: 'Registrar la inspección de cada lote de materia prima que llega. Lo llena el Jefe de Calidad cada vez que se recibe material.', revisa: [largo(8)] },
      { clave: 'encabezado', titulo: 'Datos generales', editor: 'lista', obligatorio: true, pregunta: '¿Qué datos se anotan una sola vez por hoja?',
        ayuda: 'Los campos de arriba de la hoja: fecha, turno, proveedor, orden… Cada uno sale como «Campo: ________».',
        consejos: ['Casi siempre va la fecha y quién lo llena.'], placeholder: 'Fecha', ejemplo: ['Fecha', 'Proveedor', 'N.º de orden de compra', 'Remisión'], revisa: [minimo(1, 'campo')] },
      { clave: 'columnas', titulo: 'Columnas de la tabla', editor: 'tabla', obligatorio: true, pregunta: '¿Qué se anota por cada fila?',
        ayuda: 'Las columnas de la tabla principal. Cada fila de la hoja será un ítem, una pieza o una medición.',
        consejos: ['Pocas columnas y claras: más de 7 ya no caben bien en una hoja vertical (la app la pone horizontal).', 'Para respuestas de sí/no, pon «Cumple (Sí/No)».'],
        columnas: [{ clave: 'nombre', titulo: 'Columna', placeholder: 'Cumple (Sí/No)' }],
        ejemplo: [{ nombre: 'Material' }, { nombre: 'Cantidad pedida' }, { nombre: 'Cantidad recibida' }, { nombre: 'Cumple (Sí/No)' }, { nombre: 'Observación' }],
        revisa: [minimo(2, 'columnas'), filasCompletas(['nombre'], 'Todas las columnas tienen nombre')] },
      { clave: 'filas', titulo: 'Filas en blanco', editor: 'numero', pregunta: '¿Cuántas filas para llenar?',
        ayuda: 'Cuántos renglones vacíos trae la hoja. Entre 10 y 20 suele ser cómodo.', consejos: [], ejemplo: '15', revisa: [] },
      { clave: 'instrucciones', titulo: 'Cómo se llena', editor: 'lista', pregunta: '¿Qué debe saber quien lo llena?',
        ayuda: 'Indicaciones cortas que salen al pie de la hoja. Si es obvio, puedes saltar esta parte.', consejos: [],
        placeholder: 'Escribir con esfero, sin tachones', ejemplo: ['Llenar un formato por cada remisión.', 'Si algo no cumple, escribir el motivo en Observación y avisar a Logística.'], revisa: [] },
      { clave: 'firmas', titulo: 'Firmas', editor: 'lista', pregunta: '¿Quién firma la hoja?',
        ayuda: 'Los cargos que firman al final de la hoja.', consejos: [], placeholder: 'Jefe de Calidad', ejemplo: ['Recibió (Almacenista)', 'Inspeccionó (Jefe de Calidad)'], revisa: [] },
    ],
  },
  manual: {
    nombre: 'Manual',
    que: 'Un manual reúne en un solo documento la visión general de un tema: por ejemplo, el manual de calidad (cómo funciona el sistema de gestión de Feisen) o el manual de funciones.',
    tiempo: '2 a 4 horas',
    partes: [
      { clave: 'introduccion', titulo: 'Introducción', editor: 'texto', obligatorio: true, pregunta: '¿De qué trata este manual y para quién es?',
        ayuda: 'Presenta el manual: qué contiene, para quién es y cómo se usa.', consejos: [],
        ejemplo: 'Este manual describe cómo funciona el sistema de gestión de calidad de Feisen: qué procesos tiene, quién responde por cada uno y qué documentos los soportan.', revisa: [largo(15)] },
      PARTE.alcance,
      { clave: 'capitulos', titulo: 'Capítulos', editor: 'tabla', obligatorio: true, pregunta: '¿Qué temas cubre?',
        ayuda: 'Cada capítulo con su título y su texto. Agrega tantos como necesites.', consejos: ['Un capítulo por tema; si un texto se vuelve muy largo, probablemente es un procedimiento aparte.'],
        columnas: [{ clave: 'titulo', titulo: 'Título', placeholder: 'Mapa de procesos' }, { clave: 'texto', titulo: 'Texto', placeholder: 'Feisen organiza su trabajo en…', largo: true }],
        ejemplo: [{ titulo: 'Presentación de la empresa', texto: 'Feisen S.A.S. fabrica maquinaria liviana para construcción…' }, { titulo: 'Mapa de procesos', texto: 'Procesos estratégicos: Gerencia. Procesos misionales: Ventas, Fundición, Mecanizados, Ensamble…' }],
        revisa: [minimo(1, 'capítulo'), filasCompletas(['titulo', 'texto'], 'Cada capítulo tiene título y texto')] },
      PARTE.definiciones,
    ],
  },
  politica: {
    nombre: 'Política',
    que: 'Una política es la declaración corta de la gerencia sobre un tema (calidad, seguridad…): qué se compromete a cumplir la empresa. ISO 9001 exige una política de calidad firmada por la dirección.',
    tiempo: '30 a 45 minutos',
    partes: [
      { clave: 'proposito', titulo: 'Propósito', editor: 'texto', obligatorio: true, pregunta: '¿Para qué existe esta política?',
        ayuda: 'Una frase sobre por qué la empresa declara esta política.', consejos: [],
        ejemplo: 'Definir el compromiso de Feisen con la calidad de sus productos y la satisfacción de sus clientes.', revisa: [conVerbo] },
      PARTE.alcance,
      { clave: 'declaracion', titulo: 'Declaración', editor: 'texto', obligatorio: true, pregunta: '¿Qué declara la gerencia?',
        ayuda: 'El texto de la política, en primera persona plural («En Feisen nos comprometemos a…»). Corto: que quepa en una cartelera.',
        consejos: ['ISO 9001 pide que incluya el compromiso de cumplir los requisitos y de mejorar continuamente.'],
        ejemplo: 'En Feisen fabricamos maquinaria liviana confiable para la construcción. Nos comprometemos a cumplir los requisitos de nuestros clientes y los legales, a entregar a tiempo y a mejorar continuamente nuestros procesos con la participación de todo el equipo.',
        revisa: [largo(25), v => ({ ok: /mejora/i.test(v || ''), texto: 'Incluye el compromiso de mejora continua (lo pide ISO 9001)' }), v => ({ ok: /requisito/i.test(v || ''), texto: 'Incluye el compromiso de cumplir los requisitos' })] },
      { clave: 'compromisos', titulo: 'Compromisos', editor: 'lista', pregunta: '¿Cómo se concreta?',
        ayuda: 'Los compromisos concretos que se desprenden de la política. De aquí salen los objetivos de calidad que se miden.', consejos: [],
        placeholder: 'Entregar a tiempo el 95 % de los pedidos', ejemplo: ['Entregar a tiempo al menos el 95 % de los pedidos.', 'Reducir las piezas defectuosas de fundición.', 'Capacitar a todo el personal en sus procedimientos.'], revisa: [] },
    ],
  },
}

export default ESTRUCTURA

// Contenido vacío para empezar un documento de un tipo
export function contenidoVacio(tipo) {
  const c = {}
  for (const p of ESTRUCTURA[tipo].partes) c[p.clave] = ['lista', 'tabla', 'pasos'].includes(p.editor) ? [] : ''
  if (tipo === 'formato') c.filas = '15'
  return c
}

export const parteVacia = (parte, valor) => vacio(valor)

// Revisión de una parte: [{ ok, texto }]. Una parte opcional vacía no se revisa.
export function revisarParte(parte, valor) {
  if (vacio(valor)) return parte.obligatorio ? [{ ok: false, texto: 'Esta parte es obligatoria' }] : []
  const r = (parte.revisa || []).map(fn => fn(valor))
  if (tieneCorchetes(valor)) r.push({ ok: false, texto: 'No quedan partes [entre corchetes] por completar' })
  return r
}

// ¿Quedan textos [por completar] de la plantilla?
export function tieneCorchetes(v) {
  if (Array.isArray(v)) return v.some(tieneCorchetes)
  if (v && typeof v === 'object') return Object.values(v).some(tieneCorchetes)
  return /\[[^\]]+\]/.test(String(v ?? ''))
}

// Resumen de todo el documento: partes listas, pendientes y avisos
export function revisarDocumento(tipo, contenido) {
  return ESTRUCTURA[tipo].partes.map(p => {
    const valor = contenido?.[p.clave]
    const checks = revisarParte(p, valor)
    return { parte: p, vacia: vacio(valor), checks, lista: checks.every(c => c.ok) && !(p.obligatorio && vacio(valor)) }
  })
}
