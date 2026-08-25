import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { findClientByPhone, findOrCreateClient, updateClientPlan } from '../services/clientService';
import { getReservationsByPhone } from '../services/reservationService';
import { getSubplans } from '../services/tourService';
import ExistingReservationsPanel from './ExistingReservationsPanel';
import WelcomeStartForm from './WelcomeStartForm';

const WelcomeModal = ({ isOpen, onComplete, onClose, tours = [], loading = false, initialPhone = '', initialTourId = '', theme, toggleTheme }) => {
  const { t, i18n } = useTranslation();
  const [phone, setPhone] = useState(initialPhone);
  const [selectedCountry, setSelectedCountry] = useState(initialPhone ? undefined : 'co');
  const [selectedTourId, setSelectedTourId] = useState(initialTourId ? String(initialTourId) : '');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [subplans, setSubplans] = useState([]);
  const [loadingSubplans, setLoadingSubplans] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [clientStatus, setClientStatus] = useState('idle');
  const [clientData, setClientData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [existingReservations, setExistingReservations] = useState([]);
  const [showExistingReservations, setShowExistingReservations] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const lookupSequenceRef = useRef(0);
  const isEnglish = i18n.language?.startsWith('en');

  const lookupErrorCopy = isEnglish
    ? 'We could not verify your information. Please try again.'
    : 'No pudimos verificar la información. Intenta nuevamente.';

  const phoneWithPlus = useMemo(() => {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }, [phone]);

  const isValid = useMemo(() => {
    if (!phoneWithPlus) return false;
    try { return isValidPhoneNumber(phoneWithPlus); } catch { return false; }
  }, [phoneWithPlus]);

  useEffect(() => {
    if (initialPhone) setPhone(String(initialPhone).replace(/\D/g, ''));
    if (initialTourId) setSelectedTourId(String(initialTourId));
  }, [initialPhone, initialTourId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setShowExistingReservations(false);
    setExistingReservations([]);
    setLookupError('');

    if (!isValid) {
      setClientStatus('idle');
      setClientData(null);
      return undefined;
    }

    const sequence = ++lookupSequenceRef.current;
    setClientStatus('checking');
    const timer = setTimeout(async () => {
      const { data, error } = await findClientByPhone(phoneWithPlus);
      if (sequence !== lookupSequenceRef.current) return;

      if (error) {
        console.error('Error al verificar cliente:', error);
        setClientStatus('error');
        setClientData(null);
        setLookupError(lookupErrorCopy);
        return;
      }

      if (data) {
        setClientStatus('found');
        setClientData(data);
        if (data.id_plan && !selectedTourId) setSelectedTourId(String(data.id_plan));
      } else {
        setClientStatus('not_found');
        setClientData(null);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [isOpen, isValid, phoneWithPlus]);

  const handlePhoneChange = (nextPhone, countryData = {}) => {
    const normalizedPhone = String(nextPhone || '').replace(/\D/g, '');
    const dialCode = String(countryData?.dialCode || '');
    const hasSelectedPrefix = Boolean(dialCode) && normalizedPhone.startsWith(dialCode);

    lookupSequenceRef.current += 1;
    setPhone(normalizedPhone);
    setSelectedCountry(normalizedPhone && hasSelectedPrefix && countryData?.countryCode ? countryData.countryCode : null);
    setClientStatus('idle');
    setClientData(null);
    setShowExistingReservations(false);
    setExistingReservations([]);
    setLookupError('');
  };

  const handleMainTourChange = async (tourId) => {
    const selected = tours.find(item => String(item.id) === String(tourId));
    if (!selected) return;

    if (selected.es_grupo) {
      setSelectedGroupId(String(selected.id));
      setSelectedTourId('');
      setSubplans([]);
      setLoadingSubplans(true);
      try {
        const children = await getSubplans(selected.id);
        setSubplans(children);
      } finally {
        setLoadingSubplans(false);
      }
      return;
    }

    setSelectedGroupId('');
    setSubplans([]);
    setSelectedTourId(String(selected.id));
  };

  const continueToNewReservation = async (resolvedClient = clientData) => {
    const tour = [...tours, ...subplans].find((item) => String(item.id) === String(selectedTourId));
    if (!tour) return;

    const { error: planError } = await updateClientPlan(phoneWithPlus, selectedTourId);
    if (planError) console.error('Error al actualizar el plan del cliente:', planError);

    await onComplete({ phone: phoneWithPlus, tour, client: resolvedClient });
  };

  const handleContinue = async () => {
    if (!acceptedTerms || !isValid || !selectedTourId || isProcessing) return;
    setIsProcessing(true);
    setLookupError('');

    try {
      const { data: resolvedClient, status, error } = await findOrCreateClient(phoneWithPlus);
      if (error || !resolvedClient) {
        setClientStatus('error');
        setLookupError(lookupErrorCopy);
        return;
      }

      setClientData(resolvedClient);
      setClientStatus(status === 'created' ? 'created' : 'found');

      if (status === 'found') {
        const { data: reservations, error: reservationsError } = await getReservationsByPhone(phoneWithPlus);
        if (reservationsError) {
          console.error('Error al consultar reservas existentes:', reservationsError);
        } else if (reservations.length) {
          setExistingReservations(reservations);
          setShowExistingReservations(true);
          return;
        }
      }

      await continueToNewReservation(resolvedClient);
    } catch (error) {
      console.error('Error inesperado al continuar:', error);
      setLookupError(lookupErrorCopy);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateNew = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setLookupError('');
    try {
      await continueToNewReservation(clientData);
    } catch (error) {
      console.error('Error al iniciar una nueva reserva:', error);
      setLookupError(lookupErrorCopy);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-brand-dark/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-dark-bg-card rounded-[2.5rem] shadow-2xl relative border border-brand-border dark:border-dark-border animate-in zoom-in-95 duration-300 my-auto overflow-visible">
        <div className="h-2 w-full bg-brand-primary rounded-t-[2.5rem]" />

        <div className="absolute top-6 right-6 flex items-center gap-3 z-20">
          <button type="button" onClick={toggleTheme} className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all shadow-sm border-2 ${theme === 'light' ? 'bg-white border-brand-border text-amber-500' : 'bg-dark-bg-main border-dark-border text-brand-primary'}`} aria-label="Cambiar tema">
            {theme === 'light' ? '☀️' : '🌙'}
          </button>

          <div className="flex bg-brand-light/50 dark:bg-dark-bg-main/50 p-1.5 rounded-2xl border-2 border-brand-border dark:border-dark-border gap-1">
            {['es', 'en'].map((lng) => (
              <button key={lng} type="button" onClick={() => i18n.changeLanguage(lng)} className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${i18n.language.startsWith(lng) ? 'bg-brand-primary text-white shadow-md' : 'text-brand-text-secondary dark:text-dark-text-secondary'}`}>
                {lng.toUpperCase()}
              </button>
            ))}
          </div>

          {initialPhone && <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl text-brand-text-secondary hover:text-red-500" aria-label="Cerrar">✕</button>}
        </div>

        <div className="px-6 pt-20 pb-8 md:pt-24 md:pb-10 md:px-10">
          {showExistingReservations ? (
            <ExistingReservationsPanel reservations={existingReservations} tours={[...tours, ...subplans]} isEnglish={isEnglish} isProcessing={isProcessing} errorMessage={lookupError} onBack={() => setShowExistingReservations(false)} onCreateNew={handleCreateNew} />
          ) : (
            <WelcomeStartForm
              t={t}
              phone={phone}
              selectedCountry={selectedCountry}
              onPhoneChange={handlePhoneChange}
              isValid={isValid}
              clientStatus={clientStatus}
              selectedTourId={selectedTourId}
              selectedGroupId={selectedGroupId}
              onTourChange={handleMainTourChange}
              onSubplanChange={setSelectedTourId}
              tours={tours}
              subplans={subplans}
              loading={loading}
              loadingSubplans={loadingSubplans}
              acceptedTerms={acceptedTerms}
              onTermsChange={setAcceptedTerms}
              isProcessing={isProcessing}
              onContinue={handleContinue}
              lookupError={lookupError}
              isEnglish={isEnglish}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;