import { supabase } from '../lib/supabase'

const missingTable = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('could not find the table')
}

export const getPlanAdditions = async (planId) => {
  if (!planId) return []

  try {
    const { data: links, error: linksError } = await supabase
      .from('plan_adicional')
      .select('id_plan,id_adicional,modalidad,precio_override,permitir_quitar,activo')
      .eq('id_plan', Number(planId))
      .eq('activo', true)

    if (linksError) {
      if (missingTable(linksError)) return []
      throw linksError
    }

    if (!links?.length) return []

    const ids = [...new Set(links.map(item => Number(item.id_adicional)))]
    const { data: additions, error: additionsError } = await supabase
      .from('adicional')
      .select('id_adicional,codigo,nombre,descripcion,precio,tipo_cobro,activo')
      .in('id_adicional', ids)
      .eq('activo', true)

    if (additionsError) {
      if (missingTable(additionsError)) return []
      throw additionsError
    }

    const byId = new Map((additions || []).map(item => [Number(item.id_adicional), item]))

    return links
      .map(link => {
        const addition = byId.get(Number(link.id_adicional))
        if (!addition) return null
        return {
          id_plan: Number(link.id_plan),
          id_adicional: Number(link.id_adicional),
          modalidad: link.modalidad,
          permitir_quitar: Boolean(link.permitir_quitar),
          precio_override: link.precio_override == null ? null : Number(link.precio_override),
          activo: link.activo !== false,
          codigo: addition.codigo,
          nombre: addition.nombre,
          descripcion: addition.descripcion,
          precio: Number(link.precio_override ?? addition.precio ?? 0),
          tipo_cobro: addition.tipo_cobro,
        }
      })
      .filter(Boolean)
  } catch (error) {
    console.error('No fue posible cargar los adicionales del plan:', error)
    return []
  }
}

export const maxAdditionQuantity = (item, people) =>
  item?.tipo_cobro === 'por_persona' ? Math.max(1, Number(people || 1)) : 1

export const defaultAdditionQuantity = (item, people) =>
  item?.modalidad === 'incluido' ? maxAdditionQuantity(item, people) : 0

export const clampAdditionQuantity = (item, quantity, people) => {
  const max = maxAdditionQuantity(item, people)
  if (item?.modalidad === 'incluido' && !item?.permitir_quitar) return max
  return Math.min(max, Math.max(0, Number(quantity || 0)))
}

export const calculateAdditionImpact = (item, quantity, people) => {
  const max = maxAdditionQuantity(item, people)
  const selected = clampAdditionQuantity(item, quantity, people)
  const price = Number(item?.precio || 0)

  if (item?.modalidad === 'opcional') return selected * price
  if (item?.modalidad === 'incluido' && item?.permitir_quitar) return -(max - selected) * price
  return 0
}

export const calculateAdditionsImpact = (items, quantities, people) =>
  (items || []).reduce(
    (sum, item) => sum + calculateAdditionImpact(item, quantities?.[item.id_adicional], people),
    0
  )

export const normalizeAdditionSelections = (items, quantities, people) =>
  (items || []).map(item => ({
    id_adicional: Number(item.id_adicional),
    cantidad: clampAdditionQuantity(item, quantities?.[item.id_adicional], people),
  }))

export const configurePublicReservationAdditions = async ({
  reservationId,
  phone,
  selections,
}) => {
  const { data, error } = await supabase.rpc('configurar_adicionales_reserva_publica', {
    p_id_reserva: Number(reservationId),
    p_telefono_cliente: phone,
    p_items: selections || [],
  })

  return { data, error }
}
