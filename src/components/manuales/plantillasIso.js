// Guía ISO 9001:2015 para Feisen: los documentos que conviene tener, en el orden sugerido, con
// una plantilla prellenada para cada uno. El texto [entre corchetes] es lo que cada área debe
// completar con su realidad; el asistente no deja enviar a revisión mientras quede alguno.
// `clave` se guarda en manuales.plantilla para marcar en la guía qué ya se empezó.

export const GRUPOS_GUIA = [
  { clave: 'base', titulo: 'Lo que pide la norma', detalle: 'La base del sistema: sin esto no hay certificación.' },
  { clave: 'procesos', titulo: 'Procesos de la planta', detalle: 'Cómo se trabaja en cada área. Empieza por los que más problemas dan.' },
  { clave: 'formatos', titulo: 'Formatos', detalle: 'Hojas para dejar evidencia de lo que se hace.' },
]

const p = (actividad, detalle, responsable, registro = '', extra = {}) => ({ actividad, detalle, responsable, registro, ...extra })

export const GUIA_ISO = [
  // ---------------- Base ----------------
  {
    clave: 'politica-calidad', grupo: 'base', tipo: 'politica', area: 'Gerencia', titulo: 'Política de calidad',
    clausula: '5.2', porque: 'La norma exige que la gerencia declare por escrito su compromiso con la calidad y lo comunique a todos.',
    responsable: 'Gerente General', dirigido: [],
    contenido: {
      proposito: 'Definir el compromiso de Feisen con la calidad de sus productos y la satisfacción de sus clientes.',
      alcance: 'Aplica a todos los procesos y a todo el personal de Feisen. Empieza a regir desde su aprobación y se revisa como mínimo una vez al año en la revisión por la dirección, hasta que se publique una versión nueva.',
      declaracion: 'En Feisen fabricamos [maquinaria liviana para construcción] confiable y durable. Nos comprometemos a cumplir los requisitos de nuestros clientes y los legales, a entregar a tiempo, a cuidar a nuestra gente y a mejorar continuamente nuestros procesos con la participación de todo el equipo.',
      compromisos: ['Entregar a tiempo al menos el [95] % de los pedidos.', 'Reducir las piezas defectuosas en fundición y mecanizado.', 'Atender todas las quejas de clientes en menos de [5] días hábiles.', 'Capacitar a todo el personal en los procedimientos de su cargo.'],
    },
  },
  {
    clave: 'manual-calidad', grupo: 'base', tipo: 'manual', area: 'Gerencia', titulo: 'Manual del sistema de gestión de calidad',
    clausula: '4.3 · 4.4', porque: 'La norma pide documentar el alcance del sistema y cómo se relacionan los procesos. El manual lo reúne en un solo lugar.',
    responsable: 'Gerente General', dirigido: [],
    contenido: {
      introduccion: 'Este manual describe cómo funciona el sistema de gestión de calidad de Feisen: qué hace la empresa, qué procesos tiene, quién responde por cada uno y qué documentos los soportan. Es la puerta de entrada al resto de manuales y procedimientos.',
      alcance: 'Aplica al diseño, fabricación (fundición, mecanizado y ensamble) y venta de [maquinaria liviana para construcción] en la planta de [Soacha]. Empieza con el pedido del cliente y termina con la entrega y el servicio posventa. [Exclusiones: si algún requisito de la norma no aplica, escríbelo aquí y explica por qué].',
      capitulos: [
        { titulo: 'Presentación de la empresa', texto: '[Historia corta de Feisen, qué fabrica, cuántas personas trabajan y quiénes son sus clientes].' },
        { titulo: 'Contexto y partes interesadas', texto: '[Qué factores externos e internos afectan a Feisen (mercado de construcción, precios del hierro y aluminio, competencia) y qué esperan los clientes, empleados, proveedores y el Estado].' },
        { titulo: 'Mapa de procesos', texto: 'Estratégicos: Gerencia. Misionales: Ventas, Fundición, Mecanizados, Ensamble y Despachos. De apoyo: Compras y Logística, Inventarios, Mantenimiento, Calidad, Recursos Humanos y Finanzas. [Ajusta según cómo trabaja hoy la planta].' },
        { titulo: 'Política y objetivos de calidad', texto: 'La política de calidad está en el documento PO-GER-001. Los objetivos que se miden son: [entregas a tiempo, piezas defectuosas, quejas de clientes]; se revisan cada [mes] en la reunión de gerencia.' },
        { titulo: 'Control de la información documentada', texto: 'Todos los documentos del sistema se crean, revisan, aprueban y publican en la app Feisen ERP (módulo Manuales). Solo la versión aprobada en la app es válida; una copia impresa es copia no controlada.' },
      ],
      definiciones: [{ termino: 'Sistema de gestión de calidad', significado: 'La forma organizada en que Feisen planea, hace, revisa y mejora su trabajo para cumplir a sus clientes.' }],
    },
  },
  {
    clave: 'control-documentos', grupo: 'base', tipo: 'procedimiento', area: 'Calidad', titulo: 'Control de documentos y registros',
    clausula: '7.5', porque: 'La norma exige controlar que todos trabajen con la versión vigente de cada documento y que los registros se conserven. Este módulo de la app ya hace casi todo: el procedimiento solo lo describe.',
    responsable: 'Jefe de Calidad', dirigido: [],
    contenido: {
      objetivo: 'Establecer cómo se crean, revisan, aprueban, publican, cambian y conservan los documentos y registros del sistema de gestión de calidad de Feisen.',
      alcance: 'Aplica a todos los manuales, procedimientos, instructivos, formatos y políticas de Feisen. Empieza cuando alguien identifica la necesidad de un documento nuevo o de un cambio y termina cuando la versión aprobada queda publicada y leída por el personal.',
      responsables: [
        { cargo: 'Jefe de área', responsabilidad: 'Elabora los documentos de su proceso y propone los cambios.' },
        { cargo: 'Jefe de Calidad', responsabilidad: 'Revisa que el documento sea claro, completo y no contradiga otros documentos.' },
        { cargo: 'Gerente General', responsabilidad: 'Aprueba los documentos y sus cambios.' },
        { cargo: 'Todo el personal', responsabilidad: 'Lee y confirma en la app los documentos de su cargo y trabaja solo con la versión vigente.' },
      ],
      definiciones: [
        { termino: 'Documento controlado', significado: 'Documento cuya versión vigente está publicada y aprobada en la app.' },
        { termino: 'Copia no controlada', significado: 'Cualquier copia impresa o descargada: puede quedar desactualizada, se usa solo como apoyo.' },
        { termino: 'Listado maestro', significado: 'Lista de todos los documentos con su versión vigente; se descarga desde la app.' },
      ],
      recursos: ['App Feisen ERP, módulo Manuales'],
      pasos: [
        p('Identificar la necesidad', 'Cualquier persona puede pedir un documento nuevo o un cambio al jefe de su área.', 'Jefe de área'),
        p('Elaborar el borrador', 'Escribir el documento en la app con el asistente guiado (o subir el archivo) y enviarlo a revisión.', 'Jefe de área', 'Borrador en la app'),
        p('¿El documento está claro y completo?', 'Revisar en la app que sea entendible, que los pasos tengan responsable y que no contradiga otros documentos.', 'Jefe de Calidad', 'Revisión en la app', { decision: true, siNo: 'Devolverlo en la app con el comentario de qué corregir; el jefe de área lo corrige y lo vuelve a enviar.' }),
        p('Aprobar el documento', 'Aprobar en la app. La versión anterior queda obsoleta automáticamente.', 'Gerente General', 'Aprobación en la app'),
        p('Comunicar y confirmar lectura', 'Cada persona de los cargos a los que va dirigido lo lee y marca «Leído y entendido» en la app.', 'Todo el personal', 'Lecturas en la app'),
        p('Revisar periódicamente', 'Cada año (o antes si cambia el proceso) revisar si el documento sigue vigente y actualizarlo.', 'Jefe de área', 'Listado maestro'),
      ],
      registros: [
        { nombre: 'Listado maestro de documentos', responsable: 'Jefe de Calidad', donde: 'App Feisen (Manuales)', tiempo: 'Indefinido' },
        { nombre: 'Historial de versiones y aprobaciones', responsable: 'Automático', donde: 'App Feisen (Manuales)', tiempo: 'Indefinido' },
        { nombre: 'Confirmaciones de lectura', responsable: 'Automático', donde: 'App Feisen (Manuales)', tiempo: 'Indefinido' },
      ],
    },
  },
  {
    clave: 'no-conforme', grupo: 'base', tipo: 'procedimiento', area: 'Calidad', titulo: 'Control del producto no conforme',
    clausula: '8.7', porque: 'La norma exige identificar y separar lo que sale malo para que no llegue al cliente por error.',
    responsable: 'Jefe de Calidad', dirigido: [],
    contenido: {
      objetivo: 'Establecer cómo se identifica, separa y decide qué hacer con el material, las piezas o las máquinas que no cumplen, para que no lleguen al cliente.',
      alcance: 'Aplica a materia prima, piezas fundidas, piezas mecanizadas y equipos ensamblados en todas las áreas. Empieza cuando alguien detecta algo que no cumple y termina cuando se decide su destino (reproceso, uso con concesión, chatarra o devolución).',
      responsables: [
        { cargo: 'Operario', responsabilidad: 'Detecta y separa lo que no cumple y avisa a su jefe.' },
        { cargo: 'Jefe de área', responsabilidad: 'Registra la no conformidad en la app y propone qué hacer.' },
        { cargo: 'Jefe de Calidad', responsabilidad: 'Decide el destino del producto y verifica el reproceso.' },
      ],
      pasos: [
        p('Detectar la no conformidad', 'Durante la producción o la inspección se encuentra una pieza o material que no cumple.', 'Operario'),
        p('Separar e identificar', 'Llevar el producto a la zona de no conformes y marcarlo con [tarjeta roja / etiqueta NO CONFORME].', 'Operario'),
        p('Registrar en la app', 'Crear la no conformidad en el módulo de Calidad con foto, cantidad y causa probable.', 'Jefe de área', 'No conformidad en la app'),
        p('¿Se puede reprocesar?', 'Evaluar si la pieza se puede corregir sin afectar su función.', 'Jefe de Calidad', 'No conformidad en la app', { decision: true, siNo: 'Darla de baja como chatarra (o devolver al proveedor si es materia prima) y registrar la salida en la app.' }),
        p('Reprocesar y verificar', 'Hacer el reproceso y volver a inspeccionar antes de liberar.', 'Jefe de área', 'No conformidad en la app'),
        p('Analizar si se repite', 'Si el mismo problema aparece [3] veces en un mes, abrir una acción correctiva.', 'Jefe de Calidad', 'Acción correctiva'),
      ],
      registros: [{ nombre: 'No conformidades', responsable: 'Jefe de área', donde: 'App Feisen (Calidad)', tiempo: 'Indefinido' }],
    },
  },
  {
    clave: 'acciones-correctivas', grupo: 'base', tipo: 'procedimiento', area: 'Calidad', titulo: 'Acciones correctivas y mejora',
    clausula: '10.2 · 10.3', porque: 'La norma pide atacar la causa de los problemas para que no se repitan, no solo apagar incendios.',
    responsable: 'Jefe de Calidad', dirigido: ['JEFE_FUNDICION', 'JEFE_MECANIZADOS', 'JEFE_ENSAMBLE', 'LOGISTICA'],
    contenido: {
      objetivo: 'Establecer cómo se analizan las causas de los problemas importantes o repetidos y cómo se toman acciones para que no vuelvan a ocurrir.',
      alcance: 'Aplica a no conformidades repetidas, quejas de clientes, hallazgos de auditoría e incumplimiento de objetivos. Empieza cuando se abre la acción y termina cuando se verifica que fue eficaz.',
      responsables: [
        { cargo: 'Jefe de Calidad', responsabilidad: 'Abre la acción, acompaña el análisis y verifica la eficacia.' },
        { cargo: 'Jefe de área', responsabilidad: 'Analiza la causa con su equipo y ejecuta las acciones.' },
        { cargo: 'Gerente General', responsabilidad: 'Asigna los recursos y hace seguimiento en la revisión por la dirección.' },
      ],
      pasos: [
        p('Abrir la acción', 'Describir el problema con datos: qué pasó, dónde, cuántas veces, desde cuándo.', 'Jefe de Calidad', '[Formato o registro de acciones correctivas]'),
        p('Contener el problema', 'Tomar una acción inmediata para que no siga pasando mientras se analiza.', 'Jefe de área'),
        p('Analizar la causa raíz', 'Usar los «5 porqués» con las personas que hacen el trabajo.', 'Jefe de área', '[Formato o registro de acciones correctivas]'),
        p('Definir y ejecutar acciones', 'Acciones que eliminen la causa, con responsable y fecha.', 'Jefe de área'),
        p('¿La acción fue eficaz?', 'Después de [1 a 3] meses verificar con datos que el problema no se repitió.', 'Jefe de Calidad', '[Formato o registro de acciones correctivas]', { decision: true, siNo: 'Volver al análisis de causa: la causa encontrada no era la raíz.' }),
        p('Cerrar y actualizar documentos', 'Si la acción cambió la forma de trabajar, actualizar el procedimiento correspondiente.', 'Jefe de Calidad'),
      ],
    },
  },
  {
    clave: 'auditoria-interna', grupo: 'base', tipo: 'procedimiento', area: 'Calidad', titulo: 'Auditoría interna',
    clausula: '9.2', porque: 'La norma exige auditar el propio sistema al menos una vez al año antes de la auditoría de certificación.',
    responsable: 'Jefe de Calidad', dirigido: [],
    contenido: {
      objetivo: 'Establecer cómo se planean y hacen las auditorías internas para comprobar que Feisen cumple sus propios procedimientos y la norma ISO 9001.',
      alcance: 'Aplica a todos los procesos del sistema de gestión. Empieza con el programa anual de auditorías y termina con el cierre de los hallazgos.',
      responsables: [
        { cargo: 'Jefe de Calidad', responsabilidad: 'Elabora el programa anual y coordina las auditorías.' },
        { cargo: 'Auditor interno', responsabilidad: 'Audita procesos distintos al suyo y reporta los hallazgos. [Persona capacitada o consultor externo].' },
        { cargo: 'Jefe de área', responsabilidad: 'Atiende la auditoría y cierra sus hallazgos.' },
      ],
      pasos: [
        p('Programar las auditorías del año', 'Definir qué procesos se auditan y en qué mes; todos al menos una vez al año.', 'Jefe de Calidad', 'Programa anual de auditoría'),
        p('Preparar la auditoría', 'Revisar los procedimientos del proceso y preparar las preguntas.', 'Auditor interno', 'Lista de verificación'),
        p('Auditar', 'Entrevistar, observar el trabajo y revisar registros. Buscar evidencias, no opiniones.', 'Auditor interno', 'Lista de verificación'),
        p('Reportar hallazgos', 'Entregar el informe con no conformidades y oportunidades de mejora.', 'Auditor interno', 'Informe de auditoría'),
        p('Cerrar hallazgos', 'Cada no conformidad abre una acción correctiva.', 'Jefe de área', 'Acción correctiva'),
      ],
    },
  },
  {
    clave: 'revision-direccion', grupo: 'base', tipo: 'procedimiento', area: 'Gerencia', titulo: 'Revisión por la dirección',
    clausula: '9.3', porque: 'La norma exige que la gerencia revise, con datos, si el sistema funciona y decida mejoras.',
    responsable: 'Gerente General', dirigido: ['JEFE_FUNDICION', 'JEFE_MECANIZADOS', 'JEFE_ENSAMBLE', 'LOGISTICA', 'RRHH'],
    contenido: {
      objetivo: 'Establecer cómo la gerencia revisa periódicamente los resultados del sistema de gestión de calidad y decide las mejoras y recursos necesarios.',
      alcance: 'Aplica a todo el sistema de gestión. Empieza con la preparación de la información y termina con el acta de decisiones y su seguimiento.',
      responsables: [
        { cargo: 'Gerente General', responsabilidad: 'Dirige la revisión y toma las decisiones.' },
        { cargo: 'Jefe de Calidad', responsabilidad: 'Prepara la información y redacta el acta.' },
        { cargo: 'Jefes de área', responsabilidad: 'Presentan los resultados de su proceso.' },
      ],
      pasos: [
        p('Preparar la información', 'Reunir: resultados de objetivos, quejas de clientes, no conformidades, auditorías, proveedores y acciones pendientes.', 'Jefe de Calidad', '[Presentación de resultados]'),
        p('Hacer la reunión', 'Cada [6 meses / año] revisar los resultados con los jefes de área.', 'Gerente General'),
        p('Decidir', 'Definir mejoras, cambios, recursos y nuevos objetivos.', 'Gerente General', 'Acta de revisión por la dirección'),
        p('Hacer seguimiento', 'Revisar el avance de las decisiones en las reuniones de gerencia.', 'Jefe de Calidad', 'Acta de revisión por la dirección'),
      ],
    },
  },
  {
    clave: 'competencia', grupo: 'base', tipo: 'procedimiento', area: 'Recursos Humanos', titulo: 'Competencia, formación y toma de conciencia',
    clausula: '7.2 · 7.3', porque: 'La norma pide demostrar que cada persona sabe hacer su trabajo y conoce los documentos de su cargo.',
    responsable: 'Coordinador de Recursos Humanos', dirigido: ['RRHH', 'JEFE_FUNDICION', 'JEFE_MECANIZADOS', 'JEFE_ENSAMBLE', 'LOGISTICA'],
    contenido: {
      objetivo: 'Establecer cómo se define lo que debe saber cada cargo, cómo se capacita al personal y cómo se verifica que la formación fue eficaz.',
      alcance: 'Aplica a todo el personal de Feisen. Empieza con el perfil del cargo y termina con la evaluación de la formación.',
      responsables: [
        { cargo: 'Coordinador de Recursos Humanos', responsabilidad: 'Mantiene los perfiles de cargo, el plan de formación y sus registros.' },
        { cargo: 'Jefe de área', responsabilidad: 'Identifica qué le falta a cada persona y entrena en el puesto.' },
      ],
      pasos: [
        p('Definir el perfil del cargo', 'Educación, experiencia y habilidades requeridas, en la ficha del cargo en la app.', 'Coordinador de Recursos Humanos', 'Ficha de cargo en la app'),
        p('Hacer la inducción', 'Al ingresar: empresa, seguridad, procedimientos del cargo (que debe confirmar como leídos en la app).', 'Coordinador de Recursos Humanos', 'Lista de asistencia a capacitación'),
        p('Entrenar en el puesto', 'El jefe o un compañero experto enseña la tarea con el instructivo.', 'Jefe de área', 'Lista de asistencia a capacitación'),
        p('¿La persona ya hace bien la tarea?', 'Observar a la persona trabajando y revisar la calidad de lo que produce.', 'Jefe de área', 'Evaluación de desempeño en la app', { decision: true, siNo: 'Repetir el entrenamiento y volver a evaluar en [1 mes].' }),
        p('Planear la formación del año', 'Con base en las evaluaciones de desempeño, programar las capacitaciones.', 'Coordinador de Recursos Humanos', '[Plan anual de formación]'),
      ],
    },
  },
  // ---------------- Procesos ----------------
  {
    clave: 'compras', grupo: 'procesos', tipo: 'procedimiento', area: 'Logística y compras', titulo: 'Compras y evaluación de proveedores',
    clausula: '8.4', porque: 'La norma exige controlar a los proveedores: lo que compramos afecta directamente la calidad de la máquina.',
    responsable: 'Coordinador de Logística', dirigido: ['LOGISTICA', 'ALMACENISTA'],
    contenido: {
      objetivo: 'Establecer cómo se solicitan, aprueban y realizan las compras, y cómo se seleccionan y evalúan los proveedores.',
      alcance: 'Aplica a todas las compras de materia prima, insumos, repuestos y servicios que afectan el producto. Empieza con el pedido interno y termina con la evaluación del proveedor.',
      responsables: [
        { cargo: 'Jefe de área', responsabilidad: 'Solicita lo que necesita con un pedido interno en la app.' },
        { cargo: 'Coordinador de Logística', responsabilidad: 'Cotiza, genera la orden de compra y evalúa a los proveedores.' },
        { cargo: 'Gerente General', responsabilidad: 'Aprueba las compras mayores a [monto].' },
      ],
      pasos: [
        p('Solicitar la compra', 'Crear el pedido interno en la app con cantidad y fecha requerida.', 'Jefe de área', 'Pedido interno en la app'),
        p('Cotizar', 'Pedir al menos [2] cotizaciones para compras nuevas o mayores a [monto].', 'Coordinador de Logística', 'Cotizaciones'),
        p('¿Requiere aprobación de gerencia?', 'Compras mayores a [monto] o con proveedores nuevos.', 'Coordinador de Logística', '', { decision: true, siNo: 'Generar la orden de compra directamente.' }),
        p('Generar la orden de compra', 'Crear la OC en la app y enviarla al proveedor.', 'Coordinador de Logística', 'Orden de compra en la app'),
        p('Hacer seguimiento a la entrega', 'Confirmar fecha de entrega y avisar a bodega.', 'Coordinador de Logística'),
        p('Evaluar al proveedor', 'Cada [6 meses] calificar calidad, cumplimiento y precio de los proveedores principales.', 'Coordinador de Logística', '[Evaluación de proveedores]'),
      ],
      registros: [
        { nombre: 'Pedidos internos y órdenes de compra', responsable: 'Coordinador de Logística', donde: 'App Feisen (Compras)', tiempo: 'Indefinido' },
        { nombre: 'Evaluación de proveedores', responsable: 'Coordinador de Logística', donde: '[Carpeta de compras]', tiempo: '2 años' },
      ],
    },
  },
  {
    clave: 'recepcion', grupo: 'procesos', tipo: 'procedimiento', area: 'Inventarios', titulo: 'Recepción e inspección de materia prima',
    clausula: '8.4.2 · 8.6', porque: 'Detectar el material malo en la puerta es mucho más barato que encontrarlo en una máquina terminada.',
    responsable: 'Almacenista', dirigido: ['ALMACENISTA', 'LOGISTICA'],
    contenido: {
      objetivo: 'Establecer cómo se reciben, inspeccionan y almacenan las materias primas e insumos que llegan a la planta, para que a producción solo pase material que cumple.',
      alcance: 'Aplica a toda materia prima e insumo que llega a las bodegas de Feisen. Empieza cuando el proveedor entrega el material y termina cuando queda almacenado o devuelto al proveedor.',
      responsables: [
        { cargo: 'Almacenista', responsabilidad: 'Recibe el material, verifica cantidades y lo registra en la app.' },
        { cargo: 'Jefe de Calidad', responsabilidad: 'Inspecciona el material crítico y decide si se acepta.' },
        { cargo: 'Coordinador de Logística', responsabilidad: 'Gestiona la devolución con el proveedor cuando el material no cumple.' },
      ],
      pasos: [
        p('Recibir el material', 'Pedir la remisión y buscar la orden de compra en la app.', 'Almacenista', 'Remisión del proveedor'),
        p('Verificar cantidades', 'Contar o pesar y comparar contra la orden de compra.', 'Almacenista', 'Formato de inspección de recepción'),
        p('¿El material cumple?', 'Revisar medidas, estado y certificados. [Lista de materiales críticos que siempre se inspeccionan].', 'Jefe de Calidad', 'Formato de inspección de recepción', { decision: true, siNo: 'Separar el material, marcarlo NO CONFORME, registrar la no conformidad y avisar a Logística para la devolución.' }),
        p('Registrar la entrada', 'Registrar la entrada en la app para que sume al inventario.', 'Almacenista', 'Movimiento de entrada en la app'),
        p('Almacenar', 'Ubicarlo en su lugar, identificado.', 'Almacenista'),
      ],
      seguridad: 'Usar botas de seguridad, guantes y casco al descargar. Cargas de más de 25 kg se mueven con montacargas o entre dos personas.',
      registros: [
        { nombre: 'Formato de inspección de recepción', responsable: 'Jefe de Calidad', donde: '[Carpeta de calidad]', tiempo: '2 años' },
        { nombre: 'Movimientos de entrada', responsable: 'Almacenista', donde: 'App Feisen (Inventario)', tiempo: 'Indefinido' },
      ],
    },
  },
  {
    clave: 'fundicion', grupo: 'procesos', tipo: 'procedimiento', area: 'Fundición', titulo: 'Producción en fundición',
    clausula: '8.5.1', porque: 'La norma pide que la producción se haga en condiciones controladas: mismas instrucciones, mismos controles, mismos registros.',
    responsable: 'Jefe de Fundición', dirigido: ['JEFE_FUNDICION', 'OPERARIO'],
    contenido: {
      objetivo: 'Establecer cómo se programan, moldean, funden, desmoldean e inspeccionan las piezas fundidas en hierro y aluminio.',
      alcance: 'Aplica a todas las piezas que se funden en la planta. Empieza con la orden de moldeo y termina cuando las piezas inspeccionadas pasan a mecanizado o a bodega.',
      responsables: [
        { cargo: 'Jefe de Fundición', responsabilidad: 'Programa la producción, controla el proceso y libera las piezas.' },
        { cargo: 'Moldeador', responsabilidad: 'Prepara la arena y elabora los moldes según el instructivo.' },
        { cargo: 'Fundidor', responsabilidad: 'Prepara la carga del horno y hace la colada.' },
      ],
      recursos: ['[Horno de fundición]', 'Modelos y cajas de moldeo', 'Pirómetro', '[Instructivo de preparación de arena]'],
      pasos: [
        p('Programar la producción', 'Crear la orden de moldeo en la app según las OF pendientes.', 'Jefe de Fundición', 'Orden de moldeo en la app'),
        p('Preparar la arena y los moldes', 'Seguir el instructivo de preparación de arena y moldeo.', 'Moldeador', 'Avance de moldeo en la app'),
        p('Preparar la carga del horno', 'Pesar chatarra, lingote y aditivos según la receta.', 'Fundidor', 'Fundida en la app'),
        p('¿La temperatura de colada es la correcta?', 'Medir con el pirómetro: hierro [1.380–1.420 °C], aluminio [700–750 °C].', 'Fundidor', 'Control de temperatura de colada', { decision: true, siNo: 'Esperar o ajustar el horno; no colar fuera de rango.' }),
        p('Colar', 'Llenar los moldes de forma continua.', 'Fundidor'),
        p('Desmoldear y limpiar', 'Esperar el tiempo de enfriamiento, desmoldear, cortar sistemas de alimentación y limpiar.', 'Moldeador', 'Recogida en la app'),
        p('¿La pieza está bien?', 'Inspección visual de porosidad, rechupes y medidas críticas.', 'Jefe de Fundición', 'Recogida en la app', { decision: true, siNo: 'Separar como no conforme y registrarla; si se repite, analizar la causa.' }),
      ],
      seguridad: 'Careta, chaqueta y polainas de cuero, guantes de carnaza y botas de seguridad para fundir y colar. Nadie sin protección dentro del área de colada. Moldes y herramientas secos: el agua con metal fundido explota.',
      registros: [
        { nombre: 'Órdenes de moldeo, fundidas y recogidas', responsable: 'Jefe de Fundición', donde: 'App Feisen (Fundición)', tiempo: 'Indefinido' },
        { nombre: 'Control de temperatura de colada', responsable: 'Fundidor', donde: '[Carpeta de fundición]', tiempo: '1 año' },
      ],
    },
  },
  {
    clave: 'mecanizado', grupo: 'procesos', tipo: 'procedimiento', area: 'Mecanizados', titulo: 'Producción en mecanizado',
    clausula: '8.5.1 · 8.6', porque: 'Controlar medidas en el mecanizado evita que el problema aparezca recién en ensamble.',
    responsable: 'Jefe de Mecanizados', dirigido: ['JEFE_MECANIZADOS', 'OPERARIO'],
    contenido: {
      objetivo: 'Establecer cómo se programan, mecanizan y verifican las piezas para que cumplan las medidas de los planos.',
      alcance: 'Aplica a todas las piezas mecanizadas en la planta. Empieza cuando llegan las piezas fundidas o la barra y termina cuando las piezas verificadas pasan a ensamble o a bodega.',
      responsables: [
        { cargo: 'Jefe de Mecanizados', responsabilidad: 'Programa el trabajo, entrega planos y verifica la primera pieza.' },
        { cargo: 'Operario de mecanizado', responsabilidad: 'Mecaniza según el plano y mide las piezas.' },
      ],
      recursos: ['Planos de las piezas', 'Calibrador pie de rey', 'Micrómetro', '[Máquinas: tornos, fresadora, taladros]'],
      pasos: [
        p('Recibir el material', 'Aprobar la transferencia de piezas fundidas en la app.', 'Jefe de Mecanizados', 'Transferencia en la app'),
        p('Preparar la máquina', 'Montar herramientas y programa según el plano.', 'Operario de mecanizado'),
        p('¿La primera pieza cumple?', 'Medir todas las cotas de la primera pieza contra el plano.', 'Jefe de Mecanizados', '[Registro de primera pieza]', { decision: true, siNo: 'Ajustar la máquina y repetir la primera pieza antes de producir la serie.' }),
        p('Mecanizar la serie', 'Medir cada [10] piezas las cotas críticas.', 'Operario de mecanizado'),
        p('Registrar lo producido', 'Registrar en la app las piezas buenas y las rechazadas.', 'Operario de mecanizado', 'Registro de mecanizado en la app'),
      ],
      seguridad: 'Gafas de seguridad, botas con puntera y protección auditiva. Sin guantes, anillos ni ropa suelta cerca de piezas que giran. Guardas siempre puestas.',
      registros: [{ nombre: 'Registro de mecanizado', responsable: 'Operario de mecanizado', donde: 'App Feisen (Mecanizados)', tiempo: 'Indefinido' }],
    },
  },
  {
    clave: 'ensamble', grupo: 'procesos', tipo: 'procedimiento', area: 'Ensamble', titulo: 'Ensamble y prueba final',
    clausula: '8.5.1 · 8.6', porque: 'La prueba final es la última oportunidad de encontrar un problema antes de que lo encuentre el cliente.',
    responsable: 'Jefe de Ensamble', dirigido: ['JEFE_ENSAMBLE', 'OPERARIO'],
    contenido: {
      objetivo: 'Establecer cómo se ensamblan y prueban los equipos para entregar al cliente solo máquinas que funcionan correctamente.',
      alcance: 'Aplica a todos los equipos que se ensamblan en la planta. Empieza con la orden de ensamble y termina cuando el equipo probado queda listo para despacho.',
      responsables: [
        { cargo: 'Jefe de Ensamble', responsabilidad: 'Programa el ensamble, hace la prueba final y libera el equipo.' },
        { cargo: 'Ensamblador', responsabilidad: 'Arma el equipo según la receta y el instructivo.' },
      ],
      pasos: [
        p('Crear la orden de ensamble', 'Crear la orden en la app; el kit de piezas sale de bodega según la receta.', 'Jefe de Ensamble', 'Orden de ensamble en la app'),
        p('Ensamblar', 'Seguir el instructivo de ensamble del modelo, con los torques indicados.', 'Ensamblador'),
        p('¿El equipo pasa la prueba?', 'Encender y probar [tiempo] minutos: arranque, ruido, vibración, fugas y funciones.', 'Jefe de Ensamble', '[Protocolo de prueba final]', { decision: true, siNo: 'Corregir la falla, registrarla como no conformidad si es de una pieza, y repetir la prueba.' }),
        p('Registrar el serial', 'Asociar el serial del motor y del equipo en la app.', 'Jefe de Ensamble', 'Seriales en la app'),
        p('Liberar para despacho', 'Marcar la orden como terminada y entregar a bodega.', 'Jefe de Ensamble', 'Orden de ensamble en la app'),
      ],
      registros: [
        { nombre: 'Órdenes de ensamble y seriales', responsable: 'Jefe de Ensamble', donde: 'App Feisen (Ensamble)', tiempo: 'Indefinido' },
        { nombre: 'Protocolo de prueba final', responsable: 'Jefe de Ensamble', donde: '[Carpeta de ensamble]', tiempo: '[Tiempo de garantía + 1 año]' },
      ],
    },
  },
  {
    clave: 'ventas', grupo: 'procesos', tipo: 'procedimiento', area: 'Ventas', titulo: 'Atención de pedidos y quejas de clientes',
    clausula: '8.2 · 9.1.2', porque: 'La norma pide revisar que se puede cumplir antes de comprometerse y escuchar lo que dice el cliente.',
    responsable: 'Jefe de Ventas', dirigido: ['JEFE_VENTAS', 'COMERCIAL', 'DESPACHOS'],
    contenido: {
      objetivo: 'Establecer cómo se reciben y confirman los pedidos de los clientes y cómo se atienden sus quejas y reclamos.',
      alcance: 'Aplica a todos los pedidos y quejas de clientes. Empieza cuando el cliente pide o reclama y termina con la entrega o la respuesta al cliente.',
      responsables: [
        { cargo: 'Asesor comercial', responsabilidad: 'Recibe el pedido y crea la orden de fabricación en la app.' },
        { cargo: 'Jefe de Ventas', responsabilidad: 'Confirma fechas con producción y atiende las quejas.' },
        { cargo: 'Despachos', responsabilidad: 'Entrega los equipos y registra las entregas.' },
      ],
      pasos: [
        p('Recibir el pedido', 'Confirmar modelo, cantidad, precio, forma de pago y fecha esperada.', 'Asesor comercial', 'Orden de fabricación en la app'),
        p('¿Se puede cumplir la fecha?', 'Revisar inventario y capacidad de producción.', 'Jefe de Ventas', '', { decision: true, siNo: 'Acordar con el cliente una nueva fecha antes de confirmar.' }),
        p('Confirmar al cliente', 'Enviar la confirmación con fecha de entrega.', 'Asesor comercial'),
        p('Entregar', 'Despachar y registrar la entrega en la OF.', 'Despachos', 'Entregas en la app'),
        p('Atender quejas', 'Registrar la queja, responder en menos de [5] días hábiles y abrir acción correctiva si es grave o repetida.', 'Jefe de Ventas', '[Registro de quejas]'),
      ],
    },
  },
  {
    clave: 'mantenimiento', grupo: 'procesos', tipo: 'procedimiento', area: 'Mantenimiento', titulo: 'Mantenimiento de equipos',
    clausula: '7.1.3', porque: 'La norma pide mantener la infraestructura; una máquina parada o descalibrada produce piezas malas.',
    responsable: 'Jefe de Mantenimiento', dirigido: ['JEFE_FUNDICION', 'JEFE_MECANIZADOS', 'JEFE_ENSAMBLE'],
    contenido: {
      objetivo: 'Establecer cómo se planea y hace el mantenimiento preventivo y correctivo de los equipos de la planta.',
      alcance: 'Aplica a todos los equipos de producción registrados en la app. Empieza con el plan preventivo o el reporte de una falla y termina cuando el equipo vuelve a operar.',
      responsables: [
        { cargo: 'Jefe de Mantenimiento', responsabilidad: 'Mantiene el plan preventivo y atiende las órdenes de trabajo.' },
        { cargo: 'Jefe de área', responsabilidad: 'Reporta las fallas en la app y entrega el equipo para el mantenimiento.' },
      ],
      pasos: [
        p('Registrar los equipos y su plan', 'Crear la ficha de cada equipo con su plan preventivo en la app.', 'Jefe de Mantenimiento', 'Fichas de equipo en la app'),
        p('Hacer el preventivo', 'La app genera las órdenes 7 días antes; ejecutarlas y cerrarlas.', 'Jefe de Mantenimiento', 'Órdenes de trabajo en la app'),
        p('Reportar fallas', 'Reportar la falla en la app, indicando si el equipo quedó parado.', 'Jefe de área', 'Reporte de falla en la app'),
        p('Reparar', 'Diagnosticar, reparar y registrar repuestos y tiempos.', 'Jefe de Mantenimiento', 'Órdenes de trabajo en la app'),
        p('¿El equipo quedó funcionando bien?', 'Probar el equipo con el jefe del área antes de cerrar la orden.', 'Jefe de área', '', { decision: true, siNo: 'Dejar la orden abierta y continuar la reparación.' }),
      ],
    },
  },
  {
    clave: 'calibracion', grupo: 'procesos', tipo: 'procedimiento', area: 'Calidad', titulo: 'Control de instrumentos de medición',
    clausula: '7.1.5', porque: 'Si el calibrador mide mal, todas las inspecciones están mal. La norma exige demostrar que los instrumentos miden bien.',
    responsable: 'Jefe de Calidad', dirigido: ['JEFE_MECANIZADOS', 'JEFE_FUNDICION', 'JEFE_ENSAMBLE'],
    contenido: {
      objetivo: 'Establecer cómo se identifican, calibran o verifican y cuidan los instrumentos de medición usados para aceptar o rechazar producto.',
      alcance: 'Aplica a calibradores, micrómetros, pirómetros, básculas y demás instrumentos usados en inspección. Empieza con el inventario de instrumentos y termina con su calibración vigente.',
      responsables: [{ cargo: 'Jefe de Calidad', responsabilidad: 'Mantiene el inventario de instrumentos y programa la calibración.' }, { cargo: 'Jefe de área', responsabilidad: 'Cuida los instrumentos de su área y reporta daños.' }],
      pasos: [
        p('Inventariar los instrumentos', 'Listar cada instrumento con código, área y frecuencia de calibración.', 'Jefe de Calidad', '[Inventario de instrumentos]'),
        p('Calibrar o verificar', 'Enviar a laboratorio [acreditado] o verificar con patrones según la frecuencia.', 'Jefe de Calidad', 'Certificados de calibración'),
        p('¿El instrumento está dentro de tolerancia?', 'Revisar el certificado contra el error máximo permitido.', 'Jefe de Calidad', 'Certificados de calibración', { decision: true, siNo: 'Retirarlo de uso, marcarlo FUERA DE SERVICIO y revisar si lo medido con él desde la última calibración sigue siendo válido.' }),
        p('Identificar el estado', 'Poner etiqueta con fecha de la próxima calibración.', 'Jefe de Calidad'),
      ],
    },
  },
  {
    clave: 'instructivo-horno', grupo: 'procesos', tipo: 'instructivo', area: 'Fundición', titulo: 'Operación segura del horno de fundición',
    clausula: '8.5.1', porque: 'Es la tarea de mayor riesgo de la planta: un instructivo claro protege a las personas y la calidad de la colada.',
    responsable: 'Jefe de Fundición', dirigido: ['JEFE_FUNDICION', 'OPERARIO'],
    contenido: {
      objetivo: 'Explicar cómo se enciende, carga, opera y apaga el horno de fundición de forma segura.',
      alcance: 'Aplica al horno [tipo/identificación] del área de Fundición. Empieza con la revisión previa al encendido y termina con el apagado y la limpieza.',
      epp: ['Careta de fundición', 'Chaqueta, polainas y guantes de cuero', 'Botas de seguridad con puntera', 'Casco'],
      recursos: ['Pirómetro', 'Cucharas de colada precalentadas', 'Herramientas secas'],
      pasos: [
        p('Revisar el horno antes de encender', 'Revisar el refractario, [el sistema de enfriamiento] y que no haya humedad en el área.', 'Fundidor', 'Lista de chequeo del horno'),
        p('Encender', '[Secuencia de encendido del horno].', 'Fundidor'),
        p('Cargar el material', 'Cargar seco y precalentado, sin tubos cerrados ni recipientes que atrapen agua.', 'Fundidor'),
        p('¿Llegó a la temperatura de colada?', 'Medir con el pirómetro.', 'Fundidor', 'Control de temperatura de colada', { decision: true, siNo: 'Seguir calentando; no sacar metal fuera de rango.' }),
        p('Apagar y limpiar', '[Secuencia de apagado] y limpiar el área al terminar.', 'Fundidor'),
      ],
      seguridad: 'Nunca introducir herramientas o material húmedo. Nadie sin protección completa a menos de [3] metros del horno durante la colada. En caso de derrame, alejarse y no usar agua.',
    },
  },
  // ---------------- Formatos ----------------
  {
    clave: 'formato-recepcion', grupo: 'formatos', tipo: 'formato', area: 'Inventarios', titulo: 'Inspección de recepción de materia prima',
    clausula: '8.6', porque: 'Es la evidencia de que el material se revisó al llegar; la pide el procedimiento de recepción.',
    responsable: 'Jefe de Calidad', dirigido: ['ALMACENISTA'],
    contenido: {
      proposito: 'Registrar la inspección de cada lote de materia prima que llega. Lo llena el Jefe de Calidad o el Almacenista cada vez que se recibe material crítico.',
      encabezado: ['Fecha', 'Proveedor', 'N.º de orden de compra', 'Remisión'],
      columnas: [{ nombre: 'Material' }, { nombre: 'Cantidad pedida' }, { nombre: 'Cantidad recibida' }, { nombre: 'Estado / medidas' }, { nombre: 'Cumple (Sí/No)' }, { nombre: 'Observación' }],
      filas: '12',
      instrucciones: ['Llenar un formato por cada remisión.', 'Si algo no cumple, escribir el motivo en Observación y avisar a Logística.'],
      firmas: ['Recibió (Almacenista)', 'Inspeccionó (Jefe de Calidad)'],
    },
  },
  {
    clave: 'formato-temperatura', grupo: 'formatos', tipo: 'formato', area: 'Fundición', titulo: 'Control de temperatura de colada',
    clausula: '8.5.1', porque: 'Demuestra que cada colada se hizo dentro del rango de temperatura definido.',
    responsable: 'Jefe de Fundición', dirigido: ['JEFE_FUNDICION'],
    contenido: {
      proposito: 'Registrar la temperatura de cada colada. Lo llena el fundidor en cada fundida.',
      encabezado: ['Fecha', 'Turno', 'Metal (hierro / aluminio)', 'Fundidor'],
      columnas: [{ nombre: 'Hora' }, { nombre: 'N.º de colada' }, { nombre: 'Temperatura (°C)' }, { nombre: 'Dentro de rango (Sí/No)' }, { nombre: 'Moldes llenados' }, { nombre: 'Observación' }],
      filas: '15',
      instrucciones: ['Rango hierro: [1.380–1.420 °C]. Rango aluminio: [700–750 °C].', 'Si está fuera de rango, no colar y avisar al Jefe de Fundición.'],
      firmas: ['Fundidor', 'Jefe de Fundición'],
    },
  },
  {
    clave: 'formato-asistencia', grupo: 'formatos', tipo: 'formato', area: 'Recursos Humanos', titulo: 'Lista de asistencia a capacitación',
    clausula: '7.2', porque: 'Es la evidencia de la formación que pide la norma (y la que piden en una auditoría de seguridad y salud en el trabajo).',
    responsable: 'Coordinador de Recursos Humanos', dirigido: ['RRHH'],
    contenido: {
      proposito: 'Registrar quién asistió a cada capacitación, inducción o charla. Lo llena quien dicta la capacitación.',
      encabezado: ['Fecha', 'Tema', 'Capacitador', 'Duración (horas)'],
      columnas: [{ nombre: 'Nombre' }, { nombre: 'Cédula' }, { nombre: 'Cargo' }, { nombre: 'Firma' }],
      filas: '20',
      instrucciones: ['Cada asistente firma personalmente.', 'Adjuntar la evaluación de la capacitación si se hizo.'],
      firmas: ['Capacitador', 'Coordinador de Recursos Humanos'],
    },
  },
]
