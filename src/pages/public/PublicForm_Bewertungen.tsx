import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/DatePicker';
import { lookupKey } from '@/lib/formatters';

// Empty PROXY_BASE → relative URLs (dashboard and form-proxy share the domain).
const PROXY_BASE = '';
const APP_ID = '6a573289304dfda38cab4969';
const SUBMIT_PATH = `/rest/apps/${APP_ID}/records`;
const ALTCHA_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/altcha/dist/altcha.min.js';

async function submitPublicForm(fields: Record<string, unknown>, captchaToken: string) {
  const res = await fetch(`${PROXY_BASE}/api${SUBMIT_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Captcha-Token': captchaToken,
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Submission failed');
  }
  return res.json();
}


function cleanFields(fields: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && 'key' in (value as any)) {
      cleaned[key] = (value as any).key;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map(item =>
        typeof item === 'object' && item !== null && 'key' in item ? item.key : item
      );
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export default function PublicFormBewertungen() {
  const [fields, setFields] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HTMLElement | null>(null);

  // Load the ALTCHA web component script once per page.
  useEffect(() => {
    if (document.querySelector(`script[src="${ALTCHA_SCRIPT_SRC}"]`)) return;
    const s = document.createElement('script');
    s.src = ALTCHA_SCRIPT_SRC;
    s.defer = true;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const prefill: Record<string, any> = {};
    params.forEach((value, key) => { prefill[key] = value; });
    if (Object.keys(prefill).length) setFields(prev => ({ ...prefill, ...prev }));
  }, []);

  function readCaptchaToken(): string | null {
    const el = captchaRef.current as any;
    if (!el) return null;
    return el.value || el.getAttribute('value') || null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = readCaptchaToken();
    if (!token) {
      setError('Bitte warte auf die Spam-Prüfung und versuche es erneut.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitPublicForm(cleanFields(fields), token);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Etwas ist schiefgelaufen. Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold">Vielen Dank!</h2>
          <p className="text-muted-foreground">Deine Eingabe wurde erfolgreich übermittelt.</p>
          <Button variant="outline" className="mt-4" onClick={() => { setSubmitted(false); setFields({}); }}>
            Weitere Eingabe
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Bewertungen — Formular</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-card rounded-xl border border-border p-6 shadow-md">
          <div className="space-y-2">
            <Label htmlFor="bewertungsdatum">Datum der Bewertung</Label>
            <DatePicker
              id="bewertungsdatum"
              placeholder=""
              mode="date"
              value={fields.bewertungsdatum ?? null}
              onChange={v => setFields(f => ({ ...f, bewertungsdatum: v ?? undefined }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gesamteindruck">Gesamteindruck *</Label>
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
          </div>
          <div className="space-y-2">
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
          <div className="space-y-2">
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
          <div className="space-y-2">
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
          <div className="space-y-2">
            <Label htmlFor="wichtigste_erkenntnis">Meine wichtigste Erkenntnis</Label>
            <Textarea
              id="wichtigste_erkenntnis"
              placeholder=""
              value={fields.wichtigste_erkenntnis ?? ''}
              onChange={e => setFields(f => ({ ...f, wichtigste_erkenntnis: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="naechste_schritte">Meine nächsten Schritte</Label>
            <Textarea
              id="naechste_schritte"
              placeholder=""
              value={fields.naechste_schritte ?? ''}
              onChange={e => setFields(f => ({ ...f, naechste_schritte: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="verbesserungsvorschlaege">Verbesserungsvorschläge</Label>
            <Textarea
              id="verbesserungsvorschlaege"
              placeholder=""
              value={fields.verbesserungsvorschlaege ?? ''}
              onChange={e => setFields(f => ({ ...f, verbesserungsvorschlaege: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-2">
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

          <altcha-widget
            ref={captchaRef as any}
            challengeurl={`${PROXY_BASE}/api/_challenge?path=${encodeURIComponent(SUBMIT_PATH)}`}
            auto="onsubmit"
            hidefooter
          />

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Wird gesendet...' : 'Absenden'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Powered by Klar
        </p>
      </div>
    </div>
  );
}
