-- Permite que ChecuaIA consulte la configuración de adicionales
-- y registre de forma segura la selección del cliente.
-- Ejecutar DESPUÉS de sql/adicionales_reservas.sql del proyecto pagina.admnins.

grant select on table public.adicional to anon;
grant select on table public.plan_adicional to anon;

drop policy if exists adicional_select_public_active on public.adicional;
create policy adicional_select_public_active
on public.adicional
for select
to anon
using (activo = true);

drop policy if exists plan_adicional_select_public_active on public.plan_adicional;
create policy plan_adicional_select_public_active
on public.plan_adicional
for select
to anon
using (
  activo = true
  and exists (
    select 1
    from public.adicional a
    where a.id_adicional = plan_adicional.id_adicional
      and a.activo = true
  )
);

create or replace function public.configurar_adicionales_reserva_publica(
  p_id_reserva integer,
  p_telefono_cliente text,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reserva public.reserva%rowtype;
  v_config record;
  v_item jsonb;
  v_people integer;
  v_max integer;
  v_selected integer;
  v_removed integer;
  v_price numeric(12,2);
  v_old_impact numeric(12,2) := 0;
  v_new_impact numeric(12,2) := 0;
  v_base_total numeric(12,2);
  v_final_total numeric(12,2);
  v_final_unit numeric(12,2);
  v_deposit numeric(12,2);
  v_incluye_almuerzo boolean := false;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La selección de adicionales debe ser un arreglo.';
  end if;

  select *
  into v_reserva
  from public.reserva
  where id_reserva = p_id_reserva
  for update;

  if not found then
    raise exception 'La reserva no existe.';
  end if;

  if coalesce(v_reserva.aprobado, false) then
    raise exception 'La reserva ya fue aprobada y no puede modificarse desde el formulario público.';
  end if;

  if regexp_replace(coalesce(v_reserva.telefono_cliente, ''), '\D', '', 'g')
     <> regexp_replace(coalesce(p_telefono_cliente, ''), '\D', '', 'g') then
    raise exception 'El teléfono no coincide con la reserva.';
  end if;

  v_people := greatest(1, coalesce(v_reserva.cantidad_personas, 1));

  select coalesce(sum(impacto_total), 0)
  into v_old_impact
  from public.reserva_adicional
  where id_reserva = p_id_reserva;

  v_base_total := greatest(0, coalesce(v_reserva.valor_total, 0) - v_old_impact);

  delete from public.reserva_adicional
  where id_reserva = p_id_reserva;

  for v_config in
    select
      pa.id_adicional,
      pa.modalidad,
      pa.permitir_quitar,
      coalesce(pa.precio_override, a.precio) as precio,
      a.codigo,
      a.nombre,
      a.tipo_cobro
    from public.plan_adicional pa
    join public.adicional a on a.id_adicional = pa.id_adicional
    where pa.id_plan = v_reserva.id_plan
      and pa.activo = true
      and a.activo = true
  loop
    v_max := case when v_config.tipo_cobro = 'por_persona' then v_people else 1 end;
    v_selected := null;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
      if nullif(v_item->>'id_adicional', '')::bigint = v_config.id_adicional then
        v_selected := nullif(v_item->>'cantidad', '')::integer;
        exit;
      end if;
    end loop;

    if v_selected is null then
      v_selected := case when v_config.modalidad = 'incluido' then v_max else 0 end;
    end if;

    v_selected := greatest(0, least(v_max, v_selected));
    if v_config.modalidad = 'incluido' and not v_config.permitir_quitar then
      v_selected := v_max;
    end if;

    v_price := greatest(0, coalesce(v_config.precio, 0));

    if v_config.codigo = 'almuerzo' and v_selected > 0 then
      v_incluye_almuerzo := true;
    end if;

    if v_config.modalidad = 'opcional' and v_selected > 0 then
      v_new_impact := v_new_impact + (v_price * v_selected);

      insert into public.reserva_adicional (
        id_reserva,
        id_adicional,
        codigo_adicional,
        nombre_adicional,
        tipo_cobro,
        tipo_movimiento,
        precio_unitario,
        cantidad_aplicada,
        impacto_total
      ) values (
        p_id_reserva,
        v_config.id_adicional,
        v_config.codigo,
        v_config.nombre,
        v_config.tipo_cobro,
        'agregado',
        v_price,
        v_selected,
        v_price * v_selected
      );
    elsif v_config.modalidad = 'incluido' then
      v_removed := v_max - v_selected;

      if v_removed > 0 and v_config.permitir_quitar then
        v_new_impact := v_new_impact - (v_price * v_removed);

        insert into public.reserva_adicional (
          id_reserva,
          id_adicional,
          codigo_adicional,
          nombre_adicional,
          tipo_cobro,
          tipo_movimiento,
          precio_unitario,
          cantidad_aplicada,
          impacto_total
        ) values (
          p_id_reserva,
          v_config.id_adicional,
          v_config.codigo,
          v_config.nombre,
          v_config.tipo_cobro,
          'retirado',
          v_price,
          v_removed,
          -(v_price * v_removed)
        );
      else
        insert into public.reserva_adicional (
          id_reserva,
          id_adicional,
          codigo_adicional,
          nombre_adicional,
          tipo_cobro,
          tipo_movimiento,
          precio_unitario,
          cantidad_aplicada,
          impacto_total
        ) values (
          p_id_reserva,
          v_config.id_adicional,
          v_config.codigo,
          v_config.nombre,
          v_config.tipo_cobro,
          'incluido',
          v_price,
          v_max,
          0
        );
      end if;
    end if;
  end loop;

  v_final_total := round(v_base_total + v_new_impact, 2);

  if v_final_total <= 0 then
    raise exception 'El valor final de la reserva no es válido.';
  end if;

  v_final_unit := round(v_final_total / v_people, 2);
  v_deposit := round(v_final_total * 0.30, 2);

  update public.reserva
  set
    valor_total = v_final_total,
    precio_unitario = v_final_unit,
    valor_abonado = v_deposit,
    incluye_almuerzo = v_incluye_almuerzo
  where id_reserva = p_id_reserva;

  return jsonb_build_object(
    'id_reserva', p_id_reserva,
    'precio_unitario', v_final_unit,
    'valor_total', v_final_total,
    'valor_abonado', v_deposit,
    'impacto_adicionales', v_new_impact,
    'incluye_almuerzo', v_incluye_almuerzo
  );
end;
$$;

revoke all on function public.configurar_adicionales_reserva_publica(integer, text, jsonb) from public;
grant execute on function public.configurar_adicionales_reserva_publica(integer, text, jsonb) to anon, authenticated;
