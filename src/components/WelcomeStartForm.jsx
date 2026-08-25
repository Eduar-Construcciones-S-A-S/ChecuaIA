import { useEffect, useRef, useState } from 'react';
import PhoneInputPkg from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

const PhoneInput = PhoneInputPkg.default || PhoneInputPkg;

const WelcomeStartForm = ({
  t,
  phone,
  selectedCountry,
  onPhoneChange,
  isValid,
  clientStatus,
  selectedTourId,
  selectedGroupId,
  onTourChange,
  onSubplanChange,
  tours,
  subplans = [],
  loading,
  loadingSubplans,
  acceptedTerms,
  onTermsChange,
  isProcessing,
  onContinue,
  lookupError,
  isEnglish
}) => {
  const [isTourDropdownOpen, setIsTourDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [phoneDropdownPosition, setPhoneDropdownPosition] = useState('down');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const phoneContainerRef = useRef(null);

  const selectedMainTour = tours.find((tour) => String(tour.id) === String(selectedGroupId || selectedTourId));
  const selectedSubplan = subplans.find((tour) => String(tour.id) === String(selectedTourId));
  const selectedIsGroup = Boolean(selectedMainTour?.es_grupo);

  const filteredTours = !searchTerm.trim()
    ? tours
    : tours.filter((tour) => {
        const term = searchTerm.toLowerCase().trim();
        return tour.name?.toLowerCase().includes(term)
          || tour.description?.toLowerCase().includes(term)
          || tour.category?.toLowerCase().includes(term);
      });

  const copy = {
    checking: isEnglish ? 'Checking client' : 'Verificando cliente',
    found: isEnglish ? 'Existing client' : 'Cliente encontrado',
    newClient: isEnglish ? 'New client' : 'Cliente nuevo',
    processing: isEnglish ? 'Processing...' : 'Procesando...',
    chooseRoute: isEnglish ? 'Choose your route' : 'Elige la ruta de Buggy',
    routePlaceholder: isEnglish ? 'Select a route' : 'Selecciona una ruta',
    routesAvailable: isEnglish ? 'Choose route' : 'Ver rutas',
    loadingRoutes: isEnglish ? 'Loading routes...' : 'Cargando rutas...'
  };

  useEffect(() => {
    const onClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsTourDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!isTourDropdownOpen) return undefined;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [isTourDropdownOpen]);

  const handlePhoneDropdownClick = () => {
    if (!phoneContainerRef.current) return;
    const rect = phoneContainerRef.current.getBoundingClientRect();
    setPhoneDropdownPosition(
      window.innerHeight - rect.bottom < 300 && rect.top > 300 ? 'up' : 'down'
    );
  };

  const canContinue = acceptedTerms && isValid && selectedTourId && !isProcessing;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl md:text-3xl font-black text-brand-text-main dark:text-dark-text-main uppercase tracking-tight">
          {t('welcome.title')}
        </h2>
        <p className="text-sm md:text-base text-brand-text-secondary dark:text-dark-text-secondary font-medium">
          {t('welcome.subtitle')}
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] ml-4">
            {t('welcome.phone_label')}
          </label>
          <div
            ref={phoneContainerRef}
            onClick={handlePhoneDropdownClick}
            className={`relative welcome-phone-input-v2 ${phoneDropdownPosition === 'up' ? 'drop-up' : ''}`}
          >
            <PhoneInput
              country={selectedCountry}
              value={phone}
              onChange={onPhoneChange}
              disableCountryGuess
              enableSearch
              searchPlaceholder={t('welcome.search_placeholder')}
              searchNotFound={t('welcome.search_not_found') || '...'}
              placeholder={t('welcome.phone_placeholder')}
              containerClass="!w-full !font-sans"
              inputClass="!w-full !h-auto !py-4 !pl-[88px] !pr-5 !bg-brand-light/30 dark:!bg-dark-bg-main/50 !border-2 !border-brand-border dark:!border-dark-border !rounded-full !text-brand-text-main dark:!text-dark-text-main !font-bold !text-base focus:!border-brand-primary focus:!ring-4 focus:!ring-brand-primary/5 !transition-all !duration-300"
              buttonClass="!bg-transparent !border-none !rounded-l-full !pl-4 hover:!bg-brand-primary/5 !transition-colors"
              dropdownClass={`welcome-phone-dropdown ${phoneDropdownPosition === 'up' ? 'open-up' : ''}`}
              searchClass="welcome-phone-search"
            />
          </div>

          <div className="min-h-5 px-4 flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider">
              {clientStatus === 'checking' && <span className="text-brand-primary">● {copy.checking}</span>}
              {clientStatus === 'found' && <span className="text-brand-primary">✓ {copy.found}</span>}
              {clientStatus === 'not_found' && <span className="text-brand-text-secondary dark:text-dark-text-secondary">＋ {copy.newClient}</span>}
              {clientStatus === 'created' && <span className="text-brand-primary">✓ {copy.newClient}</span>}
              {clientStatus === 'error' && <span className="text-red-500">! {lookupError}</span>}
            </span>
            {phone && (
              <span className={`text-[9px] font-black uppercase tracking-widest ${isValid ? 'text-brand-primary' : 'text-red-400'}`}>
                {isValid ? t('welcome.phone_valid') : t('welcome.phone_invalid')}
              </span>
            )}
          </div>
        </div>

        <div className={`space-y-2 transition-all ${isTourDropdownOpen ? 'pb-[320px]' : ''}`} ref={dropdownRef}>
          <label className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] ml-4">
            {t('welcome.experience_label')}
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTourDropdownOpen((open) => !open)}
              className={`w-full px-6 py-4 bg-brand-light/30 dark:bg-dark-bg-main/50 border-2 rounded-full text-left transition-all flex items-center justify-between gap-4 ${isTourDropdownOpen ? 'border-brand-primary ring-4 ring-brand-primary/5' : 'border-brand-border dark:border-dark-border hover:border-brand-primary/50'}`}
            >
              {selectedMainTour ? (
                <div className="min-w-0">
                  <p className="text-brand-text-main dark:text-dark-text-main font-bold text-sm md:text-base truncate">{selectedMainTour.name}</p>
                  <p className="text-brand-primary font-black text-sm mt-1">
                    {selectedMainTour.es_grupo ? copy.routesAvailable : `$${Number(selectedMainTour.price || 0).toLocaleString('es-CO')}`}
                  </p>
                </div>
              ) : (
                <span className="text-brand-text-secondary/60 dark:text-dark-text-secondary/60 font-bold text-sm md:text-base">{t('welcome.experience_placeholder')}</span>
              )}
              <span className={`text-brand-primary text-lg transition-transform ${isTourDropdownOpen ? 'rotate-180' : ''}`}>⌄</span>
            </button>

            {isTourDropdownOpen && (
              <div className="absolute left-0 right-0 mt-3 bg-white dark:bg-dark-bg-card border-2 border-brand-border dark:border-dark-border rounded-[1.5rem] shadow-2xl z-[1001] overflow-hidden">
                <div className="p-3 border-b border-brand-light dark:border-dark-border">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={t('welcome.search_tour_placeholder') || 'Buscar experiencia...'}
                    className="w-full px-4 py-3 bg-brand-light/30 dark:bg-dark-bg-main/50 rounded-xl text-sm font-bold text-brand-text-main dark:text-dark-text-main outline-none border-2 border-transparent focus:border-brand-primary/30"
                  />
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {loading ? (
                    <div className="p-8 text-center text-sm font-bold text-brand-text-secondary">{t('welcome.loading_tours')}</div>
                  ) : filteredTours.length ? (
                    filteredTours.map((tour) => (
                      <button
                        key={tour.id}
                        type="button"
                        onClick={() => {
                          onTourChange(String(tour.id));
                          setIsTourDropdownOpen(false);
                          setSearchTerm('');
                        }}
                        className={`w-full px-5 py-4 text-left border-b border-brand-light dark:border-dark-border last:border-0 transition-colors ${String(selectedGroupId || selectedTourId) === String(tour.id) ? 'bg-brand-primary/10' : 'hover:bg-brand-light/50 dark:hover:bg-dark-bg-main/50'}`}
                      >
                        <p className="font-bold text-sm text-brand-text-main dark:text-dark-text-main">{tour.name}</p>
                        <p className="text-brand-primary font-black text-sm mt-1">
                          {tour.es_grupo ? copy.routesAvailable : `$${Number(tour.price || 0).toLocaleString('es-CO')}`}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="p-8 text-center text-sm font-bold text-brand-text-secondary">{t('welcome.no_tours_found') || 'No encontramos experiencias.'}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedIsGroup && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] ml-4">
              🚙 {copy.chooseRoute}
            </label>
            <div className="relative">
              <select
                value={selectedTourId}
                onChange={(event) => onSubplanChange(event.target.value)}
                disabled={loadingSubplans || !subplans.length}
                className="w-full appearance-none px-6 py-4 pr-12 bg-brand-light/30 dark:bg-dark-bg-main/50 border-2 border-brand-border dark:border-dark-border rounded-full text-brand-text-main dark:text-dark-text-main font-bold text-sm md:text-base outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/5 disabled:opacity-60"
              >
                <option value="">{loadingSubplans ? copy.loadingRoutes : copy.routePlaceholder}</option>
                {subplans.map((route) => (
                  <option key={route.id} value={String(route.id)}>
                    {route.name} · ${Number(route.price || 0).toLocaleString('es-CO')}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-brand-primary">⌄</span>
            </div>
            {selectedSubplan && (
              <div className="mx-2 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3">
                <p className="text-xs font-black text-brand-text-main dark:text-dark-text-main">{selectedSubplan.name}</p>
                <p className="text-sm font-black text-brand-primary mt-1">Desde ${Number(selectedSubplan.price || 0).toLocaleString('es-CO')}</p>
                <p className="text-[10px] text-brand-text-secondary dark:text-dark-text-secondary mt-1">El valor final depende de si viaja 1 o 2 personas en el Buggy.</p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 pt-2">
          <p className="text-[11px] text-brand-text-secondary dark:text-dark-text-secondary leading-relaxed ml-1">{t('welcome.terms_authorize')}</p>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => onTermsChange(event.target.checked)}
              className="mt-0.5 h-5 w-5 accent-brand-primary"
            />
            <span className="text-xs font-bold text-brand-text-main dark:text-dark-text-main group-hover:text-brand-primary transition-colors">{t('welcome.terms_accept')}</span>
          </label>
        </div>
      </div>

      {lookupError && clientStatus !== 'error' && <p className="text-sm font-bold text-red-500 text-center">{lookupError}</p>}

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="btn-animate-continue w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="dots_border" />
        <span className="text_button">{isProcessing ? copy.processing : t('welcome.continue')}</span>
      </button>
    </div>
  );
};

export default WelcomeStartForm;