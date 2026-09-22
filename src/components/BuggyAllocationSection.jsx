import { getBuggyShape } from '../services/buggyService'

const BuggyAllocationSection = ({
  participants = [],
  allocation = {},
  pricing = null,
  onCountChange,
  onSeatChange,
  formatCurrency,
  isEnglish = false,
  compact = false,
}) => {
  if (!participants.length) return null

  const shape = getBuggyShape(participants.length, allocation.count)
  const assignments = Array.isArray(allocation.assignments) ? allocation.assignments : []
  const participantMap = Object.fromEntries(participants.map(person => [person.key, person]))

  const text = isEnglish ? {
    title: 'Buggy distribution',
    description: 'Choose how many Buggies you want to use and who rides in each seat. Each Buggy can carry up to 2 people.',
    count: 'Buggies to use',
    driver: 'Driver seat',
    passenger: 'Passenger seat',
    single: 'single Buggy',
    doubles: '2-person Buggy',
    singles: '1-person Buggy',
    total: 'Buggy total',
    hint: 'The total changes according to how many Buggies carry 1 or 2 people.',
  } : {
    title: 'Distribución de Buggies',
    description: 'Elige cuántos Buggies van a utilizar y quién irá en cada puesto. Cada Buggy tiene capacidad máxima para 2 personas.',
    count: 'Buggies a utilizar',
    driver: 'Silla de conductor',
    passenger: 'Silla de acompañante',
    single: 'Buggy individual',
    doubles: 'Buggy de 2 personas',
    singles: 'Buggy de 1 persona',
    total: 'Total de Buggies',
    hint: 'El total cambia según cuántos Buggies lleven 1 o 2 personas.',
  }

  const renderPersonSelect = (buggyIndex, seat, currentKey) => (
    <select
      value={currentKey || ''}
      onChange={(event) => onSeatChange?.(buggyIndex, seat, event.target.value)}
      className="w-full rounded-xl border-2 border-brand-border dark:border-dark-border bg-white dark:bg-dark-bg-card px-3 py-2.5 text-xs sm:text-sm font-black text-brand-text-main dark:text-dark-text-main focus:border-brand-primary outline-none"
    >
      {participants.map(person => (
        <option key={person.key} value={person.key}>
          {person.name}
        </option>
      ))}
    </select>
  )

  if (compact) {
    return (
      <div className="rounded-[1.25rem] border border-brand-primary/20 bg-brand-primary/5 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-brand-primary">{text.title}</p>
          <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-[10px] font-black text-brand-primary">
            {shape.buggyCount} Buggy(s)
          </span>
        </div>
        <p className="text-xs font-bold text-brand-text-secondary dark:text-dark-text-secondary">
          {shape.doubleBuggies} {text.doubles} · {shape.singleBuggies} {text.singles}
        </p>
        {pricing?.totalPrice > 0 && (
          <p className="text-base font-black text-brand-text-main dark:text-dark-text-main">
            {text.total}: {formatCurrency(pricing.totalPrice)} COP
          </p>
        )}
        <div className="grid gap-2 pt-1">
          {assignments.map((item, index) => (
            <div key={item.buggy || index} className="text-[11px] font-bold text-brand-text-secondary dark:text-dark-text-secondary">
              <span className="text-brand-primary font-black">Buggy {index + 1}:</span>{' '}
              {participantMap[item.driver]?.name || '—'}
              {item.passenger ? ` + ${participantMap[item.passenger]?.name || '—'}` : ''}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[2rem] border-2 border-brand-primary/20 bg-brand-primary/5 p-5 sm:p-6 space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-title-premium !ml-0 !mb-0">{text.title}</p>
          <span className="rounded-full bg-brand-primary text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider">
            Máx. 2 por Buggy
          </span>
        </div>
        <p className="mt-2 text-xs sm:text-sm font-medium text-brand-text-secondary dark:text-dark-text-secondary leading-relaxed">
          {text.description}
        </p>
      </div>

      <div className="rounded-2xl bg-white/60 dark:bg-dark-bg-card/50 border border-brand-primary/15 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-black text-brand-text-secondary dark:text-dark-text-secondary">{text.count}</p>
            <p className="text-xs font-bold text-brand-text-secondary dark:text-dark-text-secondary mt-1">
              {shape.minBuggies === shape.maxBuggies
                ? `${shape.minBuggies} Buggy`
                : `${shape.minBuggies} a ${shape.maxBuggies} Buggies`}
            </p>
          </div>
          <select
            value={shape.buggyCount}
            onChange={(event) => onCountChange?.(Number(event.target.value))}
            className="rounded-xl border-2 border-brand-primary/25 bg-white dark:bg-dark-bg-card px-4 py-2.5 font-black text-brand-primary outline-none focus:border-brand-primary"
          >
            {Array.from(
              { length: shape.maxBuggies - shape.minBuggies + 1 },
              (_, offset) => shape.minBuggies + offset
            ).map(count => (
              <option key={count} value={count}>{count} Buggy{count === 1 ? '' : 's'}</option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-brand-primary/5 border border-brand-primary/10 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-brand-text-secondary dark:text-dark-text-secondary">{text.doubles}</p>
            <p className="text-lg font-black text-brand-primary">{shape.doubleBuggies}</p>
          </div>
          <div className="rounded-xl bg-brand-primary/5 border border-brand-primary/10 px-3 py-2">
            <p className="text-[9px] font-black uppercase text-brand-text-secondary dark:text-dark-text-secondary">{text.singles}</p>
            <p className="text-lg font-black text-brand-primary">{shape.singleBuggies}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {assignments.map((item, index) => (
          <div key={item.buggy || index} className="rounded-[1.5rem] border border-brand-primary/15 bg-white/70 dark:bg-dark-bg-card/60 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-black text-brand-text-main dark:text-dark-text-main">🏎️ Buggy {index + 1}</p>
              <span className="text-[9px] font-black uppercase tracking-wider text-brand-primary">
                {item.passenger ? '2 personas' : '1 persona'}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-brand-text-secondary dark:text-dark-text-secondary mb-1.5">{text.driver}</p>
                {renderPersonSelect(index, 'driver', item.driver)}
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-brand-text-secondary dark:text-dark-text-secondary mb-1.5">{text.passenger}</p>
                {item.passenger ? (
                  renderPersonSelect(index, 'passenger', item.passenger)
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-brand-border dark:border-dark-border px-3 py-2.5 text-xs font-bold text-brand-text-secondary/50 dark:text-dark-text-secondary/50">
                    {isEnglish ? 'Empty seat' : 'Asiento libre'}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {pricing?.totalPrice > 0 && (
        <div className="rounded-[1.5rem] border-2 border-brand-primary/30 bg-brand-primary/10 p-4 sm:p-5">
          <div className="grid gap-2 text-xs">
            {shape.doubleBuggies > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-brand-text-secondary dark:text-dark-text-secondary">
                  {shape.doubleBuggies} × {text.doubles}
                </span>
                <span className="font-black text-brand-text-main dark:text-dark-text-main">
                  {formatCurrency(pricing.doublePrice)} COP c/u
                </span>
              </div>
            )}
            {shape.singleBuggies > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-brand-text-secondary dark:text-dark-text-secondary">
                  {shape.singleBuggies} × {text.singles}
                </span>
                <span className="font-black text-brand-text-main dark:text-dark-text-main">
                  {formatCurrency(pricing.singlePrice)} COP c/u
                </span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-brand-primary/20 flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-wider text-brand-primary">{text.total}</span>
            <span className="text-xl font-black text-brand-primary">{formatCurrency(pricing.totalPrice)} COP</span>
          </div>
          <p className="mt-2 text-[10px] font-bold text-brand-text-secondary dark:text-dark-text-secondary">{text.hint}</p>
        </div>
      )}
    </div>
  )
}

export default BuggyAllocationSection
