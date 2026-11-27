import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getColombiaToday } from '../services/tourService';

/**
 * Utilidades para el cálculo de festivos en Colombia
 */
const getEasterDate = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const moveToNextMonday = (date) => {
  const day = date.getDay(); // 0: Sunday, 1: Monday...
  if (day === 1) return date;
  const diff = day === 0 ? 1 : 8 - day;
  const nextMonday = new Date(date);
  nextMonday.setDate(date.getDate() + diff);
  return nextMonday;
};

const getColombianHolidays = (year) => {
  const holidays = [];

  // Festivos Fijos
  const fixedHolidays = [
    { day: 1, month: 0, name: "Año Nuevo" },
    { day: 1, month: 4, name: "Día del Trabajo" },
    { day: 20, month: 6, name: "Independencia de Colombia" },
    { day: 7, month: 7, name: "Batalla de Boyacá" },
    { day: 8, month: 11, name: "Inmaculada Concepción" },
    { day: 25, month: 11, name: "Navidad" },
  ];

  fixedHolidays.forEach(h => {
    holidays.push(new Date(year, h.month, h.day).toDateString());
  });

  // Festivos Ley Emiliani (Se trasladan al siguiente lunes)
  const emilianiHolidays = [
    new Date(year, 0, 6),   // Reyes Magos
    new Date(year, 2, 19),  // San José
    new Date(year, 5, 29),  // San Pedro y San Pablo
    new Date(year, 7, 15),  // Asunción de la Virgen
    new Date(year, 9, 12),  // Día de la Raza
    new Date(year, 10, 1),  // Todos los Santos
    new Date(year, 10, 11), // Independencia de Cartagena
  ];

  emilianiHolidays.forEach(date => {
    holidays.push(moveToNextMonday(date).toDateString());
  });

  // Festivos basados en Pascua
  const easter = getEasterDate(year);
  
  // Jueves y Viernes Santo
  const thursday = new Date(easter);
  thursday.setDate(easter.getDate() - 3);
  const friday = new Date(easter);
  friday.setDate(easter.getDate() - 2);
  
  holidays.push(thursday.toDateString());
  holidays.push(friday.toDateString());

  // Otros festivos móviles basados en Pascua (se trasladan al lunes)
  const ascension = new Date(easter);
  ascension.setDate(easter.getDate() + 39);
  
  const corpus = new Date(easter);
  corpus.setDate(easter.getDate() + 60);
  
  const sagradoCorazon = new Date(easter);
  sagradoCorazon.setDate(easter.getDate() + 68);

  holidays.push(moveToNextMonday(ascension).toDateString());
  holidays.push(moveToNextMonday(corpus).toDateString());
  holidays.push(moveToNextMonday(sagradoCorazon).toDateString());

  return holidays;
};

const DateSelectionSection = ({ onSelect, selectedDate, errors, sectionRef, availableDates = [], tipoFecha = 'cualquier_dia' }) => {
  const { t, i18n } = useTranslation();
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0);
  const scrollRef = useRef(null);

  const [todayISO, setTodayISO] = useState(getColombiaToday);
  useEffect(() => {
    const refresh = () => setTodayISO(getColombiaToday());
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const today = useMemo(() => new Date(`${todayISO}T00:00:00`), [todayISO]);

  /**
   * Identifica si hoy es el último día del mes
   */
  const isLastDayOfMonth = (date) => {
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    return nextDay.getMonth() !== date.getMonth();
  };

  /**
   * Calcula los meses visibles (3 o 4 dependiendo de si es fin de mes)
   */
  const monthsToDisplay = useMemo(() => {
    const months = [];
    const monthsCount = isLastDayOfMonth(today) ? 4 : 3;
    
    for (let i = 0; i < monthsCount; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push(d);
    }
    return months;
  }, [today]);

  const holidays = useMemo(() => {
    const currentYear = today.getFullYear();
    const nextYear = currentYear + 1;
    return [
      ...getColombianHolidays(currentYear),
      ...getColombianHolidays(nextYear)
    ];
  }, [today]);

  const isHoliday = (date) => holidays.includes(date.toDateString());
  const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;
  const isToday = (date) => date.toDateString() === today.toDateString();
  const isPast = (date) => formatDateISO(date) < getColombiaToday();

  /**
   * Verifica si una fecha es seleccionable según la lógica del plan
   */
  const isSelectable = (date) => {
    if (isPast(date)) return false;
    if (tipoFecha === 'fechas_especificas') {
      const dateISO = formatDateISO(date);
      return availableDates.includes(dateISO);
    }
    return true;
  };

  const handleDateClick = (date) => {
    if (!isSelectable(date)) return;
    
    // Lógica para backend
    const dateSelectionData = {
      fecha_reserva: formatDateISO(date),
      es_fin_de_semana: isWeekend(date),
      es_festivo_colombia: isHoliday(date),
      puede_variar_precio: !isWeekend(date) && !isHoliday(date)
    };
    
    onSelect(date, dateSelectionData);
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const index = Math.round(scrollLeft / clientWidth);
      setCurrentMonthIndex(index);
    }
  };

  const scrollToMonth = (index) => {
    if (scrollRef.current) {
      const clientWidth = scrollRef.current.clientWidth;
      scrollRef.current.scrollTo({
        left: index * clientWidth,
        behavior: 'smooth'
      });
    }
  };

  const formatDateISO = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateLegible = (date) => {
    if (!date) return "";
    return date.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const availableDateItems = useMemo(() => {
    if (tipoFecha !== 'fechas_especificas') return []

    return (availableDates || [])
      .map((iso) => {
        if (!iso) return null
        const safeIso = iso.toString().slice(0, 10)
        const date = new Date(`${safeIso}T00:00:00`)
        date.setHours(0, 0, 0, 0)
        if (Number.isNaN(date.getTime())) return null
        return { iso: safeIso, date }
      })
      .filter(item => item && item.iso >= todayISO)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [availableDates, tipoFecha, todayISO])

  const renderMonth = (monthDate, monthIdx) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthName = monthDate.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'es-ES', { month: 'long' });
    
    // Calcular días del mes
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0: Sun, 1: Mon...
    // Ajustar para que Lunes sea 0
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Padding inicial
    for (let i = 0; i < startOffset; i++) {
      days.push(<div key={`empty-${year}-${month}-${i}`} className="h-10 w-10 md:h-11 md:w-11"></div>);
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const holiday = isHoliday(date);
      const weekend = isWeekend(date);
      const selected = selectedDate && date.toDateString() === selectedDate.toDateString();
      const current = isToday(date);
      const selectable = isSelectable(date);

      days.push(
        <button
          key={`day-${year}-${month}-${day}`}
          type="button"
          disabled={!selectable}
          onClick={() => handleDateClick(date)}
          className={`relative h-10 w-10 md:h-11 md:w-11 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200
            ${!selectable ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-brand-light dark:hover:bg-dark-bg-main cursor-pointer'}
            ${selected ? 'bg-brand-primary text-white hover:bg-brand-primary shadow-md scale-110 z-10' : ''}
            ${!selected && holiday && selectable ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20' : ''}
            ${!selected && !holiday && weekend && selectable ? 'text-brand-dark dark:text-brand-primary' : ''}
            ${!selected && !holiday && !weekend && selectable ? 'text-brand-text-main dark:text-dark-text-main' : ''}
            ${current && !selected && selectable ? 'border-2 border-brand-primary' : ''}
            ${selectable && !selected && tipoFecha === 'fechas_especificas' ? 'ring-2 ring-brand-primary/30 ring-offset-2 dark:ring-offset-dark-bg-card' : ''}
          `}
        >
          {day}
          {holiday && !selected && (
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-400 rounded-full"></span>
          )}
        </button>
      );
    }

    return (
      <div 
        key={`month-${year}-${month}`} 
        className="min-w-full snap-center px-1 pb-1"
      >
        <div className="bg-white dark:bg-dark-bg-card rounded-2xl p-3 md:p-6 border border-brand-border/50 dark:border-dark-border shadow-sm">
          <h4 className="text-sm font-black text-brand-text-main dark:text-dark-text-main uppercase tracking-widest mb-6 text-center">
            {monthName} {year}
          </h4>
          <div className="grid grid-cols-7 gap-1 md:gap-2 text-center justify-items-center">
            {(i18n.language === 'en' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'M', 'J', 'V', 'S', 'D']).map((d, i) => (
              <div key={`weekday-${d}-${monthIdx}-${i}`} className="text-[10px] md:text-xs font-black text-brand-text-secondary/50 dark:text-dark-text-secondary py-2">{d}</div>
            ))}
            {days}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      ref={sectionRef}
      className={`card-premium ${errors.date ? 'border-red-400 ring-2 ring-red-50' : ''}`}
    >
      <div className={`card-accent-line ${errors.date ? 'bg-red-400' : ''}`}></div>
      
      <div className="px-6 py-8 md:px-10 md:py-10 space-y-6">
        {tipoFecha === 'fechas_especificas' ? (
          <div className="space-y-4">
            <p className="text-sm md:text-base text-brand-text-secondary dark:text-dark-text-secondary font-medium">
              {t('sections.available_dates_plan')}
            </p>

            {availableDateItems.length === 0 ? (
              <div className="bg-brand-light/10 dark:bg-dark-bg-main/30 border-2 border-dashed border-brand-border dark:border-dark-border rounded-[2rem] p-8 text-center">
                <p className="text-sm text-brand-text-secondary/60 dark:text-dark-text-secondary/60 font-medium italic">
                  {t('sections.no_dates_available_plan')}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {availableDateItems.map(({ iso, date }) => {
                  const selected = selectedDate && formatDateISO(selectedDate) === iso
                  const dateIsPast = isPast(date)
                  const isDisabled = !isSelectable(date)
                  return (
                    <div key={iso} className="relative group">
                      <button
                        type="button"
                        onClick={() => handleDateClick(date)}
                        disabled={isDisabled}
                        title={dateIsPast ? t('sections.date_past_tooltip') : undefined}
                        className={`w-full text-left rounded-[1.5rem] p-5 border transition-all duration-300 ${
                          selected
                            ? 'bg-brand-primary/10 border-brand-primary/30'
                            : dateIsPast
                            ? 'bg-white/10 dark:bg-dark-bg-card/10 border-brand-border/30 dark:border-dark-border/30 opacity-60 cursor-not-allowed'
                            : 'bg-white/40 dark:bg-dark-bg-card/40 border-brand-border/60 dark:border-dark-border hover:border-brand-primary/40 hover:-translate-y-0.5 hover:shadow-lg'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`font-black text-sm md:text-base capitalize truncate ${
                                dateIsPast
                                  ? 'text-brand-text-secondary/50 dark:text-dark-text-secondary/50 line-through decoration-brand-text-secondary/30'
                                  : 'text-brand-text-main dark:text-dark-text-main'
                              }`}>
                                {formatDateLegible(date)}
                              </p>
                              {dateIsPast && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-200/80 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 text-[8px] md:text-[9px] font-black uppercase rounded-full border border-gray-300/50 dark:border-gray-600/40 tracking-wider shrink-0">
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {t('sections.date_past')}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {isHoliday(date) && (
                                <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-black uppercase rounded-full border border-red-200 dark:border-red-900/50">
                                  {t('sections.holiday')}
                                </span>
                              )}
                              {isWeekend(date) && (
                                <span className="px-3 py-1 bg-brand-primary/10 text-brand-primary text-[9px] font-black uppercase rounded-full border border-brand-primary/20">
                                  {t('sections.weekend')}
                                </span>
                              )}
                            </div>
                            {dateIsPast && (
                              <p className="text-[9px] md:text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-2 italic">
                                {t('sections.date_past_explanation')}
                              </p>
                            )}
                          </div>

                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-300 shrink-0 ${
                            selected
                              ? 'bg-brand-primary text-white border-brand-primary scale-110 shadow-lg'
                              : dateIsPast
                              ? 'bg-transparent text-gray-400/40 dark:text-gray-500/40 border-gray-300/30 dark:border-gray-600/30'
                              : 'bg-transparent text-brand-text-secondary/20 dark:text-dark-text-secondary/20 border-brand-border/40 dark:border-dark-border/40'
                          }`}>
                            {dateIsPast ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className={`w-5 h-5 transition-all duration-300 ${selected ? 'scale-110' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={selected ? "3" : "2.5"}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-sm md:text-base text-brand-text-secondary dark:text-dark-text-secondary font-medium">
                  {t('sections.availability_next_months')}
                </p>
              </div>
              
              {/* Navigation Arrows */}
              <div className="flex items-center gap-2 self-end md:self-center">
                <button
                  type="button"
                  disabled={currentMonthIndex === 0}
                  onClick={() => scrollToMonth(currentMonthIndex - 1)}
                  className="p-3 rounded-full bg-brand-light dark:bg-dark-bg-main text-brand-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-110 active:scale-95 border border-brand-primary/10 shadow-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={currentMonthIndex === monthsToDisplay.length - 1}
                  onClick={() => scrollToMonth(currentMonthIndex + 1)}
                  className="p-3 rounded-full bg-brand-light dark:bg-dark-bg-main text-brand-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-110 active:scale-95 border border-brand-primary/10 shadow-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Carousel Container */}
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-0"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {monthsToDisplay.map((m, idx) => renderMonth(m, idx))}
            </div>
          </>
        )}

        {/* Selected Date Summary */}
        <div className="space-y-4">
          {selectedDate && isSelectable(selectedDate) ? (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="bg-brand-light/30 dark:bg-dark-bg-main/40 border border-brand-primary/20 rounded-[2rem] p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-white dark:bg-dark-bg-card rounded-2xl border border-brand-primary/10 shadow-sm flex items-center justify-center text-brand-primary">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-black text-brand-primary">Fecha seleccionada</p>
                    <p className="text-brand-text-main dark:text-dark-text-main font-bold text-sm md:text-base capitalize break-words whitespace-normal">
                      {formatDateLegible(selectedDate)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {isHoliday(selectedDate) && (
                    <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[9px] font-black uppercase rounded-full border border-red-200 dark:border-red-900/50">
                      {t('sections.holiday_tag')}
                    </span>
                  )}
                  {isWeekend(selectedDate) && (
                    <span className="px-3 py-1 bg-brand-primary/10 text-brand-primary text-[9px] font-black uppercase rounded-full border border-brand-primary/20">
                      {t('sections.weekend')}
                    </span>
                  )}
                </div>
              </div>
              {!isWeekend(selectedDate) && !isHoliday(selectedDate) && (
                <p className="text-[10px] text-brand-text-secondary/60 dark:text-dark-text-secondary/60 mt-3 font-medium italic text-center ml-6">
                  {t('sections.price_variation_notice')}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-brand-light/10 dark:bg-dark-bg-main/30 border-2 border-dashed border-brand-border dark:border-dark-border rounded-[2rem] p-8 text-center">
              <p className="text-sm text-brand-text-secondary/60 dark:text-dark-text-secondary/60 font-medium italic">
                {t('sections.date_not_selected')}
              </p>
            </div>
          )}
          {errors.date && <p className="text-[10px] text-red-500 mt-1 ml-6 font-bold uppercase tracking-wider text-center">{errors.date}</p>}
        </div>
      </div>
    </div>
  );
};

export default DateSelectionSection;
