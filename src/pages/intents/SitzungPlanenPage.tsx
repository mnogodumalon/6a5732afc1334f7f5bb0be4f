import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { ErfahrungsraumFormate, Teilnehmer } from '@/types/app';
import {
  IconCalendarPlus,
  IconUsers,
  IconCheck,
  IconArrowRight,
  IconArrowLeft,
  IconRefresh,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Format wählen' },
  { label: 'Konfigurieren' },
  { label: 'Teilnehmer' },
  { label: 'Zusammenfassung' },
];

interface SitzungConfig {
  titel: string;
  datum_uhrzeit: string;
  moderator_vorname: string;
  moderator_nachname: string;
  ort_bezeichnung: string;
  stadt: string;
  agenda: string;
}

export default function SitzungPlanenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { erfahrungsraumFormate, teilnehmer, loading, error, fetchAll } = useDashboardData();

  // Step state (1-based to match IntentWizardShell)
  const [step, setStep] = useState<number>(() => {
    const urlStep = parseInt(searchParams.get('step') ?? '', 10);
    return urlStep >= 1 && urlStep <= 4 ? urlStep : 1;
  });

  // Selected format
  const [selectedFormat, setSelectedFormat] = useState<ErfahrungsraumFormate | null>(null);

  // Sitzung config form
  const [config, setConfig] = useState<SitzungConfig>({
    titel: '',
    datum_uhrzeit: '',
    moderator_vorname: '',
    moderator_nachname: '',
    ort_bezeichnung: '',
    stadt: '',
    agenda: '',
  });

  // Validation errors
  const [configErrors, setConfigErrors] = useState<Partial<Record<keyof SitzungConfig, string>>>({});

  // Selected Teilnehmer
  const [selectedTeilnehmerIds, setSelectedTeilnehmerIds] = useState<Set<string>>(new Set());

  // Teilnehmer search
  const [teilnehmerSearch, setTeilnehmerSearch] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Pre-select format from URL param ?formatId=XXX
  useEffect(() => {
    const formatId = searchParams.get('formatId');
    if (formatId && erfahrungsraumFormate.length > 0 && !selectedFormat) {
      const found = erfahrungsraumFormate.find(f => f.record_id === formatId);
      if (found) {
        setSelectedFormat(found);
        setConfig(prev => ({ ...prev, titel: found.fields.name ?? '' }));
        setStep(2);
      }
    }
  }, [erfahrungsraumFormate, searchParams, selectedFormat]);

  // Keep URL step param in sync
  const handleStepChange = useCallback((newStep: number) => {
    setStep(newStep);
    const params = new URLSearchParams(searchParams);
    if (newStep > 1) {
      params.set('step', String(newStep));
    } else {
      params.delete('step');
    }
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // --- Step 1: Format auswählen ---
  const handleFormatSelect = (id: string) => {
    const fmt = erfahrungsraumFormate.find(f => f.record_id === id);
    if (!fmt) return;
    setSelectedFormat(fmt);
    setConfig(prev => ({ ...prev, titel: fmt.fields.name ?? '' }));
    handleStepChange(2);
  };

  // --- Step 2: Validierung und Weiter ---
  const validateConfig = (): boolean => {
    const errors: Partial<Record<keyof SitzungConfig, string>> = {};
    if (!config.titel.trim()) errors.titel = 'Titel ist erforderlich';
    if (!config.datum_uhrzeit) errors.datum_uhrzeit = 'Datum und Uhrzeit sind erforderlich';
    setConfigErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleConfigNext = () => {
    if (validateConfig()) {
      handleStepChange(3);
    }
  };

  // --- Step 3: Teilnehmer toggle ---
  const toggleTeilnehmer = (id: string) => {
    setSelectedTeilnehmerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const maxTeilnehmer = selectedFormat?.fields.max_teilnehmer ?? Infinity;
  const selectedCount = selectedTeilnehmerIds.size;
  const isOverMax = selectedCount > maxTeilnehmer;

  const filteredTeilnehmer = teilnehmer.filter(t => {
    if (!teilnehmerSearch) return true;
    const q = teilnehmerSearch.toLowerCase();
    const name = `${t.fields.vorname ?? ''} ${t.fields.nachname ?? ''}`.toLowerCase();
    const org = (t.fields.organisation ?? '').toLowerCase();
    return name.includes(q) || org.includes(q);
  });

  // --- Step 4: Erstellen ---
  const handleCreate = async () => {
    if (!selectedFormat) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const teilnehmerUrls = Array.from(selectedTeilnehmerIds).map(id =>
        createRecordUrl(APP_IDS.TEILNEHMER, id)
      );
      const erfahrungsraumUrl = createRecordUrl(APP_IDS.ERFAHRUNGSRAUM_FORMATE, selectedFormat.record_id);

      const result = await LivingAppsService.createSitzungenEntry({
        titel: config.titel,
        datum_uhrzeit: config.datum_uhrzeit,
        moderator_vorname: config.moderator_vorname,
        moderator_nachname: config.moderator_nachname,
        ort_bezeichnung: config.ort_bezeichnung,
        stadt: config.stadt,
        agenda: config.agenda,
        erfahrungsraum: erfahrungsraumUrl,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        teilnehmer: teilnehmerUrls.length > 0 ? (teilnehmerUrls as any) : undefined,
      });
      setSuccessId(typeof result === 'string' ? result : 'ok');
      await fetchAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unbekannter Fehler beim Erstellen');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset wizard
  const handleReset = () => {
    setSelectedFormat(null);
    setConfig({
      titel: '',
      datum_uhrzeit: '',
      moderator_vorname: '',
      moderator_nachname: '',
      ort_bezeichnung: '',
      stadt: '',
      agenda: '',
    });
    setConfigErrors({});
    setSelectedTeilnehmerIds(new Set());
    setTeilnehmerSearch('');
    setSubmitError(null);
    setSuccessId(null);
    handleStepChange(1);
  };

  // Format selected Teilnehmer list
  const selectedTeilnehmerList: Teilnehmer[] = teilnehmer.filter(t =>
    selectedTeilnehmerIds.has(t.record_id)
  );

  return (
    <IntentWizardShell
      title="Sitzung planen"
      subtitle="Plane eine neue Sitzung Schritt für Schritt"
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Format wählen */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wähle das Format, das dieser Sitzung zugrunde liegt.
          </p>
          <EntitySelectStep
            items={erfahrungsraumFormate.map(f => ({
              id: f.record_id,
              title: f.fields.name ?? '(Kein Name)',
              subtitle: f.fields.zielgruppe ?? f.fields.methodik?.label,
              status: f.fields.status
                ? { key: f.fields.status.key, label: f.fields.status.label }
                : undefined,
              stats: [
                {
                  label: 'Max. Teilnehmer',
                  value: f.fields.max_teilnehmer != null ? f.fields.max_teilnehmer : '–',
                },
                {
                  label: 'Dauer',
                  value: f.fields.dauer_stunden != null ? `${f.fields.dauer_stunden}h` : '–',
                },
              ],
              icon: <IconCalendarPlus size={20} className="text-primary" />,
            }))}
            onSelect={handleFormatSelect}
            searchPlaceholder="Format suchen..."
            emptyText="Keine Formate gefunden."
            emptyIcon={<IconCalendarPlus size={32} />}
          />
        </div>
      )}

      {/* Step 2: Sitzung konfigurieren */}
      {step === 2 && selectedFormat && (
        <div className="space-y-6">
          {/* Selected format reminder */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <IconCalendarPlus size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Format</p>
              <p className="text-sm font-medium truncate">{selectedFormat.fields.name}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Titel */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Titel <span className="text-destructive">*</span>
              </label>
              <Input
                value={config.titel}
                onChange={e => {
                  setConfig(prev => ({ ...prev, titel: e.target.value }));
                  if (configErrors.titel) setConfigErrors(prev => ({ ...prev, titel: undefined }));
                }}
                placeholder="Sitzungstitel eingeben"
              />
              {configErrors.titel && (
                <p className="text-xs text-destructive">{configErrors.titel}</p>
              )}
            </div>

            {/* Datum & Uhrzeit */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Datum & Uhrzeit <span className="text-destructive">*</span>
              </label>
              <Input
                type="datetime-local"
                value={config.datum_uhrzeit}
                onChange={e => {
                  setConfig(prev => ({ ...prev, datum_uhrzeit: e.target.value }));
                  if (configErrors.datum_uhrzeit) setConfigErrors(prev => ({ ...prev, datum_uhrzeit: undefined }));
                }}
              />
              {configErrors.datum_uhrzeit && (
                <p className="text-xs text-destructive">{configErrors.datum_uhrzeit}</p>
              )}
            </div>

            {/* Moderator */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Moderator Vorname</label>
                <Input
                  value={config.moderator_vorname}
                  onChange={e => setConfig(prev => ({ ...prev, moderator_vorname: e.target.value }))}
                  placeholder="Vorname"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Moderator Nachname</label>
                <Input
                  value={config.moderator_nachname}
                  onChange={e => setConfig(prev => ({ ...prev, moderator_nachname: e.target.value }))}
                  placeholder="Nachname"
                />
              </div>
            </div>

            {/* Ort */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Ort / Bezeichnung</label>
                <Input
                  value={config.ort_bezeichnung}
                  onChange={e => setConfig(prev => ({ ...prev, ort_bezeichnung: e.target.value }))}
                  placeholder="z. B. Konferenzraum A"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Stadt</label>
                <Input
                  value={config.stadt}
                  onChange={e => setConfig(prev => ({ ...prev, stadt: e.target.value }))}
                  placeholder="z. B. Berlin"
                />
              </div>
            </div>

            {/* Agenda */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Agenda</label>
              <textarea
                value={config.agenda}
                onChange={e => setConfig(prev => ({ ...prev, agenda: e.target.value }))}
                placeholder="Agenda der Sitzung..."
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => handleStepChange(1)} className="gap-2">
              <IconArrowLeft size={16} />
              Zurück
            </Button>
            <Button onClick={handleConfigNext} className="gap-2 flex-1 sm:flex-none">
              Weiter zu Teilnehmern
              <IconArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Teilnehmer auswählen */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Counter */}
          <div className={`flex items-center justify-between p-3 rounded-xl border ${
            isOverMax
              ? 'bg-destructive/5 border-destructive/30'
              : 'bg-primary/5 border-primary/20'
          }`}>
            <div className="flex items-center gap-2">
              <IconUsers size={18} className={isOverMax ? 'text-destructive' : 'text-primary'} />
              <span className={`text-sm font-medium ${isOverMax ? 'text-destructive' : 'text-foreground'}`}>
                {selectedCount} von max.{' '}
                {maxTeilnehmer === Infinity ? '–' : maxTeilnehmer} Teilnehmer ausgewählt
              </span>
            </div>
            {isOverMax && (
              <span className="text-xs text-destructive font-medium">Limit überschritten</span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <Input
              placeholder="Teilnehmer suchen..."
              value={teilnehmerSearch}
              onChange={e => setTeilnehmerSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tile grid */}
          {filteredTeilnehmer.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IconUsers size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Keine Teilnehmer gefunden.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTeilnehmer.map(t => {
                const isSelected = selectedTeilnehmerIds.has(t.record_id);
                const fullName = [t.fields.vorname, t.fields.nachname].filter(Boolean).join(' ') || '(Unbekannt)';
                return (
                  <button
                    key={t.record_id}
                    onClick={() => toggleTeilnehmer(t.record_id)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors overflow-hidden ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'bg-card border-border hover:bg-accent hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox indicator */}
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border-2 transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground/40'
                      }`}>
                        {isSelected && <IconCheck size={12} stroke={3} className="text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{fullName}</p>
                        {t.fields.organisation && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{t.fields.organisation}</p>
                        )}
                        {t.fields.rolle && (
                          <p className="text-xs text-muted-foreground truncate">{t.fields.rolle}</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => handleStepChange(2)} className="gap-2">
              <IconArrowLeft size={16} />
              Zurück
            </Button>
            <Button
              onClick={() => handleStepChange(4)}
              disabled={isOverMax}
              className="gap-2 flex-1 sm:flex-none"
            >
              Weiter zur Zusammenfassung
              <IconArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Zusammenfassung & Erstellen */}
      {step === 4 && (
        <div className="space-y-6">
          {successId ? (
            /* Success state */
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <IconCheck size={28} className="text-primary" stroke={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Sitzung erfolgreich erstellt!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Die Sitzung <span className="font-medium text-foreground">"{config.titel}"</span> wurde angelegt.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset} className="gap-2">
                  <IconRefresh size={16} />
                  Neue Sitzung planen
                </Button>
                <a href="#/">
                  <Button variant="outline" className="gap-2 w-full sm:w-auto">
                    Zurück zum Dashboard
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            /* Summary card */
            <>
              <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b bg-secondary/30">
                  <h3 className="font-semibold text-foreground">Übersicht der Sitzung</h3>
                </div>
                <div className="divide-y">
                  <SummaryRow label="Format" value={selectedFormat?.fields.name ?? '–'} />
                  <SummaryRow
                    label="Datum & Uhrzeit"
                    value={
                      config.datum_uhrzeit
                        ? (() => {
                            try {
                              return format(parseISO(config.datum_uhrzeit), "EEEE, d. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de });
                            } catch {
                              return config.datum_uhrzeit;
                            }
                          })()
                        : '–'
                    }
                  />
                  <SummaryRow
                    label="Moderator"
                    value={
                      [config.moderator_vorname, config.moderator_nachname].filter(Boolean).join(' ') || '–'
                    }
                  />
                  <SummaryRow
                    label="Ort"
                    value={
                      [config.ort_bezeichnung, config.stadt].filter(Boolean).join(', ') || '–'
                    }
                  />
                  <SummaryRow
                    label="Teilnehmer"
                    value={`${selectedCount} ausgewählt`}
                  />
                  {config.agenda && (
                    <SummaryRow label="Agenda" value={config.agenda} multiline />
                  )}
                </div>
              </div>

              {/* Selected Teilnehmer list */}
              {selectedTeilnehmerList.length > 0 && (
                <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b bg-secondary/30">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <IconUsers size={16} className="text-muted-foreground" />
                      Ausgewählte Teilnehmer ({selectedTeilnehmerList.length})
                    </h3>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedTeilnehmerList.map(t => (
                      <div key={t.record_id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <IconCheck size={12} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {[t.fields.vorname, t.fields.nachname].filter(Boolean).join(' ') || '–'}
                          </p>
                          {t.fields.organisation && (
                            <p className="text-xs text-muted-foreground truncate">{t.fields.organisation}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive font-medium">Fehler beim Erstellen</p>
                  <p className="text-sm text-destructive/80 mt-1">{submitError}</p>
                </div>
              )}

              {/* Navigation */}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => handleStepChange(3)} className="gap-2" disabled={submitting}>
                  <IconArrowLeft size={16} />
                  Zurück
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="gap-2 flex-1 sm:flex-none"
                >
                  {submitting ? (
                    <>
                      <IconRefresh size={16} className="animate-spin" />
                      Wird erstellt...
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      Sitzung erstellen
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}

// Summary row helper
function SummaryRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="px-5 py-3 flex gap-4">
      <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={`text-sm text-foreground font-medium flex-1 min-w-0 ${multiline ? 'whitespace-pre-wrap' : 'truncate'}`}>
        {value}
      </span>
    </div>
  );
}
