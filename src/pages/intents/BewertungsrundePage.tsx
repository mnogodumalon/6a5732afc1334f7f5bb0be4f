import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Sitzungen, Teilnehmer } from '@/types/app';
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconStar,
  IconUsers,
  IconThumbUp,
} from '@tabler/icons-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BewertungFields {
  gesamteindruck: string;
  relevanz: string;
  umsetzbarkeit: string;
  methodenqualitaet: string;
  wichtigste_erkenntnis: string;
  naechste_schritte: string;
  weiterempfehlung: boolean;
}

const EMPTY_BEWERTUNG: BewertungFields = {
  gesamteindruck: '',
  relevanz: '',
  umsetzbarkeit: '',
  methodenqualitaet: '',
  wichtigste_erkenntnis: '',
  naechste_schritte: '',
  weiterempfehlung: false,
};

const WIZARD_STEPS = [
  { label: 'Sitzung wählen' },
  { label: 'Bewertungen erfassen' },
  { label: 'Abschluss' },
];

// ─── Radio Tile Group ─────────────────────────────────────────────────────────

interface RadioTileGroupProps {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}

function RadioTileGroup({ options, value, onChange }: RadioTileGroupProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            value === opt.key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BewertungsrundePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Wizard state ──
  const [step, setStep] = useState<number>(() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    return s >= 1 && s <= 3 ? s : 1;
  });

  // ── Data state ──
  const [sitzungen, setSitzungen] = useState<Sitzungen[]>([]);
  const [teilnehmerAll, setTeilnehmerAll] = useState<Teilnehmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ── Selection state ──
  const [selectedSitzung, setSelectedSitzung] = useState<Sitzungen | null>(null);
  const [sessionTeilnehmer, setSessionTeilnehmer] = useState<Teilnehmer[]>([]);
  const [currentTeilnehmerIdx, setCurrentTeilnehmerIdx] = useState(0);
  const [bewertungen, setBewertungen] = useState<Map<string, BewertungFields>>(new Map());

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  // ── Fetch data ──
  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [sitzungenData, teilnehmerData] = await Promise.all([
        LivingAppsService.getSitzungen(),
        LivingAppsService.getTeilnehmer(),
      ]);
      setSitzungen(sitzungenData);
      setTeilnehmerAll(teilnehmerData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Deep-link: pre-select sitzung from URL ──
  useEffect(() => {
    const sitzungId = searchParams.get('sitzungId');
    if (!sitzungId || loading || sitzungen.length === 0) return;
    const found = sitzungen.find(s => s.record_id === sitzungId);
    if (found && !selectedSitzung) {
      handleSelectSitzung(found.record_id, sitzungen, teilnehmerAll);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sitzungen, teilnehmerAll]);

  // ── Sync step to URL ──
  const handleStepChange = useCallback((newStep: number) => {
    setStep(newStep);
    const params = new URLSearchParams(searchParams);
    params.set('step', String(newStep));
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Teilnehmer map ──
  const teilnehmerMap = useMemo(() => {
    const m = new Map<string, Teilnehmer>();
    teilnehmerAll.forEach(t => m.set(t.record_id, t));
    return m;
  }, [teilnehmerAll]);

  // ── Select sitzung and resolve participants ──
  function handleSelectSitzung(
    id: string,
    allSitzungen: Sitzungen[],
    allTeilnehmer: Teilnehmer[],
  ) {
    const sitzung = allSitzungen.find(s => s.record_id === id);
    if (!sitzung) return;

    setSelectedSitzung(sitzung);

    // teilnehmer field is multipleapplookup — raw value is string | string[]
    const rawTeilnehmer = sitzung.fields.teilnehmer;
    const urls: string[] = Array.isArray(rawTeilnehmer)
      ? rawTeilnehmer
      : typeof rawTeilnehmer === 'string' && rawTeilnehmer
      ? [rawTeilnehmer]
      : [];

    const ids = urls.map(u => extractRecordId(u)).filter((id): id is string => !!id);
    const tnMap = new Map<string, Teilnehmer>();
    allTeilnehmer.forEach(t => tnMap.set(t.record_id, t));
    const resolved = ids.map(tid => tnMap.get(tid)).filter((t): t is Teilnehmer => !!t);

    setSessionTeilnehmer(resolved);
    setCurrentTeilnehmerIdx(0);
    setBewertungen(new Map());

    const params = new URLSearchParams(searchParams);
    params.set('sitzungId', id);
    params.set('step', '2');
    setSearchParams(params, { replace: true });
    setStep(2);
  }

  // ── Current participant ──
  const currentTeilnehmer = sessionTeilnehmer[currentTeilnehmerIdx] ?? null;
  const totalTeilnehmer = sessionTeilnehmer.length;

  // ── Get/set bewertung for current participant ──
  function getBewertung(recordId: string): BewertungFields {
    return bewertungen.get(recordId) ?? { ...EMPTY_BEWERTUNG };
  }

  function setBewertungField<K extends keyof BewertungFields>(
    recordId: string,
    field: K,
    value: BewertungFields[K],
  ) {
    setBewertungen(prev => {
      const next = new Map(prev);
      const current = next.get(recordId) ?? { ...EMPTY_BEWERTUNG };
      next.set(recordId, { ...current, [field]: value });
      return next;
    });
  }

  // ── Count participants with at least gesamteindruck filled ──
  const filledCount = useMemo(() => {
    let count = 0;
    sessionTeilnehmer.forEach(t => {
      const b = bewertungen.get(t.record_id);
      if (b?.gesamteindruck) count++;
    });
    return count;
  }, [bewertungen, sessionTeilnehmer]);

  // ── Submit all bewertungen ──
  async function handleSubmitAll() {
    if (!selectedSitzung) return;
    setSubmitting(true);
    setSubmitError(null);

    const today = format(new Date(), 'yyyy-MM-dd');

    try {
      const promises = sessionTeilnehmer.map(async (t) => {
        const b = bewertungen.get(t.record_id);
        if (!b) return;
        await LivingAppsService.createBewertungenEntry({
          sitzung: createRecordUrl(APP_IDS.SITZUNGEN, selectedSitzung.record_id),
          teilnehmer: createRecordUrl(APP_IDS.TEILNEHMER, t.record_id),
          bewertungsdatum: today,
          gesamteindruck: b.gesamteindruck || undefined,
          relevanz: b.relevanz || undefined,
          umsetzbarkeit: b.umsetzbarkeit || undefined,
          methodenqualitaet: b.methodenqualitaet || undefined,
          wichtigste_erkenntnis: b.wichtigste_erkenntnis || undefined,
          naechste_schritte: b.naechste_schritte || undefined,
          weiterempfehlung: b.weiterempfehlung,
        });
      });

      await Promise.all(promises);

      const withData = sessionTeilnehmer.filter(t => bewertungen.get(t.record_id));
      setSavedCount(withData.length);
      handleStepChange(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Reset wizard ──
  function handleReset() {
    setSelectedSitzung(null);
    setSessionTeilnehmer([]);
    setCurrentTeilnehmerIdx(0);
    setBewertungen(new Map());
    setSavedCount(0);
    setSubmitError(null);
    const params = new URLSearchParams();
    setSearchParams(params, { replace: true });
    setStep(1);
  }

  // ── Lookup options ──
  const gesamteindruckOpts = LOOKUP_OPTIONS['bewertungen']?.['gesamteindruck'] ?? [];
  const relevanzOpts = LOOKUP_OPTIONS['bewertungen']?.['relevanz'] ?? [];
  const umsetzbarOpts = LOOKUP_OPTIONS['bewertungen']?.['umsetzbarkeit'] ?? [];
  const methodeOpts = LOOKUP_OPTIONS['bewertungen']?.['methodenqualitaet'] ?? [];

  // ── Summary stats ──
  const summaryStats = useMemo(() => {
    const empfCount = sessionTeilnehmer.filter(t => bewertungen.get(t.record_id)?.weiterempfehlung).length;
    const eindruckKeys = sessionTeilnehmer
      .map(t => bewertungen.get(t.record_id)?.gesamteindruck)
      .filter(Boolean) as string[];

    let mostFrequent = '';
    if (eindruckKeys.length > 0) {
      const freq = new Map<string, number>();
      eindruckKeys.forEach(k => freq.set(k, (freq.get(k) ?? 0) + 1));
      mostFrequent = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    }
    const mostFrequentLabel = gesamteindruckOpts.find(o => o.key === mostFrequent)?.label ?? mostFrequent;

    return { empfCount, mostFrequentLabel };
  }, [bewertungen, sessionTeilnehmer, gesamteindruckOpts]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <IntentWizardShell
      title="Bewertungsrunde"
      subtitle="Feedback aller Teilnehmer einer Sitzung erfassen"
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── STEP 1: Sitzung wählen ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wähle die Sitzung, für die du Bewertungen erfassen möchtest.
          </p>
          <EntitySelectStep
            searchPlaceholder="Sitzung suchen..."
            emptyText="Keine Sitzungen gefunden."
            emptyIcon={<IconCalendarEvent size={32} />}
            items={sitzungen.map(s => {
              const rawTeilnehmer = s.fields.teilnehmer;
              const urls: string[] = Array.isArray(rawTeilnehmer)
                ? rawTeilnehmer
                : typeof rawTeilnehmer === 'string' && rawTeilnehmer
                ? [rawTeilnehmer]
                : [];
              const tnCount = urls.length;

              let datumStr = '';
              if (s.fields.datum_uhrzeit) {
                try {
                  datumStr = format(parseISO(s.fields.datum_uhrzeit), 'dd.MM.yyyy HH:mm', { locale: de });
                } catch {
                  datumStr = s.fields.datum_uhrzeit;
                }
              }

              const moderator = [s.fields.moderator_vorname, s.fields.moderator_nachname]
                .filter(Boolean)
                .join(' ');

              return {
                id: s.record_id,
                title: s.fields.titel ?? '(Ohne Titel)',
                subtitle: moderator ? `Moderator: ${moderator}` : undefined,
                icon: <IconCalendarEvent size={20} className="text-primary" />,
                stats: [
                  ...(datumStr ? [{ label: 'Datum', value: datumStr }] : []),
                  { label: 'Teilnehmer', value: tnCount },
                ],
              };
            })}
            onSelect={(id) => handleSelectSitzung(id, sitzungen, teilnehmerAll)}
          />
        </div>
      )}

      {/* ── STEP 2: Bewertungen erfassen ───────────────────────────────────── */}
      {step === 2 && selectedSitzung && (
        <div className="space-y-4">
          {/* Sitzung header */}
          <div className="rounded-xl border bg-card p-4 overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <IconCalendarEvent size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{selectedSitzung.fields.titel ?? '(Ohne Titel)'}</p>
                {selectedSitzung.fields.datum_uhrzeit && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => {
                      try {
                        return format(parseISO(selectedSitzung.fields.datum_uhrzeit!), 'dd.MM.yyyy HH:mm', { locale: de });
                      } catch {
                        return selectedSitzung.fields.datum_uhrzeit;
                      }
                    })()}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setSelectedSitzung(null); handleStepChange(1); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 underline underline-offset-2"
              >
                Ändern
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <IconUsers size={13} />
                {filledCount} von {totalTeilnehmer} Teilnehmer bewertet
              </span>
              <span className="font-medium text-foreground">
                Teilnehmer {currentTeilnehmerIdx + 1} von {totalTeilnehmer}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: totalTeilnehmer > 0 ? `${(filledCount / totalTeilnehmer) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* No participants notice */}
          {totalTeilnehmer === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
              <IconUsers size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Dieser Sitzung sind keine Teilnehmer zugeordnet.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => handleStepChange(1)}>
                Andere Sitzung wählen
              </Button>
            </div>
          )}

          {/* Participant evaluation form */}
          {currentTeilnehmer && (
            <div className="rounded-xl border bg-card overflow-hidden">
              {/* Participant header */}
              <div className="px-4 pt-4 pb-3 border-b bg-secondary/30">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {(currentTeilnehmer.fields.vorname ?? '?')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {[currentTeilnehmer.fields.vorname, currentTeilnehmer.fields.nachname].filter(Boolean).join(' ') || '(Unbekannt)'}
                    </p>
                    {currentTeilnehmer.fields.organisation && (
                      <p className="text-xs text-muted-foreground truncate">{currentTeilnehmer.fields.organisation}</p>
                    )}
                  </div>
                  {bewertungen.get(currentTeilnehmer.record_id)?.gesamteindruck && (
                    <div className="ml-auto shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <IconCheck size={11} stroke={2.5} />
                        Bewertet
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Form fields */}
              <div className="p-4 space-y-4">
                {/* Gesamteindruck */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <IconStar size={13} className="text-amber-500" />
                    Gesamteindruck
                  </label>
                  <RadioTileGroup
                    options={gesamteindruckOpts}
                    value={getBewertung(currentTeilnehmer.record_id).gesamteindruck}
                    onChange={(k) => setBewertungField(currentTeilnehmer.record_id, 'gesamteindruck', k)}
                  />
                </div>

                {/* Relevanz */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Relevanz</label>
                  <RadioTileGroup
                    options={relevanzOpts}
                    value={getBewertung(currentTeilnehmer.record_id).relevanz}
                    onChange={(k) => setBewertungField(currentTeilnehmer.record_id, 'relevanz', k)}
                  />
                </div>

                {/* Umsetzbarkeit */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Umsetzbarkeit</label>
                  <RadioTileGroup
                    options={umsetzbarOpts}
                    value={getBewertung(currentTeilnehmer.record_id).umsetzbarkeit}
                    onChange={(k) => setBewertungField(currentTeilnehmer.record_id, 'umsetzbarkeit', k)}
                  />
                </div>

                {/* Methodenqualität */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Methodenqualität</label>
                  <RadioTileGroup
                    options={methodeOpts}
                    value={getBewertung(currentTeilnehmer.record_id).methodenqualitaet}
                    onChange={(k) => setBewertungField(currentTeilnehmer.record_id, 'methodenqualitaet', k)}
                  />
                </div>

                {/* Textfelder */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Wichtigste Erkenntnis</label>
                    <Textarea
                      rows={2}
                      placeholder="Was war die wichtigste Erkenntnis?"
                      value={getBewertung(currentTeilnehmer.record_id).wichtigste_erkenntnis}
                      onChange={(e) => setBewertungField(currentTeilnehmer.record_id, 'wichtigste_erkenntnis', e.target.value)}
                      className="text-sm resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Nächste Schritte</label>
                    <Textarea
                      rows={2}
                      placeholder="Was sind die nächsten Schritte?"
                      value={getBewertung(currentTeilnehmer.record_id).naechste_schritte}
                      onChange={(e) => setBewertungField(currentTeilnehmer.record_id, 'naechste_schritte', e.target.value)}
                      className="text-sm resize-none"
                    />
                  </div>
                </div>

                {/* Weiterempfehlung toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => setBewertungField(
                      currentTeilnehmer.record_id,
                      'weiterempfehlung',
                      !getBewertung(currentTeilnehmer.record_id).weiterempfehlung
                    )}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      getBewertung(currentTeilnehmer.record_id).weiterempfehlung
                        ? 'bg-green-50 border-green-300 text-green-800'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                      getBewertung(currentTeilnehmer.record_id).weiterempfehlung
                        ? 'bg-green-600 border-green-600'
                        : 'border-muted-foreground'
                    }`}>
                      {getBewertung(currentTeilnehmer.record_id).weiterempfehlung && (
                        <IconCheck size={12} className="text-white" stroke={3} />
                      )}
                    </div>
                    <IconThumbUp size={14} />
                    Würde ich weiterempfehlen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {totalTeilnehmer > 0 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => setCurrentTeilnehmerIdx(i => Math.max(0, i - 1))}
                disabled={currentTeilnehmerIdx === 0}
                className="gap-1.5"
              >
                <IconChevronLeft size={16} />
                Zurück
              </Button>

              {/* Participant dots */}
              <div className="flex gap-1.5 flex-wrap justify-center">
                {sessionTeilnehmer.map((t, idx) => {
                  const hasData = !!bewertungen.get(t.record_id)?.gesamteindruck;
                  return (
                    <button
                      key={t.record_id}
                      type="button"
                      onClick={() => setCurrentTeilnehmerIdx(idx)}
                      title={[t.fields.vorname, t.fields.nachname].filter(Boolean).join(' ')}
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        idx === currentTeilnehmerIdx
                          ? 'bg-primary scale-125'
                          : hasData
                          ? 'bg-green-500'
                          : 'bg-muted'
                      }`}
                    />
                  );
                })}
              </div>

              {currentTeilnehmerIdx < totalTeilnehmer - 1 ? (
                <Button
                  onClick={() => setCurrentTeilnehmerIdx(i => Math.min(totalTeilnehmer - 1, i + 1))}
                  className="gap-1.5"
                >
                  Weiter
                  <IconChevronRight size={16} />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmitAll}
                  disabled={submitting}
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                >
                  {submitting ? 'Speichern...' : 'Alle Bewertungen speichern'}
                  <IconCheck size={16} />
                </Button>
              )}
            </div>
          )}

          {submitError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: Abschluss ─────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Success card */}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-lg">
            <div className="bg-green-50 border-b border-green-100 px-6 py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-600 flex items-center justify-center mx-auto mb-4">
                <IconCheck size={28} className="text-white" stroke={2.5} />
              </div>
              <h2 className="text-xl font-bold text-green-900">Bewertungen gespeichert!</h2>
              <p className="text-sm text-green-700 mt-1">
                Alle Bewertungen wurden erfolgreich erfasst.
              </p>
            </div>

            <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Saved count */}
              <div className="text-center p-4 rounded-xl bg-secondary/50">
                <div className="text-3xl font-bold text-foreground">{savedCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Bewertungen erfasst</div>
              </div>

              {/* Most frequent gesamteindruck */}
              <div className="text-center p-4 rounded-xl bg-secondary/50">
                <div className="flex items-center justify-center mb-1">
                  <IconStar size={20} className="text-amber-500" />
                </div>
                <div className="text-sm font-semibold text-foreground truncate">
                  {summaryStats.mostFrequentLabel || '–'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Häufigster Gesamteindruck</div>
              </div>

              {/* Weiterempfehlungen */}
              <div className="text-center p-4 rounded-xl bg-secondary/50">
                <div className="text-3xl font-bold text-foreground">{summaryStats.empfCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Würden weiterempfehlen</div>
              </div>
            </div>

            {selectedSitzung && (
              <div className="px-6 pb-5">
                <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  Sitzung: <span className="font-medium text-foreground">{selectedSitzung.fields.titel ?? '(Ohne Titel)'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleReset} variant="outline" className="flex-1">
              Neue Bewertungsrunde starten
            </Button>
            <a href="#/" className="flex-1">
              <Button className="w-full">
                Zurück zum Dashboard
              </Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
