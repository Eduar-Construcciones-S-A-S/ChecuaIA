-- Tarifa de acceso a la Mina de Sal para visitantes extranjeros
-- 14.000 COP por participante; no modifica retroactivamente reservas existentes.
ALTER TABLE public.reserva
 ADD COLUMN IF NOT EXISTS recargo_mina_extranjeros numeric(12,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS cantidad_extranjeros_mina integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.reserva.recargo_mina_extranjeros IS 'Recargo de ingreso a la Mina de Sal: $14.000 COP por visitante extranjero, incluido en valor_total.';
COMMENT ON COLUMN public.reserva.cantidad_extranjeros_mina IS 'Participantes extranjeros para plan con ingreso a la Mina de Sal.';

CREATE OR REPLACE FUNCTION public.recalcular_recargo_mina_extranjeros(p_reserva_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reserva RECORD;
  v_incluye_mina boolean;
  v_numero integer;
  v_importe numeric(12,2);
  v_texto text;
BEGIN
  SELECT r.id_reserva, r.mina, r.valor_total, r.recargo_mina_extranjeros,
    p.nombre_plan, p.descripcion_basica, p.descripcion_detallada
    INTO v_reserva
  FROM public.reserva r
  JOIN public.plan p ON p.id_plan = r.id_plan
  WHERE r.id_reserva = p_reserva_id
  FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN; END IF;

  v_texto := coalesce(v_reserva.descripcion_detallada,'');
  v_incluye_mina :=
    coalesce(v_reserva.mina,false)
    OR coalesce(v_reserva.nombre_plan,'') ~* '[[:<:]]mina[[:>:]]'
    OR v_texto ~* '(ingreso|visita|acceso|entrada|recorrido)[^\n.]{0,65}[[:<:]]mina[[:>:]]'
    OR coalesce(v_reserva.descripcion_basica,'') ~* '(ingreso|visita|acceso|entrada|recorrido)[^\n.]{0,65}[[:<:]]mina[[:>:]]';

  SELECT count(*)::int INTO v_numero FROM public.participante x
  WHERE x.id_reserva = p_reserva_id
    AND nullif(btrim(coalesce(x.nacionalidad,'')), '') IS NOT NULL
    AND lower(btrim(x.nacionalidad)) NOT IN ('colombia','colombiano','colombiana','co','col');
  IF NOT v_incluye_mina THEN v_numero := 0; END IF;
  v_importe := (v_numero * 14000)::numeric(12,2);

  IF v_importe IS DISTINCT FROM v_reserva.recargo_mina_extranjeros
     OR v_numero IS DISTINCT FROM coalesce((
       SELECT cantidad_extranjeros_mina FROM public.reserva WHERE id_reserva=p_reserva_id
     ),0) THEN
    UPDATE public.reserva
    SET valor_total = greatest(0,coalesce(valor_total,0) - coalesce(recargo_mina_extranjeros,0) + v_importe),
        recargo_mina_extranjeros = v_importe,
        cantidad_extranjeros_mina = v_numero
    WHERE id_reserva = p_reserva_id;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalcular_mina_por_participante()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_recargo_mina_extranjeros(OLD.id_reserva);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.id_reserva IS DISTINCT FROM NEW.id_reserva THEN
      PERFORM public.recalcular_recargo_mina_extranjeros(OLD.id_reserva);
    END IF;
    PERFORM public.recalcular_recargo_mina_extranjeros(NEW.id_reserva);
  ELSE
    PERFORM public.recalcular_recargo_mina_extranjeros(NEW.id_reserva);
  END IF;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalcular_mina_por_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.recalcular_recargo_mina_extranjeros(NEW.id_reserva);
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS trg_recargo_mina_por_participante ON public.participante;
CREATE TRIGGER trg_recargo_mina_por_participante AFTER INSERT OR UPDATE OR DELETE ON public.participante FOR EACH ROW EXECUTE FUNCTION public.trg_recalcular_mina_por_participante();
DROP TRIGGER IF EXISTS trg_recargo_mina_por_plan ON public.reserva;
CREATE TRIGGER trg_recargo_mina_por_plan AFTER UPDATE OF id_plan,mina ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.trg_recalcular_mina_por_plan();

REVOKE ALL ON FUNCTION public.recalcular_recargo_mina_extranjeros(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.trg_recalcular_mina_por_participante() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.trg_recalcular_mina_por_plan() FROM PUBLIC,anon,authenticated;
