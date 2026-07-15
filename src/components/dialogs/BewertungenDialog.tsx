import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Bewertungen, Sitzungen, Teilnehmer, LookupValue } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { extractRecordId, createRecordUrl, cleanFieldsForApi, getUserProfile, LivingAppsService } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ComputedContext } from '@/config/form-enhancements/types';
import { applyFieldOrder, flattenFieldOrder, applyDefaults, evalComputed, numberInputProps, clampNumberValue, classifyComputed, extractApplookupRefs, mergeApplookupRefs, resolveApplookupRef } from '@/config/form-enhancements/types';
import { formEnhancements, computedDeps, computedApplookupRefs } from '@/config/form-enhancements/Bewertungen';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/Combobox';
import { SitzungenDialog } from '@/components/dialogs/SitzungenDialog';
import { TeilnehmerDialog } from '@/components/dialogs/TeilnehmerDialog';
import { DatePicker } from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import { IconAlertCircle, IconCamera, IconChevronDown, IconCircleCheck, IconClipboard, IconFileText, IconLoader2, IconPhotoPlus, IconSparkles, IconUpload, IconX } from '@tabler/icons-react';
import { fileToDataUri, extractFromInput, extractPhotoMeta, reverseGeocode } from '@/lib/ai';
import { lookupKey } from '@/lib/formatters';

interface BewertungenDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: Bewertungen['fields']) => Promise<void>;
  /** SHAPE-TOLERANT: lookup fields accept the bare key (string) or the
   *  LookupValue object; applookup fields the bare record id or the full
   *  record URL — the dialog normalizes both. */
  defaultValues?: Omit<Bewertungen['fields'], 'gesamteindruck' | 'relevanz' | 'umsetzbarkeit' | 'methodenqualitaet'> & {
    gesamteindruck?: LookupValue | string;
    relevanz?: LookupValue | string;
    umsetzbarkeit?: LookupValue | string;
    methodenqualitaet?: LookupValue | string;
  };
  /** Record id when editing — enables the attachments section. Omit on create. */
  recordId?: string;
  sitzungenList: Sitzungen[];
  teilnehmerList: Teilnehmer[];
  enablePhotoScan?: boolean;
  enablePhotoLocation?: boolean;
}

// defaultValues are SHAPE-TOLERANT: the dialog resolves bare lookup keys via
// its own options and bare record ids via the field's target app — consumers
// never carry the LookupValue/record-URL shape in their head.
const NORMALIZE_LOOKUPS: Record<string, readonly { key: string; label: string }[]> = {
  gesamteindruck: LOOKUP_OPTIONS['bewertungen']?.['gesamteindruck'] ?? [],
  relevanz: LOOKUP_OPTIONS['bewertungen']?.['relevanz'] ?? [],
  umsetzbarkeit: LOOKUP_OPTIONS['bewertungen']?.['umsetzbarkeit'] ?? [],
  methodenqualitaet: LOOKUP_OPTIONS['bewertungen']?.['methodenqualitaet'] ?? [],
};
const NORMALIZE_APPLOOKUPS: Record<string, string> = {
  sitzung: APP_IDS.SITZUNGEN,
  teilnehmer: APP_IDS.TEILNEHMER,
};
function normalizeDefaults(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const [k, opts] of Object.entries(NORMALIZE_LOOKUPS)) {
    const v = out[k];
    if (typeof v === 'string') out[k] = opts.find(o => o.key === v) ?? { key: v, label: v };
    else if (Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' ? opts.find(o => o.key === x) ?? { key: x, label: x } : x));
  }
  for (const [k, appId] of Object.entries(NORMALIZE_APPLOOKUPS)) {
    const v = out[k];
    if (typeof v === 'string' && v !== '' && !v.startsWith('http')) out[k] = createRecordUrl(appId, v);
    else if (Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' && x !== '' && !x.startsWith('http') ? createRecordUrl(appId, x) : x));
  }
  return out;
}

export function BewertungenDialog({ open, onClose, onSubmit, defaultValues, recordId, sitzungenList, teilnehmerList, enablePhotoScan = true, enablePhotoLocation = true }: BewertungenDialogProps) {
  const [fields, setFields] = useState<Partial<Bewertungen['fields']>>({});
  const [saving, setSaving] = useState(false);
  const normalizedDefaults = useMemo<Record<string, unknown> | undefined>(
    () => (defaultValues ? normalizeDefaults(defaultValues as Record<string, unknown>) : undefined),
    [defaultValues],
  );
  // Dirty-tracking: in edit-mode the Speichern button is disabled until the
  // user actually changes something. JSON.stringify is good enough for our
  // fields (plain values + LookupValue objects + string arrays).
  const isDirty = useMemo(() => {
    if (!normalizedDefaults) return true;  // create-mode: always allow submit
    try {
      return JSON.stringify(fields) !== JSON.stringify(normalizedDefaults);
    } catch {
      return true;
    }
  }, [fields, normalizedDefaults]);
  // Inline-Create state for "Sitzungen" target. The dropdown's
  // "+ Neuer …" option opens a sub-dialog; on submit we POST, add the new
  // record to the local `extraSitzungen` list, and select it in
  // the originating Combobox via the captured `createSitzungenField`.
  const [createSitzungenOpen, setCreateSitzungenOpen] = useState(false);
  const [createSitzungenInitial, setCreateSitzungenInitial] = useState('');
  const [createSitzungenField, setCreateSitzungenField] = useState<string>('');
  const [extraSitzungen, setExtraSitzungen] = useState< Sitzungen[]>([]);
  const sitzungenListAll = useMemo(
    () => [...sitzungenList, ...extraSitzungen],
    [sitzungenList, extraSitzungen],
  );
  function openCreateSitzungen(fieldKey: string, q: string) {
    setCreateSitzungenField(fieldKey);
    setCreateSitzungenInitial(q);
    setCreateSitzungenOpen(true);
  }
  // Inline-Create state for "Teilnehmer" target. The dropdown's
  // "+ Neuer …" option opens a sub-dialog; on submit we POST, add the new
  // record to the local `extraTeilnehmer` list, and select it in
  // the originating Combobox via the captured `createTeilnehmerField`.
  const [createTeilnehmerOpen, setCreateTeilnehmerOpen] = useState(false);
  const [createTeilnehmerInitial, setCreateTeilnehmerInitial] = useState('');
  const [createTeilnehmerField, setCreateTeilnehmerField] = useState<string>('');
  const [extraTeilnehmer, setExtraTeilnehmer] = useState< Teilnehmer[]>([]);
  const teilnehmerListAll = useMemo(
    () => [...teilnehmerList, ...extraTeilnehmer],
    [teilnehmerList, extraTeilnehmer],
  );
  function openCreateTeilnehmer(fieldKey: string, q: string) {
    setCreateTeilnehmerField(fieldKey);
    setCreateTeilnehmerInitial(q);
    setCreateTeilnehmerOpen(true);
  }
  const [showErrors, setShowErrors] = useState(false);
  const REQUIRED_FIELDS = ['sitzung', 'teilnehmer', 'gesamteindruck'] as const;
  const missingRequired = REQUIRED_FIELDS.filter(k => {
    const v = (fields as Record<string, unknown>)[k];
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [usePersonalInfo, setUsePersonalInfo] = useState(() => {
    try { return localStorage.getItem('ai-use-personal-info') === 'true'; } catch { return false; }
  });
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [aiText, setAiText] = useState('');

  // Computed-field plumbing. Pure no-op when formEnhancements.computed is {}.
  // The number renderer uses computedValues only as a fallback when the user
  // hasn't typed anything — clearing the input always restores the computation.
  // computedContext exposes applookup list props so { kind: 'applookup', ... }
  // operands can resolve to numeric fields on the target record.
  const computedContext = useMemo<ComputedContext>(() => ({
    lookupLists: {
      'sitzung': sitzungenList,
      'teilnehmer': teilnehmerList,
    },
  }), [sitzungenList, teilnehmerList, ]);
  const computedValues = useMemo<Record<string, number | null>>(() => {
    let out: Record<string, number | null> = {};
    const entries = Object.entries(formEnhancements.computed);
    for (let i = 0; i < 5; i++) {
      const merged: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
      for (const [k, v] of Object.entries(out)) {
        if (v === null) continue;
        const cur = merged[k];
        if (cur === undefined || cur === null || cur === '') merged[k] = v;
      }
      const next: Record<string, number | null> = {};
      let changed = false;
      for (const [key, spec] of entries) {
        const v = evalComputed(spec, merged, computedContext);
        next[key] = v;
        if (v !== out[key]) changed = true;
      }
      out = next;
      if (!changed) break;
    }
    return out;
  }, [fields, computedContext]);

  useEffect(() => {
    if (open) {
      setFields(applyDefaults(normalizedDefaults ?? {}, formEnhancements.defaults) as Partial<Bewertungen['fields']>);
      setPreview(null);
      setScanSuccess(false);
      setAiText('');
      setSubmitError(null);
    }
  }, [open, normalizedDefaults]);
  useEffect(() => {
    try { localStorage.setItem('ai-use-personal-info', String(usePersonalInfo)); } catch {}
  }, [usePersonalInfo]);
  async function handleShowProfileInfo() {
    if (showProfileInfo) { setShowProfileInfo(false); return; }
    setProfileLoading(true);
    try {
      const p = await getUserProfile();
      setProfileData(p);
    } catch {
      setProfileData(null);
    } finally {
      setProfileLoading(false);
      setShowProfileInfo(true);
    }
  }

  // Submit errors surface IN the dialog (it is modal — a banner in the page
  // body would be hidden behind it). A consumer onSubmit that THROWS (the
  // documented "throw to prevent closing" validation pattern) lands here:
  // the dialog stays open, nothing is saved, the message is visible.
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (missingRequired.length > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      // Fill empty number slots from computed values; user-typed values always win.
      // CRITICAL: only backend-mapped keys may be backfilled. Virtual computeds
      // (sub-agent invents `_netto`, `_bestellung_gesamtbetrag` etc. for the
      // "Berechnungen" display) have no backend counterpart — writing them
      // triggers a 422 from the Living-Apps API ("field does not exist").
      const merged = { ...fields };
      for (const [key, val] of Object.entries(computedValues)) {
        if (val === null) continue;
        if (!backendFieldSet.has(key)) continue;
        const cur = (merged as Record<string, unknown>)[key];
        if (cur === undefined || cur === null || cur === '') {
          (merged as Record<string, unknown>)[key] = val;
        }
      }
      const clean = cleanFieldsForApi(merged, 'bewertungen');
      await onSubmit(clean as Bewertungen['fields']);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAiExtract(file?: File) {
    if (!file && !aiText.trim()) return;
    setScanning(true);
    setScanSuccess(false);
    try {
      let uri: string | undefined;
      let gps: { latitude: number; longitude: number } | null = null;
      let geoAddr = '';
      const parts: string[] = [];
      if (file) {
        const [dataUri, meta] = await Promise.all([fileToDataUri(file), extractPhotoMeta(file)]);
        uri = dataUri;
        if (file.type.startsWith('image/')) setPreview(uri);
        gps = enablePhotoLocation ? meta?.gps ?? null : null;
        if (gps) {
          geoAddr = await reverseGeocode(gps.latitude, gps.longitude);
          parts.push(`Location coordinates: ${gps.latitude}, ${gps.longitude}`);
          if (geoAddr) parts.push(`Reverse-geocoded address: ${geoAddr}`);
        }
        if (meta?.dateTime) {
          parts.push(`Date taken: ${meta.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')}`);
        }
      }
      const contextParts: string[] = [];
      if (parts.length) {
        contextParts.push(`<photo-metadata>\nThe following metadata was extracted from the photo\'s EXIF data:\n${parts.join('\n')}\n</photo-metadata>`);
      }
      contextParts.push(`<available-records field="sitzung" entity="Sitzungen">\n${JSON.stringify(sitzungenList.map(r => ({ record_id: r.record_id, ...r.fields })), null, 2)}\n</available-records>`);
      contextParts.push(`<available-records field="teilnehmer" entity="Teilnehmer">\n${JSON.stringify(teilnehmerList.map(r => ({ record_id: r.record_id, ...r.fields })), null, 2)}\n</available-records>`);
      if (usePersonalInfo) {
        try {
          const profile = await getUserProfile();
          contextParts.push(`<user-profile>\nThe following is the logged-in user\'s personal information. Use this to pre-fill relevant fields like name, email, address, company etc. when appropriate:\n${JSON.stringify(profile, null, 2)}\n</user-profile>`);
        } catch (err) {
          console.warn('Failed to fetch user profile:', err);
        }
      }
      const photoContext = contextParts.length ? contextParts.join('\n') : undefined;
      const schema = `{\n  "sitzung": string | null, // Display name from Sitzungen (see <available-records>)\n  "teilnehmer": string | null, // Display name from Teilnehmer (see <available-records>)\n  "bewertungsdatum": string | null, // YYYY-MM-DD\n  "gesamteindruck": LookupValue | null, // Gesamteindruck (select one key: "bewertung_1" | "bewertung_2" | "bewertung_3" | "bewertung_4" | "bewertung_5") mapping: bewertung_1=1 – Sehr schlecht, bewertung_2=2 – Schlecht, bewertung_3=3 – Befriedigend, bewertung_4=4 – Gut, bewertung_5=5 – Sehr gut\n  "relevanz": LookupValue | null, // Relevanz für meine Situation (select one key: "relevanz_1" | "relevanz_2" | "relevanz_3" | "relevanz_4" | "relevanz_5") mapping: relevanz_1=1 – Sehr schlecht, relevanz_2=2 – Schlecht, relevanz_3=3 – Befriedigend, relevanz_4=4 – Gut, relevanz_5=5 – Sehr gut\n  "umsetzbarkeit": LookupValue | null, // Umsetzbarkeit der Erkenntnisse (select one key: "umsetz_1" | "umsetz_2" | "umsetz_3" | "umsetz_4" | "umsetz_5") mapping: umsetz_1=1 – Sehr schlecht, umsetz_2=2 – Schlecht, umsetz_3=3 – Befriedigend, umsetz_4=4 – Gut, umsetz_5=5 – Sehr gut\n  "methodenqualitaet": LookupValue | null, // Qualität der eingesetzten Methoden (select one key: "methode_1" | "methode_2" | "methode_3" | "methode_4" | "methode_5") mapping: methode_1=1 – Sehr schlecht, methode_2=2 – Schlecht, methode_3=3 – Befriedigend, methode_4=4 – Gut, methode_5=5 – Sehr gut\n  "wichtigste_erkenntnis": string | null, // Meine wichtigste Erkenntnis\n  "naechste_schritte": string | null, // Meine nächsten Schritte\n  "verbesserungsvorschlaege": string | null, // Verbesserungsvorschläge\n  "weiterempfehlung": boolean | null, // Ich würde diesen Erfahrungsraum weiterempfehlen.\n}`;
      const raw = await extractFromInput<Record<string, unknown>>(schema, {
        dataUri: uri,
        userText: aiText.trim() || undefined,
        photoContext,
        intent: DIALOG_INTENT,
      });
      setFields(prev => {
        const merged = { ...prev } as Record<string, unknown>;
        function matchName(name: string, candidates: string[]): boolean {
          const n = name.toLowerCase().trim();
          return candidates.some(c => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
        }
        const applookupKeys = new Set<string>(["sitzung", "teilnehmer"]);
        for (const [k, v] of Object.entries(raw)) {
          if (applookupKeys.has(k)) continue;
          if (v != null) merged[k] = v;
        }
        const sitzungName = raw['sitzung'] as string | null;
        if (sitzungName) {
          const sitzungMatch = sitzungenList.find(r => matchName(sitzungName!, [String(r.fields.titel ?? '')]));
          if (sitzungMatch) merged['sitzung'] = createRecordUrl(APP_IDS.SITZUNGEN, sitzungMatch.record_id);
        }
        const teilnehmerName = raw['teilnehmer'] as string | null;
        if (teilnehmerName) {
          const teilnehmerMatch = teilnehmerList.find(r => matchName(teilnehmerName!, [[r.fields.vorname ?? '', r.fields.nachname ?? ''].filter(Boolean).join(' ')]));
          if (teilnehmerMatch) merged['teilnehmer'] = createRecordUrl(APP_IDS.TEILNEHMER, teilnehmerMatch.record_id);
        }
        return merged as Partial<Bewertungen['fields']>;
      });
      setAiText('');
      setScanSuccess(true);
      setTimeout(() => setScanSuccess(false), 3000);
    } catch (err) {
      console.error('Scan fehlgeschlagen:', err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleAiExtract(f);
    e.target.value = '';
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handleAiExtract(file);
    }
  }, []);

  const DIALOG_INTENT = defaultValues ? 'Bewertungen bearbeiten' : 'Bewertungen hinzufügen';

  const fieldBlocks: Record<string, React.ReactNode> = {
    'sitzung': (
      <div key="sitzung" className="space-y-1.5">
        <Label htmlFor="sitzung">Sitzung <span className="text-destructive" aria-hidden="true">*</span></Label>
        <Combobox
          id="sitzung"
          placeholder="Welche Sitzung wird bewertet?"
          items={sitzungenListAll.map(r => ({
            id: r.record_id,
            label: String(r.fields.titel ?? r.record_id),
          }))}
          value={extractRecordId(fields.sitzung)}
          onChange={id => setFields(f => ({ ...f, sitzung: id ? createRecordUrl(APP_IDS.SITZUNGEN, id) : undefined }))}
          searchPlaceholder="Suchen…"
          emptyText="Kein Treffer"
          onCreateNew={(q) => openCreateSitzungen("sitzung", q)}
          createLabel="Neu in Sitzungen"
        />
        {showErrors && !fields.sitzung && (
          <p className="text-xs text-destructive mt-1">Pflichtfeld</p>
        )}
      </div>
    ),
    'teilnehmer': (
      <div key="teilnehmer" className="space-y-1.5">
        <Label htmlFor="teilnehmer">Teilnehmer <span className="text-destructive" aria-hidden="true">*</span></Label>
        <Combobox
          id="teilnehmer"
          placeholder="Wer bewertet?"
          items={teilnehmerListAll.map(r => ({
            id: r.record_id,
            label: String(r.fields.vorname ?? r.record_id),
          }))}
          value={extractRecordId(fields.teilnehmer)}
          onChange={id => setFields(f => ({ ...f, teilnehmer: id ? createRecordUrl(APP_IDS.TEILNEHMER, id) : undefined }))}
          searchPlaceholder="Suchen…"
          emptyText="Kein Treffer"
          onCreateNew={(q) => openCreateTeilnehmer("teilnehmer", q)}
          createLabel="Neu in Teilnehmer"
        />
        {showErrors && !fields.teilnehmer && (
          <p className="text-xs text-destructive mt-1">Pflichtfeld</p>
        )}
      </div>
    ),
    'bewertungsdatum': (
      <div key="bewertungsdatum" className="space-y-1.5">
        <Label htmlFor="bewertungsdatum">Datum der Bewertung</Label>
        <DatePicker
          id="bewertungsdatum"
          placeholder="Wann wurde bewertet?"
          mode="date"
          value={fields.bewertungsdatum ?? null}
          onChange={v => setFields(f => ({ ...f, bewertungsdatum: v ?? undefined }))}
        />
      </div>
    ),
    'gesamteindruck': (
      <div key="gesamteindruck" className="space-y-1.5">
        <Label htmlFor="gesamteindruck">Gesamteindruck <span className="text-destructive" aria-hidden="true">*</span></Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.gesamteindruck) === 'bewertung_1'}
            onClick={() => setFields(f => ({ ...f, gesamteindruck: (lookupKey(f.gesamteindruck) === 'bewertung_1' ? undefined : 'bewertung_1') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.gesamteindruck) === 'bewertung_1'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            1 – Sehr schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.gesamteindruck) === 'bewertung_2'}
            onClick={() => setFields(f => ({ ...f, gesamteindruck: (lookupKey(f.gesamteindruck) === 'bewertung_2' ? undefined : 'bewertung_2') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.gesamteindruck) === 'bewertung_2'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            2 – Schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.gesamteindruck) === 'bewertung_3'}
            onClick={() => setFields(f => ({ ...f, gesamteindruck: (lookupKey(f.gesamteindruck) === 'bewertung_3' ? undefined : 'bewertung_3') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.gesamteindruck) === 'bewertung_3'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            3 – Befriedigend
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.gesamteindruck) === 'bewertung_4'}
            onClick={() => setFields(f => ({ ...f, gesamteindruck: (lookupKey(f.gesamteindruck) === 'bewertung_4' ? undefined : 'bewertung_4') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.gesamteindruck) === 'bewertung_4'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            4 – Gut
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.gesamteindruck) === 'bewertung_5'}
            onClick={() => setFields(f => ({ ...f, gesamteindruck: (lookupKey(f.gesamteindruck) === 'bewertung_5' ? undefined : 'bewertung_5') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.gesamteindruck) === 'bewertung_5'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            5 – Sehr gut
          </button>
        </div>
        {showErrors && !fields.gesamteindruck && (
          <p className="text-xs text-destructive mt-1">Pflichtfeld</p>
        )}
      </div>
    ),
    'relevanz': (
      <div key="relevanz" className="space-y-1.5">
        <Label htmlFor="relevanz">Relevanz für meine Situation</Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.relevanz) === 'relevanz_1'}
            onClick={() => setFields(f => ({ ...f, relevanz: (lookupKey(f.relevanz) === 'relevanz_1' ? undefined : 'relevanz_1') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.relevanz) === 'relevanz_1'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            1 – Sehr schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.relevanz) === 'relevanz_2'}
            onClick={() => setFields(f => ({ ...f, relevanz: (lookupKey(f.relevanz) === 'relevanz_2' ? undefined : 'relevanz_2') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.relevanz) === 'relevanz_2'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            2 – Schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.relevanz) === 'relevanz_3'}
            onClick={() => setFields(f => ({ ...f, relevanz: (lookupKey(f.relevanz) === 'relevanz_3' ? undefined : 'relevanz_3') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.relevanz) === 'relevanz_3'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            3 – Befriedigend
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.relevanz) === 'relevanz_4'}
            onClick={() => setFields(f => ({ ...f, relevanz: (lookupKey(f.relevanz) === 'relevanz_4' ? undefined : 'relevanz_4') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.relevanz) === 'relevanz_4'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            4 – Gut
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.relevanz) === 'relevanz_5'}
            onClick={() => setFields(f => ({ ...f, relevanz: (lookupKey(f.relevanz) === 'relevanz_5' ? undefined : 'relevanz_5') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.relevanz) === 'relevanz_5'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            5 – Sehr gut
          </button>
        </div>
      </div>
    ),
    'umsetzbarkeit': (
      <div key="umsetzbarkeit" className="space-y-1.5">
        <Label htmlFor="umsetzbarkeit">Umsetzbarkeit der Erkenntnisse</Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.umsetzbarkeit) === 'umsetz_1'}
            onClick={() => setFields(f => ({ ...f, umsetzbarkeit: (lookupKey(f.umsetzbarkeit) === 'umsetz_1' ? undefined : 'umsetz_1') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.umsetzbarkeit) === 'umsetz_1'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            1 – Sehr schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.umsetzbarkeit) === 'umsetz_2'}
            onClick={() => setFields(f => ({ ...f, umsetzbarkeit: (lookupKey(f.umsetzbarkeit) === 'umsetz_2' ? undefined : 'umsetz_2') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.umsetzbarkeit) === 'umsetz_2'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            2 – Schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.umsetzbarkeit) === 'umsetz_3'}
            onClick={() => setFields(f => ({ ...f, umsetzbarkeit: (lookupKey(f.umsetzbarkeit) === 'umsetz_3' ? undefined : 'umsetz_3') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.umsetzbarkeit) === 'umsetz_3'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            3 – Befriedigend
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.umsetzbarkeit) === 'umsetz_4'}
            onClick={() => setFields(f => ({ ...f, umsetzbarkeit: (lookupKey(f.umsetzbarkeit) === 'umsetz_4' ? undefined : 'umsetz_4') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.umsetzbarkeit) === 'umsetz_4'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            4 – Gut
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.umsetzbarkeit) === 'umsetz_5'}
            onClick={() => setFields(f => ({ ...f, umsetzbarkeit: (lookupKey(f.umsetzbarkeit) === 'umsetz_5' ? undefined : 'umsetz_5') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.umsetzbarkeit) === 'umsetz_5'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            5 – Sehr gut
          </button>
        </div>
      </div>
    ),
    'methodenqualitaet': (
      <div key="methodenqualitaet" className="space-y-1.5">
        <Label htmlFor="methodenqualitaet">Qualität der eingesetzten Methoden</Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.methodenqualitaet) === 'methode_1'}
            onClick={() => setFields(f => ({ ...f, methodenqualitaet: (lookupKey(f.methodenqualitaet) === 'methode_1' ? undefined : 'methode_1') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.methodenqualitaet) === 'methode_1'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            1 – Sehr schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.methodenqualitaet) === 'methode_2'}
            onClick={() => setFields(f => ({ ...f, methodenqualitaet: (lookupKey(f.methodenqualitaet) === 'methode_2' ? undefined : 'methode_2') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.methodenqualitaet) === 'methode_2'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            2 – Schlecht
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.methodenqualitaet) === 'methode_3'}
            onClick={() => setFields(f => ({ ...f, methodenqualitaet: (lookupKey(f.methodenqualitaet) === 'methode_3' ? undefined : 'methode_3') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.methodenqualitaet) === 'methode_3'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            3 – Befriedigend
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.methodenqualitaet) === 'methode_4'}
            onClick={() => setFields(f => ({ ...f, methodenqualitaet: (lookupKey(f.methodenqualitaet) === 'methode_4' ? undefined : 'methode_4') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.methodenqualitaet) === 'methode_4'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            4 – Gut
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.methodenqualitaet) === 'methode_5'}
            onClick={() => setFields(f => ({ ...f, methodenqualitaet: (lookupKey(f.methodenqualitaet) === 'methode_5' ? undefined : 'methode_5') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.methodenqualitaet) === 'methode_5'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            5 – Sehr gut
          </button>
        </div>
      </div>
    ),
    'wichtigste_erkenntnis': (
      <div key="wichtigste_erkenntnis" className="space-y-1.5">
        <Label htmlFor="wichtigste_erkenntnis">Meine wichtigste Erkenntnis</Label>
        <Textarea
          id="wichtigste_erkenntnis"
          placeholder="Was hast du gelernt? Was wird dir bleiben?"
          value={fields.wichtigste_erkenntnis ?? ''}
          onChange={e => setFields(f => ({ ...f, wichtigste_erkenntnis: e.target.value }))}
          rows={3}
        />
      </div>
    ),
    'naechste_schritte': (
      <div key="naechste_schritte" className="space-y-1.5">
        <Label htmlFor="naechste_schritte">Meine nächsten Schritte</Label>
        <Textarea
          id="naechste_schritte"
          placeholder="Wie setzt du das um? Konkrete nächste Schritte..."
          value={fields.naechste_schritte ?? ''}
          onChange={e => setFields(f => ({ ...f, naechste_schritte: e.target.value }))}
          rows={3}
        />
      </div>
    ),
    'verbesserungsvorschlaege': (
      <div key="verbesserungsvorschlaege" className="space-y-1.5">
        <Label htmlFor="verbesserungsvorschlaege">Verbesserungsvorschläge</Label>
        <Textarea
          id="verbesserungsvorschlaege"
          placeholder="Was könnte besser laufen?"
          value={fields.verbesserungsvorschlaege ?? ''}
          onChange={e => setFields(f => ({ ...f, verbesserungsvorschlaege: e.target.value }))}
          rows={3}
        />
      </div>
    ),
    'weiterempfehlung': (
      <div key="weiterempfehlung" className="space-y-1.5">
        <Label htmlFor="weiterempfehlung">Ich würde diesen Erfahrungsraum weiterempfehlen.</Label>
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="weiterempfehlung"
            checked={!!fields.weiterempfehlung}
            onCheckedChange={(v) => setFields(f => ({ ...f, weiterempfehlung: !!v }))}
          />
          <Label htmlFor="weiterempfehlung" className="font-normal">Ich würde diesen Erfahrungsraum weiterempfehlen.</Label>
        </div>
      </div>
    ),
  };
  const orderedFields = applyFieldOrder(Object.keys(fieldBlocks), formEnhancements.fieldOrder);
  const orderedFieldsKey = orderedFields.map((it) => typeof it === 'string' ? it : it.row.join('+')).join(',');

  // Render-Modell für Computed-Felder:
  //
  //   • BACKEND-FELDER mit computed-Eintrag (z.B. gesamtpreis bei einer
  //     Katzenpension) bleiben als normales Eingabe-Feld stehen. Der Number-
  //     Input nutzt den computed-Wert als Vorschlag, der User kann jederzeit
  //     überschreiben (clearing → restore computed).
  //   • VIRTUELLE computed-Keys (Eintrag in formEnhancements.computed, ABER
  //     kein passendes Backend-Feld in orderedFields) erscheinen NICHT als
  //     Input, sondern unten als kompakte 'Berechnungen'-Übersicht oder als
  //     Inline-Hint unter dem letzten beitragenden Input.
  const FIELD_LABELS: Record<string, string> = {"sitzung": "Sitzung", "teilnehmer": "Teilnehmer", "bewertungsdatum": "Datum der Bewertung", "gesamteindruck": "Gesamteindruck", "relevanz": "Relevanz für meine Situation", "umsetzbarkeit": "Umsetzbarkeit der Erkenntnisse", "methodenqualitaet": "Qualität der eingesetzten Methoden", "wichtigste_erkenntnis": "Meine wichtigste Erkenntnis", "naechste_schritte": "Meine nächsten Schritte", "verbesserungsvorschlaege": "Verbesserungsvorschläge", "weiterempfehlung": "Ich würde diesen Erfahrungsraum weiterempfehlen."};
  const CURRENCY_KEYS = new Set<string>([]);
  // Applookup-Referenz-Labels: pro applookup-Feld in dieser Form (ownKey)
  // eine Map { lookupKey: label } für ALLE Felder des Target-Schemas. Wird
  // beim Render-Walk gefiltert auf die in der computed-Formel tatsächlich
  // referenzierten lookupKeys (siehe applookupRefs unten).
  const APPLOOKUP_LABELS: Record<string, Record<string, string>> = {"sitzung": {"titel": "Titel der Sitzung", "erfahrungsraum": "Erfahrungsraum-Format", "datum_uhrzeit": "Datum und Uhrzeit", "moderator_nachname": "Moderator – Nachname", "teilnehmer": "Teilnehmer", "agenda": "Agenda", "nachbereitungsnotizen": "Nachbereitungsnotizen", "dokumente": "Dokumente / Protokoll", "ort_bezeichnung": "Ortsbezeichnung", "strasse": "Straße", "hausnummer": "Hausnummer", "postleitzahl": "Postleitzahl", "stadt": "Stadt", "standort": "Standort auf der Karte", "moderator_vorname": "Moderator – Vorname"}, "teilnehmer": {"vorname": "Vorname", "nachname": "Nachname", "organisation": "Organisation", "rolle": "Rolle / Position", "email": "E-Mail-Adresse", "telefon": "Telefonnummer", "notizen": "Notizen"}};
  const inputFields = useMemo(() => flattenFieldOrder(orderedFields), [orderedFieldsKey]);
  const backendFieldSet = useMemo(() => new Set(inputFields), [inputFields.join(',')]);
  const virtualComputed = useMemo(
    () => Object.fromEntries(
      Object.entries(formEnhancements.computed).filter(([k]) => !backendFieldSet.has(k)),
    ),
    [backendFieldSet],
  );
  const virtualFormEnhancements = useMemo(
    () => ({ ...formEnhancements, computed: virtualComputed }),
    [virtualComputed],
  );
  const computedLayout = useMemo(
    () => classifyComputed(virtualFormEnhancements, inputFields, computedDeps),
    [virtualFormEnhancements, inputFields.join(',')],
  );
  // Applookup-Referenzen: pro ownKey (Lookup-Feld im Form) die Liste der
  // lookupKeys, die in irgendeiner computed-Formel referenziert werden.
  // MODUS-1: aus dem Spec-Tree extrahiert. MODUS-2: aus dem Build-Time-
  // Export computedApplookupRefs (parse-formulas hat Regex-Pairs gesammelt).
  // Pro (ownKey, lookupKey)-Paar nur einmal; pro ownKey können aber mehrere
  // lookupKeys gleichzeitig auftauchen (z.B. einzelpreis UND karten10_preis
  // beim Yoga-Kurs), und alle werden separat als Inline-Hint gerendert.
  const applookupRefs = useMemo(
    () => mergeApplookupRefs(
      extractApplookupRefs(formEnhancements.computed),
      computedApplookupRefs,
    ),
    [],
  );
  function summaryLabel(k: string): string {
    if (FIELD_LABELS[k]) return FIELD_LABELS[k];
    // Leading underscore(s) als Virtual-Marker abstreifen; Unterstriche zu
    // Leerzeichen, jedes Wort kapitalisieren. Umlaute kommen vom Sub-Agent
    // direkt im Key (z. B. `_buchung_dauer_nächte`) — JS/TS/Vite unterstützen
    // Unicode-Identifier nativ, daher keine ASCII-Transliteration nötig.
    return k.replace(/^_+/, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  function formatSummaryValue(k: string, v: unknown): string {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return '—';
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    // Backend-Feld mit €-Label ODER virtueller Computed-Key, dessen Name nach Geld aussieht.
    const looksLikeCurrency = CURRENCY_KEYS.has(k) || /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k);
    if (looksLikeCurrency) {
      return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col overflow-hidden p-0 gap-0 max-sm:[&>button]:size-10 max-sm:[&>button]:grid max-sm:[&>button]:place-items-center max-sm:[&>button]:rounded-full max-sm:[&>button]:border max-sm:[&>button]:border-input max-sm:[&>button]:bg-background max-sm:[&>button]:opacity-100 max-sm:[&>button>svg]:size-5">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex flex-row items-center gap-3 space-y-0">
          <DialogTitle className="flex-1 truncate text-left">{DIALOG_INTENT}</DialogTitle>
          {enablePhotoScan && (
            <button
              type="button"
              onClick={() => setAiOpen(o => !o)}
              aria-expanded={aiOpen}
              aria-controls="ai-fill-panel"
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 max-sm:py-2.5 max-sm:px-4 text-xs font-semibold transition-all mr-7 max-sm:mr-12 shadow-sm ${
                aiOpen
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                  : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 hover:border-primary/50'
              }`}
            >
              <IconSparkles className={`h-3.5 w-3.5 ${aiOpen ? '' : 'text-primary'}`} />
              <span className="hidden sm:inline">KI-Ausfüllen</span>
              <IconChevronDown className={`h-3 w-3 transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </DialogHeader>
        {enablePhotoScan && aiOpen && (
          <div id="ai-fill-panel" className="border-b bg-muted/20 px-6 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">Versteht Fotos, Dokumente und Text und füllt alles für dich aus</p>
            <div className="flex items-start gap-2 pl-0.5">
              <Checkbox
                id="ai-use-personal-info"
                checked={usePersonalInfo}
                onCheckedChange={(v) => setUsePersonalInfo(!!v)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                <Label htmlFor="ai-use-personal-info" className="text-xs font-normal text-muted-foreground cursor-pointer inline">
                  KI-Assistent darf zusätzlich Informationen zu meiner Person verwenden
                </Label>
                {' '}
                <button type="button" onClick={handleShowProfileInfo} className="text-xs text-primary hover:underline whitespace-nowrap">
                  {profileLoading ? 'Lade...' : '(mehr Infos)'}
                </button>
              </span>
            </div>
            {showProfileInfo && (
              <div className="rounded-md border bg-muted/50 p-2 text-xs max-h-40 overflow-y-auto">
                <p className="font-medium mb-1">Folgende Infos über dich können von der KI genutzt werden:</p>
                {profileData ? Object.values(profileData).map((v, i) => (
                  <span key={i}>{i > 0 && ", "}{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                )) : (
                  <span className="text-muted-foreground">Profil konnte nicht geladen werden</span>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className={`
                relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                ${scanning
                  ? 'border-primary/40 bg-primary/5'
                  : scanSuccess
                    ? 'border-green-500/40 bg-green-50/50 dark:bg-green-950/20'
                    : dragOver
                      ? 'border-primary bg-primary/10 scale-[1.01]'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              {scanning ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <IconLoader2 className="h-7 w-7 text-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">KI analysiert...</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Felder werden automatisch ausgefüllt</p>
                  </div>
                </div>
              ) : scanSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <IconCircleCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Felder ausgefüllt!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Prüfe die Werte und passe sie ggf. an</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/8 flex items-center justify-center">
                    <IconPhotoPlus className="h-7 w-7 text-primary/70" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Foto oder Dokument hierher ziehen oder auswählen</p>
                  </div>
                </div>
              )}

              {preview && !scanning && (
                <div className="absolute top-2 right-2">
                  <div className="relative group">
                    <img src={preview} alt="" className="h-10 w-10 rounded-md object-cover border shadow-sm" />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreview(null); }}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-muted-foreground/80 text-white flex items-center justify-center"
                    >
                      <IconX className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                <IconCamera className="h-3.5 w-3.5 mr-1" />Kamera
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <IconUpload className="h-3.5 w-3.5 mr-1" />Foto wählen
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => {
                  e.stopPropagation();
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'application/pdf,.pdf';
                    fileInputRef.current.click();
                    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = 'image/*,application/pdf'; }, 100);
                  }
                }}>
                <IconFileText className="h-3.5 w-3.5 mr-1" />Dokument
              </Button>
            </div>

            <div className="relative">
              <Textarea
                placeholder="Text eingeben oder einfügen, z.B. Notizen, E-Mails, Beschreibungen..."
                value={aiText}
                onChange={e => {
                  setAiText(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(Math.max(el.scrollHeight, 56), 96) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && aiText.trim() && !scanning) {
                    e.preventDefault();
                    handleAiExtract();
                  }
                }}
                disabled={scanning}
                rows={2}
                className="pr-12 resize-none text-sm overflow-y-auto"
              />
              <button
                type="button"
                className="absolute right-2 top-2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                disabled={scanning}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setAiText(prev => prev ? prev + '\n' + text : text);
                  } catch {}
                }}
                title="Paste"
              >
                <IconClipboard className="h-4 w-4" />
              </button>
            </div>
            {aiText.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs"
                disabled={scanning}
                onClick={() => handleAiExtract()}
              >
                <IconSparkles className="h-3.5 w-3.5 mr-1.5" />Analysieren
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0 min-w-0 max-sm:[&_input]:h-11">
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4 min-w-0">
            {(() => {
              const renderField = (k: string) => {
                const inlineHints = computedLayout.anchors[k] ?? [];
                const refs = applookupRefs[k] ?? [];
                return (
                  <div key={k} className="space-y-1.5 min-w-0">
                    {fieldBlocks[k]}
                    {refs.map(({ lookupKey }) => {
                      // Show the live numeric value the formula will pull from
                      // the selected lookup target (e.g. "Monatspreis: 34,90 €"
                      // under the Tarif combobox). Hidden while no lookup is
                      // selected or the target field is non-numeric.
                      const v = resolveApplookupRef(k, lookupKey, fields as Record<string, unknown>, computedContext);
                      if (v === null) return null;
                      const lbl = APPLOOKUP_LABELS[k]?.[lookupKey] ?? lookupKey;
                      const text = formatSummaryValue(lookupKey, v);
                      return (
                        <div key={`alh-${k}-${lookupKey}`} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{lbl}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                    {inlineHints.map((cKey) => {
                      const v = computedValues[cKey];
                      const text = formatSummaryValue(cKey, v);
                      if (text === '—') return null;
                      return (
                        <div key={cKey} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{summaryLabel(cKey)}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              };
              return orderedFields.map((item, idx) => {
                if (typeof item === 'string') return renderField(item);
                const cols = item.cols ?? `repeat(${item.row.length}, minmax(0, 1fr))`;
                return (
                  <div key={`row-${idx}`} className="grid gap-3" style={{ gridTemplateColumns: cols }}>
                    {item.row.map(renderField)}
                  </div>
                );
              });
            })()}
            {(computedLayout.aggregates.length > 0 || computedLayout.finalTotal) && (
              <div className="mt-6 pt-4 border-t border-border space-y-1.5">
                {computedLayout.aggregates.length > 0 && (
                  <dl className="space-y-1.5 pb-2">
                    {computedLayout.aggregates.map((k) => {
                      const userVal = (fields as Record<string, unknown>)[k];
                      const computed = computedValues[k];
                      const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                      return (
                        <div key={k} className="flex justify-between items-baseline gap-3">
                          <dt className="text-sm text-muted-foreground truncate">{summaryLabel(k)}</dt>
                          <dd className="text-sm font-medium tabular-nums whitespace-nowrap">{formatSummaryValue(k, v)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
                {computedLayout.finalTotal && (() => {
                  const k = computedLayout.finalTotal;
                  const userVal = (fields as Record<string, unknown>)[k];
                  const computed = computedValues[k];
                  const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                  // Innere Border nur wenn aggregates existieren — sonst hätten wir
                  // zwei direkt aufeinanderfolgende Striche (Outer + Inner) mit nur
                  // einer Aggregat-Zeile dazwischen → zu viel visuelles Rauschen.
                  const sep = computedLayout.aggregates.length > 0 ? 'pt-3 border-t border-border' : 'pt-1';
                  return (
                    <div className={`flex justify-between items-baseline gap-3 ${sep}`}>
                      <span className="text-base font-semibold text-foreground">{summaryLabel(k)}</span>
                      <span className="text-lg font-bold tabular-nums whitespace-nowrap text-foreground">{formatSummaryValue(k, v)}</span>
                    </div>
                  );
                })()}
              </div>
            )}
            {showErrors && missingRequired.length > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1.5" role="alert">
                <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                Bitte fülle die markierten Pflichtfelder aus.
              </p>
            )}
            {recordId && (
              <div className="pt-2 border-t border-border">
                <AttachmentsSection appId={APP_IDS.BEWERTUNGEN} recordId={recordId} />
              </div>
            )}
          </div>
          {submitError && (
            <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/10 px-6 py-2.5 text-sm text-destructive" role="alert">
              <IconAlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{submitError}</span>
            </div>
          )}
          <DialogFooter className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-6 py-3 gap-2 max-sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} className="max-sm:h-12 max-sm:flex-1 max-sm:text-base">Abbrechen</Button>
            <Button
              type="submit"
              className="max-sm:h-12 max-sm:flex-1 max-sm:text-base"
              disabled={saving || !isDirty || (showErrors && missingRequired.length > 0)}
            >
              {saving ? 'Speichern...' : defaultValues ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {createSitzungenOpen && (
      <SitzungenDialog
        open={createSitzungenOpen}
        onClose={() => setCreateSitzungenOpen(false)}
        onSubmit={async (newFields) => {
          const result = await LivingAppsService.createSitzungenEntry(newFields as any) as { id?: string };
          if (result?.id) {
            const newRec = { record_id: result.id, fields: newFields } as unknown as Sitzungen;
            setExtraSitzungen(prev => [...prev, newRec]);
            const url = createRecordUrl(APP_IDS.SITZUNGEN, result.id);
            setFields(prev => ({ ...prev, [createSitzungenField]: url } as any));
          }
          setCreateSitzungenOpen(false);
        }}
        defaultValues={createSitzungenInitial
          ? ({ titel: createSitzungenInitial } as any)
          : undefined}
        erfahrungsraumFormateList={[]}
        teilnehmerList={teilnehmerList}
      />
    )}
    {createTeilnehmerOpen && (
      <TeilnehmerDialog
        open={createTeilnehmerOpen}
        onClose={() => setCreateTeilnehmerOpen(false)}
        onSubmit={async (newFields) => {
          const result = await LivingAppsService.createTeilnehmerEntry(newFields as any) as { id?: string };
          if (result?.id) {
            const newRec = { record_id: result.id, fields: newFields } as unknown as Teilnehmer;
            setExtraTeilnehmer(prev => [...prev, newRec]);
            const url = createRecordUrl(APP_IDS.TEILNEHMER, result.id);
            setFields(prev => ({ ...prev, [createTeilnehmerField]: url } as any));
          }
          setCreateTeilnehmerOpen(false);
        }}
        defaultValues={createTeilnehmerInitial
          ? ({ vorname: createTeilnehmerInitial } as any)
          : undefined}
      />
    )}
    </>
  );
}