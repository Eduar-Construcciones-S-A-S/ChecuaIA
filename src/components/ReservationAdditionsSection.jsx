import { calculateAdditionImpact, maxAdditionQuantity } from '../services/additionService'

const ReservationAdditionsSection = ({
  items = [],
  quantities = {},
  people = 1,
  onChange,
  formatCurrency,
  isEnglish = false,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="rounded-[2rem] border border-brand-primary/15 bg-brand-primary/5 p-6 animate-pulse">
        <div className="h-4 w-40 rounded bg-brand-primary/15 mb-3"></div>
        <div className="h-16 rounded-2xl bg-brand-primary/10"></div>
      </div>
    )
  }

  if (!items.length) return null

  const text = isEnglish ? {
    title: 'Customize your plan',
    description: 'Choose how many people will use each available service before sending the reservation.',
    optional: 'Optional',
    included: 'Included in the plan',
    perPerson: 'per person',
    perReservation: 'per reservation',
    peopleLabel: 'People using this service',
    keepLabel: 'People keeping this service',
    all: 'All',
    none: 'None',
    adds: 'Adds',
    deducts: 'Discount',
    fixed: 'Included for everyone',
  } : {
    title: 'Personaliza tu plan',
    description: 'Antes de enviar la reserva, indica cuántas personas usarán cada servicio disponible.',
    optional: 'Opcional',
    included: 'Incluido en el plan',
    perPerson: 'por persona',
    perReservation: 'por reserva',
    peopleLabel: 'Personas que lo quieren',
    keepLabel: 'Personas que lo mantienen',
    all: 'Todos',
    none: 'Ninguno',
    adds: 'Suma',
    deducts: 'Descuento',
    fixed: 'Incluido para todos',
  }

  return (
    <div className="space-y-4 pt-4 border-t border-brand-light dark:border-dark-border">
      <div>
        <p className="section-title-premium !ml-0">{text.title}</p>
        <p className="mt-2 text-xs sm:text-sm font-medium text-brand-text-secondary dark:text-dark-text-secondary leading-relaxed">
          {text.description}
        </p>
      </div>

      <div className="grid gap-3">
        {items.map(item => {
          const max = maxAdditionQuantity(item, people)
          const quantity = Math.min(max, Math.max(0, Number(quantities[item.id_adicional] ?? (item.modalidad === 'incluido' ? max : 0))))
          const locked = item.modalidad === 'incluido' && !item.permitir_quitar
          const impact = calculateAdditionImpact(item, quantity, people)
          const isPerPerson = item.tipo_cobro === 'por_persona'

          return (
            <div key={item.id_adicional} className="rounded-[1.5rem] border border-brand-primary/15 bg-brand-light/20 dark:bg-dark-bg-main/30 p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-brand-text-main dark:text-dark-text-main">{item.nombre}</p>
                    <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-brand-primary">
                      {item.modalidad === 'incluido' ? text.included : text.optional}
                    </span>
                  </div>
                  {item.descripcion && <p className="mt-1 text-[11px] text-brand-text-secondary dark:text-dark-text-secondary">{item.descripcion}</p>}
                  <p className="mt-2 text-xs font-black text-brand-primary">
                    {formatCurrency(item.precio)} COP · {isPerPerson ? text.perPerson : text.perReservation}
                  </p>
                </div>

                {impact !== 0 && (
                  <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black ${impact > 0 ? 'bg-brand-primary/10 text-brand-primary' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'}`}>
                    {impact > 0 ? text.adds : text.deducts}: {impact > 0 ? '+' : '−'}{formatCurrency(Math.abs(impact))} COP
                  </span>
                )}
              </div>

              <div className="mt-4">
                {locked ? (
                  <div className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-4 py-3 text-xs font-black text-brand-primary">
                    {text.fixed}: {isPerPerson ? people : 1}
                  </div>
                ) : isPerPerson ? (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-brand-text-secondary dark:text-dark-text-secondary">
                        {item.modalidad === 'incluido' ? text.keepLabel : text.peopleLabel}
                      </span>
                      <span className="text-xs font-black text-brand-text-main dark:text-dark-text-main">{quantity} / {max}</span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                      <button type="button" onClick={() => onChange(item.id_adicional, 0)} className="rounded-xl border border-brand-primary/20 px-3 py-2 text-[10px] font-black uppercase text-brand-primary hover:bg-brand-primary/5">
                        {text.none}
                      </button>
                      <select value={quantity} onChange={e => onChange(item.id_adicional, Number(e.target.value))} className="w-full rounded-xl border-2 border-brand-border dark:border-dark-border bg-white dark:bg-dark-bg-card px-3 py-2 text-center font-black text-brand-text-main dark:text-dark-text-main">
                        {Array.from({ length: max + 1 }, (_, value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <button type="button" onClick={() => onChange(item.id_adicional, max)} className="rounded-xl border border-brand-primary/20 px-3 py-2 text-[10px] font-black uppercase text-brand-primary hover:bg-brand-primary/5">
                        {text.all}
                      </button>
                    </div>
                  </>
                ) : (
                  <label className="flex items-center justify-between gap-4 rounded-xl border border-brand-primary/15 bg-white/60 dark:bg-dark-bg-card/50 px-4 py-3 cursor-pointer">
                    <span className="text-xs font-black text-brand-text-main dark:text-dark-text-main">
                      {item.modalidad === 'incluido' ? text.keepLabel : text.peopleLabel}
                    </span>
                    <input
                      type="checkbox"
                      checked={quantity > 0}
                      onChange={e => onChange(item.id_adicional, e.target.checked ? 1 : 0)}
                      className="h-5 w-5 accent-[var(--color-brand-primary)]"
                    />
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ReservationAdditionsSection
