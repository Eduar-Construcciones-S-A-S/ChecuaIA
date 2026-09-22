import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReservationContactSection from '../components/ReservationContactSection';
import TourSelectionSection from '../components/TourSelectionSection';
import DateSelectionSection from '../components/DateSelectionSection';
import TimeSelectionSection from '../components/TimeSelectionSection';
import CompanionFormSection from '../components/CompanionFormSection';
import PaymentModal from '../components/PaymentModal';
import WelcomeModal from '../components/WelcomeModal';
import ReservationAdditionsSection from '../components/ReservationAdditionsSection';
import BuggyAllocationSection from '../components/BuggyAllocationSection';
import { saveParticipantsForReservation } from '../services/participantService';
import { createReservation } from '../services/reservationService';
import {
  calculateAdditionsImpact,
  clampAdditionQuantity,
  defaultAdditionQuantity,
  getPlanAdditions,
  normalizeAdditionSelections,
} from '../services/additionService';
import { getCountryName } from '../utils/countries';
import { CountryFlagImg } from '../utils/CountryFlagImg.jsx';

const HomePage = ({
  isModalOpen,
  onModalComplete,
  onCloseModal,
  onOpenModal,
  theme,
  toggleTheme,
  tours,
  loadingData,
  reservationData,
  handleContactChange,
  handleTourSelect,
  handleDateSelect,
  handleTimeSelect,
  handleStep1AddCompanions,
  handleStep1ReserveAlone,
  handleStep2Continue,
  showSummary,
  setShowSummary,
  handleEditInformation,
  handleAddCompanions,
  setShowCompanionsSection,
  addCompanion,
  removeCompanion,
  handleCompanionChange,
  errors,
  contactRef,
  tourRef,
  dateRef,
  timeRef,
  currentStep,
  setCurrentStep,
  handleBuggyCountChange,
  handleBuggySeatChange
}) => {
  const { t, i18n } = useTranslation();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [planAdditions, setPlanAdditions] = useState([]);
  const [additionQuantities, setAdditionQuantities] = useState({});
  const [additionTouched, setAdditionTouched] = useState({});
  const [loadingAdditions, setLoadingAdditions] = useState(false);
  const [paymentTotal, setPaymentTotal] = useState(null);

  const calculateAge = (birthDateStr) => {
    if (!birthDateStr) return null;
    const birthDate = new Date(birthDateStr);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  };

  const totalParticipants = 1 + (reservationData.companions?.length || 0);
  const isBuggy = Boolean(reservationData.tour.is_buggy);
  const buggyParticipants = [
    {
      key: 'responsible',
      name: reservationData.contact.nombre_jefe_reserva || (i18n.language?.startsWith('en') ? 'Responsible' : 'Responsable'),
      document: reservationData.contact.numero_documento || ''
    },
    ...(reservationData.companions || []).map((companion, index) => ({
      key: `companion-${index}`,
      name: companion.nombre || `${i18n.language?.startsWith('en') ? 'Companion' : 'Acompañante'} ${index + 1}`,
      document: companion.numero_documento || ''
    }))
  ];

  useEffect(() => {
    let cancelled = false;
    const planId = reservationData.tour.id_plan;

    if (!planId) {
      setPlanAdditions([]);
      setAdditionQuantities({});
      setPaymentTotal(null);
      return undefined;
    }

    setLoadingAdditions(true);
    getPlanAdditions(planId)
      .then(items => {
        if (cancelled) return;
        setPlanAdditions(items);
        setAdditionQuantities({});
        setAdditionTouched({});
        setPaymentTotal(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingAdditions(false);
      });

    return () => { cancelled = true; };
  }, [reservationData.tour.id_plan]);

  useEffect(() => {
    if (!planAdditions.length) return;
    setAdditionQuantities(current => Object.fromEntries(
      planAdditions.map(item => [
        item.id_adicional,
        clampAdditionQuantity(
          item,
          additionTouched[item.id_adicional]
            ? current[item.id_adicional]
            : defaultAdditionQuantity(item, totalParticipants),
          totalParticipants
        )
      ])
    ));
    setPaymentTotal(null);
  }, [totalParticipants, planAdditions, additionTouched]);

  const handleAdditionQuantityChange = (idAdicional, quantity) => {
    const item = planAdditions.find(addition => Number(addition.id_adicional) === Number(idAdicional));
    if (!item) return;
    setAdditionQuantities(current => ({
      ...current,
      [idAdicional]: clampAdditionQuantity(item, quantity, totalParticipants),
    }));
    setAdditionTouched(current => ({ ...current, [idAdicional]: true }));
    setPaymentTotal(null);
  };

  const baseTotalPrice = isBuggy
    ? Number(reservationData.buggy?.pricing?.totalPrice || 0)
    : (reservationData.tour.precio_por_persona || 0) * totalParticipants;
  const additionsImpact = calculateAdditionsImpact(planAdditions, additionQuantities, totalParticipants);
  const totalPrice = Math.max(0, baseTotalPrice + additionsImpact);
  const depositAmount = Math.round(totalPrice * 0.3);
  const remainingAmount = totalPrice - depositAmount;

  const subjectToAdvisor =
    reservationData.tour.tipo_fecha === 'cualquier_dia' &&
    reservationData.date.puede_variar_precio === true;

  const isEnglish = i18n.language?.startsWith('en');
  const advisorPriceTitle = isEnglish
    ? 'PRICE SUBJECT TO PRIOR AGREEMENT WITH THE ADVISOR'
    : 'PRECIO SUJETO A CONDICIONES PREVIAMENTE DEFINIDAS CON EL ASESOR';
  const advisorPriceDescription = isEnglish
    ? 'Because you selected a weekday that is not a holiday, the final price will be handled directly with an advisor. No automatic total, deposit or remaining balance applies on this screen.'
    : 'Como seleccionaste un día entre semana que no es festivo, el valor final será gestionado directamente con un asesor. En esta pantalla no aplica un total, abono ni saldo automático.';

  const handleProceedToPayment = async () => {
    setIsSaving(true);
    try {
      const normalizePhoneForParticipant = (phone) => {
        if (!phone) return '';
        return phone.toString().replace(/\s+/g, '').replace(/^\+/, '');
      };

      const reservationPayload = {
        id_plan: reservationData.tour.id_plan,
        fecha_reserva: reservationData.date.fecha_reserva,
        hora_reserva: reservationData.time.hora_reserva,
        telefono_cliente: reservationData.contact.telefono_cliente,
        cantidad_personas: totalParticipants,
        aprobado: false,
        fecha_solicitud: new Date().toISOString(),
        fecha_aprobacion: null,
        es_festivo_colombia: Boolean(reservationData.date.es_festivo_colombia),
        adicionales: normalizeAdditionSelections(planAdditions, additionQuantities, totalParticipants),
        buggy_configuracion: isBuggy
          ? {
              buggyCount: reservationData.buggy?.count,
              assignments: reservationData.buggy?.assignments || [],
              routeName: reservationData.tour.tour_reserva,
              groupName: reservationData.tour.group_name || 'Buggys',
              participants: buggyParticipants
            }
          : null
      };

      const { data: reservationCreated, error: reservationError } = await createReservation(reservationPayload);

      if (reservationError) {
        console.error('Error al crear la reserva en Supabase:', reservationError);
        alert('Hubo un error al crear la reserva. Por favor intenta de nuevo.');
        return;
      }

      const reservationId = reservationCreated?.id_reserva;
      if (!reservationId) {
        console.error('Reserva creada sin id_reserva:', reservationCreated);
        alert('No se pudo obtener el identificador de la reserva. Por favor intenta de nuevo.');
        return;
      }

      const headParticipant = {
        telefono_cliente: reservationData.contact.telefono_cliente,
        nombre: reservationData.contact.nombre_jefe_reserva,
        tipo_documento: reservationData.contact.tipo_documento,
        numero_documento: reservationData.contact.numero_documento,
        telefono_participante: normalizePhoneForParticipant(reservationData.contact.telefono_cliente),
        correo: reservationData.contact.correo_contacto,
        nacionalidad: reservationData.contact.nacionalidad,
        edad: calculateAge(reservationData.contact.fecha_nacimiento)
      };

      const companionsParticipants = (reservationData.companions || []).map(companion => ({
        telefono_cliente: reservationData.contact.telefono_cliente,
        nombre: companion.nombre,
        tipo_documento: companion.tipo_documento,
        numero_documento: companion.numero_documento,
        telefono_participante: companion.telefono,
        correo: companion.correo,
        nacionalidad: companion.nacionalidad,
        edad: calculateAge(companion.fecha_nacimiento)
      }));

      const participantsToSave = [headParticipant, ...companionsParticipants];
      const { data, error } = await saveParticipantsForReservation(participantsToSave, reservationId);

      if (error) {
        console.error('Error al guardar participantes en Supabase:', error);
        alert('Hubo un error al guardar la información de los participantes. Por favor intenta de nuevo.');
        return;
      }

      console.log('Reserva creada:', reservationCreated);
      console.log('Participantes guardados:', data);
      console.log('Total de referencia:', totalPrice);

      setPaymentTotal(Number(reservationCreated?.valor_total || totalPrice));
      setIsPaymentModalOpen(true);
    } catch (err) {
      console.error('Error inesperado al procesar participantes:', err);
      alert('Ocurrió un error inesperado. Por favor intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (amount) => {
    return amount?.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).replace('COP', '').trim();
  };

  const formatCOP = (amount) => {
    const safeAmount = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0;
    return `$${safeAmount.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} COP`;
  };

  const getTimeParts = (timeStr) => {
    if (!timeStr) return null;
    const raw = String(timeStr).trim();
    const [h, m] = raw.split(':');
    const hour = Number.parseInt(h, 10);
    const minute = Number.parseInt(m ?? '0', 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { hour, minute };
  };

  const formatTime12h = (timeStr) => {
    const parts = getTimeParts(timeStr);
    if (!parts) return '';
    const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
    const mm = String(parts.minute).padStart(2, '0');
    return `${hour12}:${mm}`;
  };

  const getMeridiem = (timeStr) => {
    const parts = getTimeParts(timeStr);
    if (!parts) return '';
    return parts.hour < 12 ? 'AM' : 'PM';
  };

  const getPlanEmoji = (planName) => {
    const name = (planName || '').toLowerCase();
    if (name.includes('sender')) return '🌵';
    if (name.includes('desiert')) return '🏜️';
    if (name.includes('atv') || name.includes('cuatrimoto')) return '🏍️';
    if (name.includes('cabalg')) return '🐎';
    if (name.includes('camin') || name.includes('trek')) return '🥾';
    return '✨';
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-b from-white to-brand-light/40 dark:from-dark-bg-main dark:to-dark-bg-main py-3 sm:py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center transition-colors duration-300 ${isModalOpen ? 'overflow-hidden h-screen' : ''}`}>
      {isModalOpen ? (
        <WelcomeModal
          isOpen={isModalOpen}
          onComplete={onModalComplete}
          onClose={onCloseModal}
          tours={tours}
          loading={loadingData}
          initialPhone={reservationData.contact.telefono_cliente}
          initialTourId={reservationData.tour.id_plan}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      ) : null}

      {!isModalOpen && (
        <>
          <div className="w-full max-w-xl text-center mb-6 sm:mb-10 pt-2 sm:pt-16 md:pt-20 relative">
            <div className="flex items-center justify-center gap-3 flex-wrap mb-4 sm:mb-0 sm:absolute sm:top-0 sm:right-0">
              <button
                onClick={toggleTheme}
                className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-300 shadow-sm border-2 ${
                  theme === 'light'
                    ? 'bg-white border-brand-border text-amber-500 hover:border-amber-400 hover:bg-amber-50/50'
                    : 'bg-dark-bg-card border-dark-border text-brand-primary hover:border-brand-primary/50 hover:bg-brand-primary/10'
                }`}
                title={theme === 'light' ? t('welcome.switch_dark') || 'Cambiar a modo oscuro' : t('welcome.switch_light') || 'Cambiar a modo claro'}
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.243 17.657l-.707-.707M7.05 7.05l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              <div className="flex bg-white/50 dark:bg-dark-bg-card/50 p-1.5 rounded-2xl border-2 border-brand-border dark:border-dark-border gap-1.5">
                <button
                  onClick={() => changeLanguage('es')}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all duration-300 uppercase tracking-wider ${
                    i18n.language.startsWith('es')
                      ? 'bg-brand-primary text-white shadow-lg scale-105'
                      : 'text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-primary dark:hover:text-brand-primary'
                  }`}
                >
                  ES
                </button>
                <button
                  onClick={() => changeLanguage('en')}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all duration-300 uppercase tracking-wider ${
                    i18n.language.startsWith('en')
                      ? 'bg-brand-primary text-white shadow-lg scale-105'
                      : 'text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-primary dark:hover:text-brand-primary'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-brand-text-main dark:text-dark-text-main uppercase leading-none">
              {t('home.title')}
            </h1>
            <div className="mt-2 flex items-center justify-center gap-3">
              <div className="h-[1px] w-6 bg-brand-primary opacity-60"></div>
              <h2 className="text-base md:text-lg font-bold tracking-[0.2em] text-brand-dark dark:text-brand-primary uppercase">
                {t('home.subtitle')}
              </h2>
              <div className="h-[1px] w-6 bg-brand-primary opacity-60"></div>
            </div>
          </div>

          <div className="w-full max-w-xl space-y-6">
            <div className="flex justify-start">
              <button
                onClick={onOpenModal}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-brand-primary hover:text-brand-dark transition-colors group"
              >
                <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {t('welcome.change_plan')}
              </button>
            </div>

            <div className="mb-5 sm:mb-8 md:mb-12 px-2">
              <div className="max-w-3xl mx-auto relative">
                <div className="flex items-center justify-between z-10 relative">
                  {[
                    { n: 1, label: t('steps.step1_title') || 'Plan & Cliente' },
                    { n: 2, label: t('steps.step2_title') || 'Participantes' },
                    { n: 3, label: t('steps.step3_title') || 'Resumen' }
                  ].map((step, i, arr) => {
                    const isActive = currentStep === step.n;
                    const isCompleted = currentStep > step.n;
                    return (
                      <div key={step.n} className="flex flex-col items-center gap-2 flex-1 relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (step.n === 1) {
                              setCurrentStep(1);
                              setShowSummary(false);
                            } else if (step.n === 2 && currentStep >= 2) {
                              setCurrentStep(2);
                              setShowSummary(false);
                              setShowCompanionsSection(true);
                            } else if (step.n === 3 && currentStep === 3) {
                              setCurrentStep(3);
                            }
                          }}
                          disabled={step.n > currentStep}
                          className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-sm md:text-base border-2 transition-all duration-300 z-10 ${
                            isCompleted
                              ? 'bg-brand-primary border-brand-primary text-white shadow-lg scale-105'
                              : isActive
                              ? 'bg-white dark:bg-dark-bg-card border-brand-primary text-brand-primary shadow-xl ring-4 ring-brand-primary/20 scale-110'
                              : 'bg-white/50 dark:bg-dark-bg-card/50 border-brand-border/50 dark:border-dark-border/50 text-brand-text-secondary/40 dark:text-dark-text-secondary/40 cursor-not-allowed'
                          } ${step.n <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                        >
                          {isCompleted ? (
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            step.n
                          )}
                        </button>
                        <p className={`text-[10px] md:text-xs font-black uppercase tracking-wider text-center max-w-[120px] transition-colors ${isActive || isCompleted ? 'text-brand-primary dark:text-brand-primary' : 'text-brand-text-secondary/40 dark:text-dark-text-secondary/40'}`}>
                          {step.label}
                        </p>
                        <span className={`text-[8px] md:text-[9px] uppercase tracking-widest text-center ${isActive ? 'text-brand-primary/60 dark:text-brand-primary/60 font-black' : 'text-brand-text-secondary/30 dark:text-dark-text-secondary/30'}`}>
                          {isActive ? t('steps.step_active') || 'Actual' : ''}
                        </span>
                        {i < arr.length - 1 && (
                          <div className={`hidden md:block absolute top-5 -right-1/2 w-full h-[3px] -z-0 ${currentStep > step.n ? 'bg-brand-primary shadow-[0_0_10px_rgba(132,204,22,0.6)]' : 'bg-brand-border/40 dark:bg-dark-border/40'}`}></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {currentStep === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                <div className="section-container">
                  <label className="section-title-premium">{t('sections.responsible_info')}</label>
                  <ReservationContactSection sectionRef={contactRef} data={reservationData.contact} onChange={handleContactChange} errors={errors} />
                </div>

                <div className="section-container">
                  <label className="section-title-premium">{t('sections.tour')}</label>
                  <TourSelectionSection sectionRef={tourRef} selectedTourId={reservationData.tour.id_plan} onSelect={handleTourSelect} errors={errors} tours={tours} loading={loadingData} />
                </div>

                <div className="section-container">
                  <label className="section-title-premium">{t('sections.date')}</label>
                  <DateSelectionSection sectionRef={dateRef} selectedDate={reservationData.date.rawDate} onSelect={handleDateSelect} errors={errors} availableDates={reservationData.tour.availableDates} tipoFecha={reservationData.tour.tipo_fecha} />
                </div>

                <div className="section-container">
                  <label className="section-title-premium">{t('sections.time')}</label>
                  <TimeSelectionSection sectionRef={timeRef} selectedTime={reservationData.time} onSelect={handleTimeSelect} schedules={reservationData.tour.availableHours} loading={loadingData} errors={errors} tipoHora={reservationData.tour.tipo_hora} />
                </div>

                <div className="pt-4 grid gap-3 md:grid-cols-2">
                  <button
                    onClick={handleStep1AddCompanions}
                    className="rounded-[1.25rem] px-6 py-4 md:py-5 font-black text-sm md:text-base uppercase tracking-wider border-2 border-brand-primary/40 text-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 hover:bg-brand-primary/15 hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    {t('steps.step1_add_companion') || 'Añadir acompañante'}
                  </button>

                  <button onClick={handleStep1ReserveAlone} className="btn-animate-continue w-full">
                    <div className="dots_border"></div>
                    <svg className="sparkle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path className="path" d="M12 2L14.5 9L22 11.5L14.5 14L12 21L9.5 14L2 11.5L9.5 9L12 2Z" />
                    </svg>
                    <span className="text_button">{t('steps.step1_reserve_alone') || 'Reservar'}</span>
                    <svg className="sparkle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path className="path" d="M12 2L14.5 9L22 11.5L14.5 14L12 21L9.5 14L2 11.5L9.5 9L12 2Z" />
                    </svg>
                  </button>
                </div>

                <p className="text-[10px] md:text-xs text-brand-text-secondary/60 dark:text-dark-text-secondary/60 text-center mt-3 italic">
                  {t('steps.step1_hint') || 'Elige "Reservar" si vas solo, o "Añadir acompañante" si te acompañan más personas.'}
                </p>
              </div>
            )}

            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="bg-brand-primary/5 dark:bg-brand-primary/5 border border-brand-primary/15 rounded-3xl p-4 md:p-5 mb-4">
                  <p className="text-[10px] md:text-xs uppercase font-black text-brand-primary tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-[10px]">1</span>
                    {t('steps.step1_summary_label') || 'Reserva programada para'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 text-xs md:text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-brand-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                      <span className="text-brand-text-main dark:text-dark-text-main font-bold truncate">{reservationData.tour.tour_reserva || '—'}</span>
                    </div>
                    {reservationData.date.fecha_reserva && (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-brand-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-brand-text-main dark:text-dark-text-main font-bold">{reservationData.date.fecha_reserva}</span>
                      </div>
                    )}
                    {reservationData.time.label && (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-brand-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-brand-text-main dark:text-dark-text-main font-bold">{reservationData.time.label}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="section-container" id="companions-section">
                  <div className="flex items-center justify-between mb-4">
                    <label className="section-title-premium !mb-0">{t('steps.step2_section_title') || 'Información de participantes'}</label>
                    <span className="text-[10px] md:text-xs font-black uppercase px-3 py-1.5 rounded-full bg-brand-primary text-white">+{reservationData.companions.length}</span>
                  </div>
                  <CompanionFormSection companions={reservationData.companions} onCompanionChange={handleCompanionChange} onRemoveCompanion={removeCompanion} onAddCompanion={addCompanion} errors={errors} />
                </div>

                {isBuggy && (
                  <BuggyAllocationSection
                    participants={buggyParticipants}
                    allocation={reservationData.buggy}
                    pricing={reservationData.buggy?.pricing}
                    onCountChange={handleBuggyCountChange}
                    onSeatChange={handleBuggySeatChange}
                    formatCurrency={formatCurrency}
                    isEnglish={isEnglish}
                  />
                )}

                <div className="pt-2 grid gap-3 md:grid-cols-2">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="rounded-[1.25rem] px-6 py-4 md:py-5 font-black text-sm md:text-base uppercase tracking-wider border-2 border-brand-primary/20 text-brand-primary dark:text-brand-primary bg-transparent hover:bg-brand-primary/5 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    {t('steps.back_step1') || 'Volver al plan'}
                  </button>

                  <button
                    onClick={handleAddCompanions}
                    className="rounded-[1.25rem] px-6 py-4 md:py-5 font-black text-sm md:text-base uppercase tracking-wider border-2 border-brand-primary/40 text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 dark:bg-brand-primary/10 hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    {t('steps.add_participant') || 'Añadir participante'}
                  </button>
                </div>

                <button onClick={handleStep2Continue} className="btn-animate-continue w-full mt-2">
                  <div className="dots_border"></div>
                  <svg className="sparkle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path className="path" d="M12 2L14.5 9L22 11.5L14.5 14L12 21L9.5 14L2 11.5L9.5 9L12 2Z" />
                  </svg>
                  <span className="text_button">{t('steps.step2_continue') || 'Continuar con la reserva'}</span>
                  <svg className="sparkle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path className="path" d="M12 2L14.5 9L22 11.5L14.5 14L12 21L9.5 14L2 11.5L9.5 9L12 2Z" />
                  </svg>
                </button>
              </div>
            )}

            {showSummary && (
              <div id="reservation-summary" className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-10">
                <div className="card-premium p-6 md:p-10 space-y-8">
                  <div className="card-accent-line"></div>

                  <div className="text-center relative pt-4">
                    <h3 className="text-2xl md:text-3xl font-black text-brand-text-main dark:text-dark-text-main uppercase tracking-tight">{t('summary.title')}</h3>
                    <div className="h-1.5 w-16 bg-brand-primary mx-auto mt-3 rounded-full"></div>
                  </div>

                  <div className="grid gap-8">
                    <div className="space-y-4">
                      <p className="section-title-premium !ml-0">{t('summary.responsible')}</p>
                      <div className="bg-brand-light/30 dark:bg-dark-bg-main/30 rounded-[2rem] p-6 border border-brand-primary/10">
                        <p className="text-brand-text-main dark:text-dark-text-main font-black text-lg md:text-xl mb-3 break-words whitespace-normal">{reservationData.contact.nombre_jefe_reserva}</p>
                        <div className="grid sm:grid-cols-2 gap-y-2 gap-x-4">
                          <p className="text-brand-text-secondary dark:text-dark-text-secondary text-xs flex items-start gap-2 min-w-0">
                            <span className="w-1 h-1 bg-brand-primary/40 rounded-full mt-1.5 shrink-0"></span>
                            <span className="font-bold shrink-0">{reservationData.contact.tipo_documento}:</span>
                            <span className="min-w-0 whitespace-nowrap">{reservationData.contact.numero_documento}</span>
                          </p>
                          <p className="text-brand-text-secondary dark:text-dark-text-secondary text-xs flex items-start gap-2 min-w-0">
                            <span className="w-1 h-1 bg-brand-primary/40 rounded-full mt-1.5 shrink-0"></span>
                            <span className="font-bold shrink-0">Tel:</span>
                            <span className="min-w-0 whitespace-nowrap">{reservationData.contact.telefono_cliente}</span>
                          </p>
                          <p className="text-brand-text-secondary dark:text-dark-text-secondary text-xs flex items-start gap-2 sm:col-span-2 min-w-0">
                            <span className="w-1 h-1 bg-brand-primary/40 rounded-full mt-1.5 shrink-0"></span>
                            <span className="font-bold shrink-0">Email:</span>
                            <span className="min-w-0 break-all">{reservationData.contact.correo_contacto}</span>
                          </p>
                        </div>

                        <div className="flex gap-3 sm:gap-4 pt-3 mt-3 border-t border-brand-primary/5 flex-wrap">
                          {calculateAge(reservationData.contact.fecha_nacimiento) !== null && (
                            <p className="text-brand-text-secondary dark:text-dark-text-secondary text-[10px] flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-brand-primary/30 shrink-0"></span>
                              <span className="font-black text-brand-primary/50 mr-1 uppercase">{t('sections.age')}:</span>
                              <span className="font-black text-brand-dark/80 dark:text-brand-primary/90">{calculateAge(reservationData.contact.fecha_nacimiento)} {t('sections.age_suffix')}</span>
                            </p>
                          )}
                          {reservationData.contact.nacionalidad && (
                            <p className="text-brand-text-secondary dark:text-dark-text-secondary text-[10px] flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-brand-primary/30 shrink-0"></span>
                              <span className="font-black text-brand-primary/50 mr-1 uppercase">{t('sections.nationality')}:</span>
                              <CountryFlagImg value={reservationData.contact.nacionalidad} size="w40" alt="" className="!w-4 !h-4 rounded-full" />
                              <span className="font-black text-brand-dark/80 dark:text-brand-primary/90 ml-1">{getCountryName(reservationData.contact.nacionalidad)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {reservationData.companions.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-brand-light dark:border-dark-border">
                        <p className="section-title-premium !ml-0">{t('summary.registered_companions')} ({reservationData.companions.length})</p>
                        <div className="grid gap-4">
                          {reservationData.companions.map((comp, idx) => (
                            <div key={idx} className="bg-brand-light/30 dark:bg-dark-bg-main/30 rounded-[1.5rem] p-6 border border-brand-primary/10 group hover:border-brand-primary/30 transition-all">
                              <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black text-sm shrink-0">{idx + 1}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-2">
                                    <p className="text-brand-text-main dark:text-dark-text-main font-black text-base uppercase truncate pr-2">{comp.nombre}</p>
                                  </div>
                                  <div className="grid sm:grid-cols-2 gap-y-2 gap-x-4">
                                    <p className="text-brand-text-secondary dark:text-dark-text-secondary text-xs flex items-start gap-2 min-w-0">
                                      <span className="w-1 h-1 bg-brand-primary/40 rounded-full mt-1.5 shrink-0"></span>
                                      <span className="font-bold shrink-0">{comp.tipo_documento}:</span>
                                      <span className="min-w-0 sm:whitespace-nowrap">{comp.numero_documento}</span>
                                    </p>
                                    <p className="text-brand-text-secondary dark:text-dark-text-secondary text-xs flex items-start gap-2 min-w-0">
                                      <span className="w-1 h-1 bg-brand-primary/40 rounded-full mt-1.5 shrink-0"></span>
                                      <span className="font-bold shrink-0">Tel:</span>
                                      <span className="min-w-0 break-all">{comp.telefono}</span>
                                    </p>
                                    <p className="text-brand-text-secondary dark:text-dark-text-secondary text-xs flex items-start gap-2 sm:col-span-2 min-w-0">
                                      <span className="w-1 h-1 bg-brand-primary/40 rounded-full mt-1.5 shrink-0"></span>
                                      <span className="font-bold shrink-0">Email:</span>
                                      <span className="min-w-0 break-all">{comp.correo || '---'}</span>
                                    </p>
                                  </div>

                                  <div className="flex gap-3 sm:gap-4 pt-3 mt-3 border-t border-brand-primary/5 flex-wrap">
                                    {calculateAge(comp.fecha_nacimiento) !== null && (
                                      <p className="text-brand-text-secondary dark:text-dark-text-secondary text-[10px] flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-brand-primary/30 shrink-0"></span>
                                        <span className="font-black text-brand-primary/50 mr-1 uppercase">{t('sections.age')}:</span>
                                        <span className="font-black text-brand-dark/80 dark:text-brand-primary/90">{calculateAge(comp.fecha_nacimiento)} {t('sections.age_suffix')}</span>
                                      </p>
                                    )}
                                    {comp.nacionalidad && (
                                      <p className="text-brand-text-secondary dark:text-dark-text-secondary text-[10px] flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-brand-primary/30 shrink-0"></span>
                                        <span className="font-black text-brand-primary/50 mr-1 uppercase">{t('sections.nationality')}:</span>
                                        <CountryFlagImg value={comp.nacionalidad} size="w40" alt="" className="!w-4 !h-4 rounded-full" />
                                        <span className="font-black text-brand-dark/80 dark:text-brand-primary/90 ml-1">{getCountryName(comp.nacionalidad)}</span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-8">
                      <div className="space-y-4">
                        <p className="section-title-premium !ml-0">{t('summary.experience')}</p>
                        <div className="bg-brand-light/30 dark:bg-dark-bg-main/30 rounded-[2rem] p-6 border border-brand-primary/10 space-y-5">
                          <div className="space-y-1">
                            <p className="text-brand-text-main dark:text-dark-text-main font-black text-base sm:text-lg md:text-xl leading-snug break-words whitespace-normal">
                              <span className="mr-2">{getPlanEmoji(reservationData.tour.tour_reserva)}</span>
                              <span className="uppercase">{reservationData.tour.tour_reserva}</span>
                            </p>

                            {!subjectToAdvisor && !isBuggy && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-brand-primary font-black text-lg">{formatCurrency(reservationData.tour.precio_por_persona)}</span>
                                <span className="text-[10px] font-bold text-brand-text-secondary/60 dark:text-dark-text-secondary/60 uppercase tracking-wider">PRECIO POR PERSONA</span>
                              </div>
                            )}

                            {!subjectToAdvisor && isBuggy && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-brand-primary font-black text-lg">{reservationData.buggy?.count || 1} Buggy(s)</span>
                                <span className="text-[10px] font-bold text-brand-text-secondary/60 dark:text-dark-text-secondary/60 uppercase tracking-wider">
                                  PRECIO SEGÚN DISTRIBUCIÓN
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="pt-4 border-t border-brand-primary/10 flex items-center justify-between gap-4">
                            <span className="text-xs font-bold text-brand-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">PARTICIPANTES</span>
                            <span className="text-sm font-black text-brand-text-main dark:text-dark-text-main whitespace-nowrap">{totalParticipants} Persona(s)</span>
                          </div>

                          {isBuggy && (
                            <BuggyAllocationSection
                              participants={buggyParticipants}
                              allocation={reservationData.buggy}
                              pricing={reservationData.buggy?.pricing}
                              onCountChange={handleBuggyCountChange}
                              onSeatChange={handleBuggySeatChange}
                              formatCurrency={formatCurrency}
                              isEnglish={isEnglish}
                              compact
                            />
                          )}

                          <ReservationAdditionsSection
                            items={planAdditions}
                            quantities={additionQuantities}
                            people={totalParticipants}
                            onChange={handleAdditionQuantityChange}
                            formatCurrency={formatCurrency}
                            isEnglish={isEnglish}
                            loading={loadingAdditions}
                          />

                          {!subjectToAdvisor && planAdditions.length > 0 && additionsImpact !== 0 && (
                            <div className="rounded-[1.25rem] border border-brand-primary/15 bg-white/50 dark:bg-dark-bg-card/40 p-4 space-y-2">
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-bold text-brand-text-secondary dark:text-dark-text-secondary">{isEnglish ? 'Base plan' : 'Plan base'}</span>
                                <span className="font-black text-brand-text-main dark:text-dark-text-main">{formatCOP(baseTotalPrice)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-bold text-brand-text-secondary dark:text-dark-text-secondary">{isEnglish ? 'Add-ons adjustment' : 'Ajuste por adicionales'}</span>
                                <span className={`font-black ${additionsImpact > 0 ? 'text-brand-primary' : 'text-amber-600 dark:text-amber-300'}`}>
                                  {additionsImpact > 0 ? '+' : '−'}{formatCOP(Math.abs(additionsImpact))}
                                </span>
                              </div>
                            </div>
                          )}

                          {subjectToAdvisor ? (
                            <div className="rounded-[1.5rem] border-2 border-amber-400/40 bg-amber-400/10 p-5 sm:p-6 text-center space-y-3">
                              <div className="mx-auto w-11 h-11 rounded-full bg-amber-400/15 flex items-center justify-center text-xl" aria-hidden="true">⚠️</div>
                              <p className="text-[10px] sm:text-xs font-black text-amber-600 dark:text-amber-300 uppercase tracking-[0.16em] leading-relaxed">{advisorPriceTitle}</p>
                              <p className="text-sm font-bold text-brand-text-main dark:text-dark-text-main leading-relaxed">{advisorPriceDescription}</p>
                            </div>
                          ) : (
                            <>
                              <div className="rounded-[1.5rem] border-2 border-brand-primary/30 bg-brand-primary/10 p-5 text-center shadow-[0_10px_30px_-18px_rgba(140,201,21,0.8)]">
                                <p className="text-[10px] sm:text-xs font-black text-brand-primary uppercase tracking-[0.18em]">ABONO MÍNIMO PARA CONFIRMAR</p>
                                <p className="mt-2 text-2xl sm:text-3xl font-black text-brand-primary leading-none">{formatCOP(depositAmount)}</p>
                                <p className="mt-2 text-[10px] font-bold text-brand-text-secondary dark:text-dark-text-secondary">Corresponde al 30 % del valor total y garantiza tu cupo.</p>
                              </div>

                              <div className="space-y-3 rounded-[1.5rem] bg-white/50 dark:bg-dark-bg-card/40 border border-brand-primary/10 p-5">
                                <p className="text-[10px] font-black text-brand-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">RESUMEN DEL PAGO</p>
                                <div className="rounded-[1.25rem] border-2 border-brand-primary/25 bg-brand-primary/5 px-4 py-4 text-center">
                                  <p className="text-[10px] sm:text-xs font-black text-brand-text-secondary dark:text-dark-text-secondary uppercase tracking-[0.14em]">Valor total del plan</p>
                                  <p className="mt-1 text-2xl sm:text-3xl font-black text-brand-text-main dark:text-dark-text-main leading-none">{formatCOP(totalPrice)}</p>
                                  <p className="mt-2 text-[9px] sm:text-[10px] font-bold text-brand-primary uppercase tracking-wider">Para {totalParticipants} persona(s): responsable y acompañantes</p>
                                </div>
                                <div className="h-px bg-brand-primary/10"></div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-[10px] sm:text-xs font-bold text-brand-text-secondary dark:text-dark-text-secondary uppercase">Saldo para el día del evento</span>
                                  <span className="text-sm font-black text-brand-text-main dark:text-dark-text-main whitespace-nowrap">{formatCOP(remainingAmount)}</span>
                                </div>
                                <p className="pt-1 text-[10px] text-brand-text-secondary/70 dark:text-dark-text-secondary/70 font-medium">El saldo restante se paga el día de la actividad.</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <p className="section-title-premium !ml-0">{t('summary.date_time')}</p>
                        <div className="bg-brand-light/30 dark:bg-dark-bg-main/30 rounded-[2rem] p-6 border border-brand-primary/10 space-y-3">
                          <p className="text-brand-text-main dark:text-dark-text-main font-black text-sm sm:text-base md:text-lg capitalize leading-snug break-words whitespace-normal">
                            {reservationData.date.rawDate?.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </p>
                          {reservationData.time?.label ? (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <p className="text-brand-primary font-black text-xl md:text-2xl leading-none">{formatTime12h(reservationData.time.label)}</p>
                              <span className="text-[10px] font-black uppercase text-brand-text-secondary/50 dark:text-dark-text-secondary/50 tracking-widest">{getMeridiem(reservationData.time.label)}</span>
                            </div>
                          ) : null}
                          <p className="text-[10px] text-brand-text-secondary/60 dark:text-dark-text-secondary/60 font-black uppercase mt-2 tracking-widest">
                            {subjectToAdvisor
                              ? (isEnglish ? '⚠️ PRICE TO BE AGREED WITH ADVISOR' : '⚠️ PRECIO A DEFINIR CON EL ASESOR')
                              : reservationData.date.puede_variar_precio
                              ? '⚠️ ' + t('summary.subject_to_availability')
                              : '✅ ' + t('summary.confirmed')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <button
                      onClick={handleEditInformation}
                      className="flex-1 py-4 px-6 border-2 border-brand-border dark:border-dark-border hover:border-brand-primary/40 text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-primary font-black text-xs uppercase tracking-widest rounded-full transition-all duration-300 flex items-center justify-center gap-2 group"
                    >
                      <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {t('steps.edit_all') || t('summary.edit')}
                    </button>
                    <button
                      onClick={() => {
                        setShowSummary(false);
                        setCurrentStep(2);
                        setShowCompanionsSection(true);
                        setTimeout(() => {
                          document.getElementById('companions-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }}
                      className="flex-1 py-4 px-6 bg-brand-light dark:bg-dark-bg-main border-2 border-brand-primary/20 hover:border-brand-primary text-brand-dark dark:text-brand-primary font-black text-xs uppercase tracking-widest rounded-full transition-all duration-300 flex items-center justify-center gap-2 shadow-sm"
                    >
                      <svg className="w-4 h-4 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      {t('steps.edit_participants') || t('summary.add_companions')}
                    </button>
                  </div>

                  <div className="pt-4 text-center">
                    <p className="text-[11px] text-brand-text-secondary/40 dark:text-dark-text-secondary/40 font-bold uppercase tracking-[0.2em] italic">{t('summary.verify_data_hint')}</p>
                  </div>

                  <div className="pt-6 border-t border-brand-light dark:border-dark-border mt-8">
                    <button
                      onClick={handleProceedToPayment}
                      disabled={isSaving}
                      className={`btn-animate-continue w-full !bg-brand-primary group relative overflow-hidden ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      <div className="dots_border !border-white/30"></div>
                      <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      <svg className={`sparkle ${isSaving ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path className="path !stroke-white" d="M12 2L14.5 9L22 11.5L14.5 14L12 21L9.5 14L2 11.5L9.5 9L12 2Z"></path>
                      </svg>
                      <span className="text_button !text-white flex items-center justify-center gap-3">
                        {isSaving ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Procesando...
                          </span>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {t('summary.proceed_to_payment')}
                          </>
                        )}
                      </span>
                      <svg className="sparkle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path className="path !stroke-white" d="M12 2L14.5 9L22 11.5L14.5 14L12 21L9.5 14L2 11.5L9.5 9L12 2Z"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <PaymentModal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            experience={reservationData.tour.tour_reserva}
            participants={totalParticipants}
            totalAmount={paymentTotal ?? totalPrice}
            formatCurrency={formatCurrency}
            subjectToAdvisor={subjectToAdvisor}
          />
        </>
      )}

      <p className="mt-10 text-[10px] text-brand-text-secondary uppercase tracking-[0.2em] font-bold opacity-40">{t('home.experience_adrenaline')}</p>
    </div>
  );
};

export default HomePage;
