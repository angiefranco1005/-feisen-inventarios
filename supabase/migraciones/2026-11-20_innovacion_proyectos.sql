-- ============================================================
-- Innovación y Diseño: proyectos que se presentan a gerencia
-- Fecha: 2026-11-20 — re-ejecutable
-- ============================================================
-- Sigue el «Formato de proyecto — Innovación y Diseño» aprobado por Angie el 2026-11-20:
-- datos generales, problema, solución, mercado, costos y retorno, cronograma y recursos,
-- riesgos, puntaje de priorización, decisión de gerencia y seguimiento mensual.
-- Por ahora SOLO ADMIN (pedido de Angie). Cuando el jefe de Innovación tenga rol propio
-- se abre con rol_permisos / mi_nivel como los demás módulos.
--
-- Listas variables (rubros de costo, fases, recursos, riesgos, calificaciones) van en jsonb:
-- son pocas filas por proyecto y siempre se leen y guardan con el proyecto completo.
-- El seguimiento mensual va en tabla aparte porque crece con el tiempo.

CREATE TABLE IF NOT EXISTS public.innovacion_proyectos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        text NOT NULL UNIQUE,                         -- PI-0001
  nombre        text NOT NULL,
  tipo          text NOT NULL DEFAULT 'producto_nuevo'
                CHECK (tipo IN ('producto_nuevo','mejora_maquina','rediseno','mejora_proceso')),
  area          text,                                         -- Fundición, Mecanizados, Ensamble, Motores, Otra
  responsable   text,
  fecha_presentacion date,
  decision_pedida text NOT NULL DEFAULT 'aprobar'
                CHECK (decision_pedida IN ('aprobar','priorizar','avance')),
  resumen       text,
  estado        text NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador','presentado','aprobado','aprobado_ajustes','aplazado','rechazado','en_curso','cerrado')),

  -- 2–4. Problema, solución, mercado
  problema      text,
  solucion      text,
  indicador_meta text,                                        -- cómo sabremos que funcionó
  mercado       text,

  -- 5. Costos y retorno
  costos        jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{rubro, detalle, valor}]
  beneficio_mensual numeric,                                  -- COP
  costo_unitario    numeric,                                  -- COP, si es producto
  precio_venta      numeric,                                  -- COP, si es producto
  ficha_costo_id uuid REFERENCES public.costeo_fichas(id) ON DELETE SET NULL,

  -- 6–7. Cronograma, recursos, riesgos
  fases         jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{fase, entregable, inicio, fin, responsable}]
  recursos      jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{recurso, cantidad, area, disponible}]
  riesgos       jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{riesgo, probabilidad, impacto, mitigacion}]

  -- 8–9. Priorización y decisión de gerencia
  calificaciones jsonb NOT NULL DEFAULT '{}'::jsonb,          -- {retorno, estrategia, urgencia, riesgo, capacidad}: 1–5
  monto_aprobado numeric,
  condiciones    text,
  proxima_revision date,
  decidido_por   uuid REFERENCES public.profiles(id),
  decidido_at    timestamptz,

  creado_por    uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 10. Seguimiento de avance (una fila por revisión mensual)
CREATE TABLE IF NOT EXISTS public.innovacion_avances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id   uuid NOT NULL REFERENCES public.innovacion_proyectos(id) ON DELETE CASCADE,
  fecha         date NOT NULL DEFAULT current_date,
  fase          text,
  avance_pct    numeric CHECK (avance_pct BETWEEN 0 AND 100),
  gasto_real    numeric,                                      -- COP acumulado
  presupuesto_fecha numeric,                                  -- COP a la fecha
  semaforo      text CHECK (semaforo IN ('verde','amarillo','rojo')),
  bloqueos      text,
  creado_por    uuid REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS innovacion_avances_proyecto_idx ON public.innovacion_avances(proyecto_id, fecha DESC);

-- Solo ADMIN
ALTER TABLE public.innovacion_proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovacion_avances   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS innovacion_proyectos_admin ON public.innovacion_proyectos;
CREATE POLICY innovacion_proyectos_admin ON public.innovacion_proyectos FOR ALL
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');
DROP POLICY IF EXISTS innovacion_avances_admin ON public.innovacion_avances;
CREATE POLICY innovacion_avances_admin ON public.innovacion_avances FOR ALL
  USING (public.get_my_rol() = 'ADMIN') WITH CHECK (public.get_my_rol() = 'ADMIN');
