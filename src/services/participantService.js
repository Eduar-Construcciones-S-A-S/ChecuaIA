import { supabase } from '../lib/supabase'

/**
 * Inserta múltiples participantes en la tabla 'participante'
 * @param {Array<Object>} participants Lista de participantes formateados para Supabase
 * @returns {Promise<{data: any, error: any}>}
 */
export const createParticipants = async (participants) => {
  try {
    const { data, error } = await supabase
      .from('participante')
      .insert(participants)
      .select()

    return { data, error }
  } catch (err) {
    console.error('Error in createParticipants service:', err)
    return { data: null, error: err }
  }
}

export const saveParticipants = async (participants) => {
  try {
    const results = []

    for (const participant of participants) {
      const { data: updatedData, error: updateError } = await supabase
        .from('participante')
        .update(participant)
        .eq('telefono_cliente', participant.telefono_cliente)
        .eq('numero_documento', participant.numero_documento)
        .select()

      if (updateError) return { data: null, error: updateError }

      if (updatedData && updatedData.length > 0) {
        results.push(...updatedData)
        continue
      }

      const { data: insertedData, error: insertError } = await supabase
        .from('participante')
        .insert(participant)
        .select()

      if (insertError) return { data: null, error: insertError }
      if (insertedData) results.push(...insertedData)
    }

    return { data: results, error: null }
  } catch (err) {
    console.error('Error in saveParticipants service:', err)
    return { data: null, error: err }
  }
}

/**
 * Sincroniza la lista completa de participantes de una reserva.
 * La lista recibida desde el formulario es la fuente de verdad:
 * responsable + todos los acompañantes.
 */
export const saveParticipantsForReservation = async (participants, reservationId) => {
  try {
    if (!reservationId) {
      return { data: null, error: new Error('reservationId es obligatorio') }
    }

    const participantsWithReservation = (participants || []).map((participant) => ({
      ...participant,
      id_reserva: reservationId
    }))

    if (participantsWithReservation.length === 0) {
      return { data: [], error: null }
    }

    // Evita que reaperturas del modal acumulen o sobrescriban solo una parte
    // de los participantes. La reserva queda exactamente como está el formulario.
    const { error: deleteError } = await supabase
      .from('participante')
      .delete()
      .eq('id_reserva', reservationId)

    if (deleteError) {
      console.error('Error al limpiar participantes anteriores:', deleteError)
      return { data: null, error: deleteError }
    }

    const { data, error } = await supabase
      .from('participante')
      .insert(participantsWithReservation)
      .select()

    if (error) {
      console.error('Error al insertar la lista completa de participantes:', error)
      return { data: null, error }
    }

    return { data: data || [], error: null }
  } catch (err) {
    console.error('Error in saveParticipantsForReservation service:', err)
    return { data: null, error: err }
  }
}
