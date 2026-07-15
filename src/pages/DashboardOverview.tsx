import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichSitzungen, enrichBewertungen } from '@/lib/enrich';
import type { ErfahrungsraumFormate, Sitzungen, Teilnehmer, Bewertungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDateTime } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { IconAlertCircle, IconTool, IconRefresh, IconCheck, IconCalendarEvent, IconStar, IconUsers, IconSparkles, IconPlus, IconMapPin } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { de } from 'date-fns/locale';
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { SitzungenDialog } from '@/components/dialogs/SitzungenDialog';
import { BewertungenDialog } from '@/components/dialogs/BewertungenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  CalendarWidget,
  CalendarSkeleton,
  type CalendarEvent,
  type CalendarTone,
} from '@/components/widgets/CalendarWidget';
import {
  RecordOverlay,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { SitzungenDetails } from '@/components/details/SitzungenDetails';
import { ErfahrungsraumFormateDetails } from '@/components/details/ErfahrungsraumFormateDetails';
import { TeilnehmerDetails } from '@/components/details/TeilnehmerDetails';
import { BewertungenDetails } from '@/components/details/BewertungenDetails';
import {
  ChartWidget,
  ChartSkeleton,
  type ChartRow,
} from '@/components/widgets/ChartWidget';
import {
  MapWidget,
  MapSkeleton,
  type MapMarker,
  type MapTone,
} from '@/components/widgets/MapWidget';

const APPGROUP_ID = '6a5732afc1334f7f5bb0be4f';
const REPAIR_ENDPOINT = '/claude/build/repair';

type OverlayItem =
  | { type: 'sitzung'; record: Sitzungen }
  | { type: 'erfahrungsraum'; record: ErfahrungsraumFormate }
  | { type: 'teilnehmer'; record: Teilnehmer }
  | { type: 'bewertung'; record: Bewertungen };

export default function DashboardOverview() {
  const {
    teilnehmer, erfahrungsraumFormate, sitzungen, bewertungen,
    setSitzungen,
    teilnehmerMap, erfahrungsraumFormateMap, sitzungenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  // ALL hooks must be before early returns
  const enrichedSitzungen = enrichSitzungen(sitzungen, { erfahrungsraumFormateMap, teilnehmerMap });
  const enrichedBewertungen = enrichBewertungen(bewertungen, { sitzungenMap, teilnehmerMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [sitzungDialogOpen, setSitzungDialogOpen] = useState(false);
  const [editingSitzung, setEditingSitzung] = useState<Sitzungen | null>(null);
  const [sitzungDefaults, setSitzungDefaults] = useState<Partial<Sitzungen['fields']>>({});

  const [bewertungDialogOpen, setBewertungDialogOpen] = useState(false);
  const [bewertungForSitzung, setBewertungForSitzung] = useState<string | null>(null);

  const todayKey = format(clock, 'yyyy-MM-dd');

  // Upcoming sessions (today and future), sorted by date
  const upcoming = useMemo(() => {
    return enrichedSitzungen
      .filter(s => {
        if (!s.fields.datum_uhrzeit) return false;
        try {
          return !isBefore(parseISO(s.fields.datum_uhrzeit), startOfDay(clock));
        } catch { return false; }
      })
      .sort((a, b) => (a.fields.datum_uhrzeit ?? '').localeCompare(b.fields.datum_uhrzeit ?? ''));
  }, [enrichedSitzungen, clock]);

  // Today's sessions
  const todaySessions = useMemo(() => {
    return enrichedSitzungen.filter(s => {
      if (!s.fields.datum_uhrzeit) return false;
      try {
        const d = parseISO(s.fields.datum_uhrzeit);
        return !isBefore(d, startOfDay(clock)) && !isAfter(d, endOfDay(clock));
      } catch { return false; }
    });
  }, [enrichedSitzungen, clock]);

  // Context line: names of today's sessions or upcoming
  const contextLine = useMemo(() => {
    if (todaySessions.length > 0) {
      const titles = todaySessions.map(s => s.fields.titel ?? s.erfahrungsraumName).filter(Boolean);
      return `Heute: ${namen(titles, 2)} — ${todaySessions.length} Sitzung${todaySessions.length > 1 ? 'en' : ''}.`;
    }
    if (upcoming.length > 0) {
      const next = upcoming[0];
      const dt = next.fields.datum_uhrzeit ? formatDateTime(next.fields.datum_uhrzeit) : '';
      return `Nächste Sitzung: „${next.fields.titel ?? next.erfahrungsraumName}" am ${dt}.`;
    }
    return 'Keine bevorstehenden Sitzungen geplant.';
  }, [todaySessions, upcoming]);

  // Calendar events
  const calEvents = useMemo<CalendarEvent[]>(() => {
    return enrichedSitzungen
      .filter(s => !!s.fields.datum_uhrzeit)
      .map(s => {
        let tone: CalendarTone = 'primary';
        try {
          if (isBefore(parseISO(s.fields.datum_uhrzeit!), startOfDay(clock))) tone = 'default';
        } catch { /* */ }
        const bCount = bewertungen.filter(b => extractRecordId(b.fields.sitzung) === s.record_id).length;
        return {
          id: `sitzung:${s.record_id}`,
          start: s.fields.datum_uhrzeit!,
          title: s.fields.titel ?? s.erfahrungsraumName ?? 'Sitzung',
          subtitle: [s.erfahrungsraumName, s.fields.ort_bezeichnung].filter(Boolean).join(' · ')
            || (bCount > 0 ? `${bCount} Bewertung${bCount > 1 ? 'en' : ''}` : undefined),
          tone,
        };
      });
  }, [enrichedSitzungen, bewertungen, clock]);

  // Reschedule via drag
  const handleEventDrop = async (eventId: string, newStart: string) => {
    const rid = eventId.split(':')[1];
    if (!rid) return;
    const prev = sitzungen.find(s => s.record_id === rid);
    if (!prev) return;
    setSitzungen(s => s.map(x => x.record_id === rid ? { ...x, fields: { ...x.fields, datum_uhrzeit: newStart } } : x));
    undoToast('Sitzung verschoben', () => {
      setSitzungen(s => s.map(x => x.record_id === rid ? prev : x));
      LivingAppsService.updateSitzungenEntry(rid, { datum_uhrzeit: prev.fields.datum_uhrzeit }).catch(() => fetchAll());
    });
    try {
      await LivingAppsService.updateSitzungenEntry(rid, { datum_uhrzeit: newStart });
    } catch {
      fetchAll();
    }
  };

  // Map markers — Sitzungen mit Standort
  const mapMarkers = useMemo<MapMarker[]>(() => {
    return enrichedSitzungen.flatMap(s => {
      const geo = s.fields.standort;
      if (!geo) return [];
      let tone: MapTone = 'primary';
      try {
        if (s.fields.datum_uhrzeit && isBefore(parseISO(s.fields.datum_uhrzeit), startOfDay(clock))) {
          tone = 'default';
        }
      } catch { /* */ }
      return [{
        id: `sitzung:${s.record_id}`,
        lat: geo.lat,
        long: geo.long,
        title: s.fields.titel ?? s.erfahrungsraumName ?? 'Sitzung',
        subtitle: [s.fields.ort_bezeichnung, s.fields.stadt].filter(Boolean).join(', ') || geo.info,
        tone,
        icon: 'calendar' as const,
      }];
    });
  }, [enrichedSitzungen, clock]);

  // Chart rows for Gesamteindruck
  const bewertungenRows = useMemo<ChartRow<typeof enrichedBewertungen[number]>[]>(() => {
    return enrichedBewertungen.map(b => ({ id: `bewertung:${b.record_id}`, data: b }));
  }, [enrichedBewertungen]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const top = overlay.top;

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {gruss(clock)}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{contextLine}</p>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditingSitzung(null); setSitzungDefaults({}); setSitzungDialogOpen(true); }}
            className="shrink-0"
          >
            <IconPlus size={16} className="mr-1 shrink-0" />
            Neue Sitzung
          </Button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        kpis={
          <StatCardRow>
            <StatCard
              title="Sitzungen gesamt"
              value={sitzungen.length}
              description={sitzungen.length === 0 ? 'Noch keine geplant' : `${upcoming.length} bevorstehend`}
              icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
              tone="default"
            />
            <StatCard
              title="Heute"
              value={todaySessions.length}
              description={todaySessions.length > 0 ? namen(todaySessions.map(s => s.fields.titel ?? '—'), 2) : 'Keine Sitzungen heute'}
              icon={<IconSparkles size={18} className="text-muted-foreground" />}
              tone={todaySessions.length > 0 ? 'primary' : 'default'}
            />
            <StatCard
              title="Teilnehmer"
              value={teilnehmer.length}
              description={teilnehmer.length === 0 ? 'Noch keine angelegt' : `${teilnehmer.length} registriert`}
              icon={<IconUsers size={18} className="text-muted-foreground" />}
              tone="default"
            />
            <StatCard
              title="Bewertungen"
              value={bewertungen.length}
              description={bewertungen.length === 0 ? 'Noch keine abgegeben' : `Ø Gesamteindruck: ${(() => {
                const scores = bewertungen.map(b => {
                  const k = b.fields.gesamteindruck?.key ?? '';
                  return parseInt(k.replace('bewertung_', ''), 10);
                }).filter(n => !isNaN(n));
                if (!scores.length) return '—';
                return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
              })()}`}
              icon={<IconStar size={18} className="text-muted-foreground" />}
              tone={bewertungen.length === 0 ? 'default' : 'success'}
            />
          </StatCardRow>
        }
        primary={
          <CalendarWidget
            events={calEvents}
            defaultView="week"
            locale={de}
            onEventClick={ev => {
              const rid = ev.id.split(':')[1];
              const rec = sitzungen.find(s => s.record_id === rid);
              if (rec) overlay.replace({ type: 'sitzung', record: rec });
            }}
            onEventDrop={handleEventDrop}
            onEmptyClick={date => {
              setSitzungDefaults({ datum_uhrzeit: format(date, "yyyy-MM-dd'T'HH:mm") });
              setEditingSitzung(null);
              setSitzungDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title="Bevorstehende Sitzungen"
              icon={<IconCalendarEvent size={16} className="shrink-0" />}
              items={upcoming.slice(0, 6).map(s => ({
                id: s.record_id,
                title: s.fields.titel ?? s.erfahrungsraumName ?? 'Sitzung',
                secondLine: (
                  <>
                    <span className="text-muted-foreground">{s.fields.datum_uhrzeit ? formatDateTime(s.fields.datum_uhrzeit) : '—'}</span>
                    {s.fields.ort_bezeichnung && (
                      <span className="text-muted-foreground"> · <IconMapPin size={12} className="inline -mt-0.5 shrink-0" /> {s.fields.ort_bezeichnung}</span>
                    )}
                  </>
                ),
                action: {
                  label: '+ Bewertung',
                  onClick: () => {
                    setBewertungForSitzung(s.record_id);
                    setBewertungDialogOpen(true);
                  },
                },
              }))}
              onItemClick={id => {
                const rec = sitzungen.find(s => s.record_id === id);
                if (rec) overlay.replace({ type: 'sitzung', record: rec });
              }}
              empty={{
                text: 'Keine Sitzungen geplant — plane die nächste jetzt',
                action: { label: 'Neue Sitzung', onClick: () => { setEditingSitzung(null); setSitzungDefaults({}); setSitzungDialogOpen(true); } },
              }}
            />
            {bewertungenRows.length > 0 ? (
              <ChartWidget
                title="Gesamteindruck"
                rows={bewertungenRows}
                dimension={{
                  kind: 'category',
                  accessor: r => r.data.fields.gesamteindruck,
                  label: 'Bewertungsstufe',
                }}
              />
            ) : (
              <ChartSkeleton />
            )}
            {mapMarkers.length > 0 ? (
              <MapWidget
                markers={mapMarkers}
                onMarkerClick={m => {
                  const rid = m.id.split(':')[1];
                  const rec = sitzungen.find(s => s.record_id === rid);
                  if (rec) overlay.replace({ type: 'sitzung', record: rec });
                }}
                legend={[
                  { label: 'Bevorstehend', tone: 'primary', icon: 'calendar' },
                  { label: 'Vergangen', tone: 'default', icon: 'calendar' },
                ]}
              />
            ) : (
              <MapSkeleton />
            )}
          </>
        }
      />

      {/* Single RecordOverlayHost */}
      <RecordOverlay
        open={overlay.open}
        onClose={overlay.close}
        onBack={overlay.canGoBack ? overlay.pop : undefined}
        onEdit={top?.type === 'sitzung' ? () => {
          setEditingSitzung(top.record);
          setSitzungDefaults(top.record.fields);
          setSitzungDialogOpen(true);
        } : undefined}
        footer={top?.type === 'sitzung' ? (
          <Button size="sm" onClick={() => {
            if (!top) return;
            setBewertungForSitzung(top.record.record_id);
            setBewertungDialogOpen(true);
          }}>
            + Bewertung erfassen
          </Button>
        ) : undefined}
      >
        {top?.type === 'sitzung' && (
          <>
            <RecordHeader
              title={top.record.fields.titel ?? 'Sitzung'}
              subtitle={top.record.fields.datum_uhrzeit ? formatDateTime(top.record.fields.datum_uhrzeit) : undefined}
            />
            <SitzungenDetails
              record={top.record}
              erfahrungsraumFormateList={erfahrungsraumFormate}
              onOpenErfahrungsraumFormate={rec => overlay.push({ type: 'erfahrungsraum', record: rec })}
              teilnehmerList={teilnehmer}
              onOpenTeilnehmer={rec => overlay.push({ type: 'teilnehmer', record: rec })}
              bewertungenList={bewertungen}
              onOpenBewertungen={rec => overlay.push({ type: 'bewertung', record: rec })}
              onAddBewertungen={() => {
                setBewertungForSitzung(top.record.record_id);
                setBewertungDialogOpen(true);
              }}
            />
          </>
        )}
        {top?.type === 'erfahrungsraum' && (
          <>
            <RecordHeader
              title={top.record.fields.name ?? 'Erfahrungsraum'}
              subtitle={top.record.fields.methodik?.label}
            />
            <ErfahrungsraumFormateDetails
              record={top.record}
              sitzungenList={sitzungen}
              onOpenSitzungen={rec => overlay.push({ type: 'sitzung', record: rec })}
              onAddSitzungen={() => {
                setSitzungDefaults({ erfahrungsraum: createRecordUrl(APP_IDS.ERFAHRUNGSRAUM_FORMATE, top.record.record_id) });
                setEditingSitzung(null);
                setSitzungDialogOpen(true);
              }}
            />
          </>
        )}
        {top?.type === 'teilnehmer' && (
          <>
            <RecordHeader
              title={[top.record.fields.vorname, top.record.fields.nachname].filter(Boolean).join(' ') || 'Teilnehmer'}
              subtitle={top.record.fields.organisation}
            />
            <TeilnehmerDetails
              record={top.record}
              sitzungenList={sitzungen}
              onOpenSitzungen={rec => overlay.push({ type: 'sitzung', record: rec })}
              onAddSitzungen={() => { setEditingSitzung(null); setSitzungDefaults({}); setSitzungDialogOpen(true); }}
              bewertungenList={bewertungen}
              onOpenBewertungen={rec => overlay.push({ type: 'bewertung', record: rec })}
              onAddBewertungen={() => { setBewertungDialogOpen(true); }}
            />
          </>
        )}
        {top?.type === 'bewertung' && (
          <>
            <RecordHeader
              title={`Bewertung — ${top.record.fields.bewertungsdatum ?? ''}`}
              subtitle={top.record.fields.gesamteindruck?.label}
            />
            <BewertungenDetails
              record={top.record}
              sitzungenList={sitzungen}
              onOpenSitzungen={rec => overlay.push({ type: 'sitzung', record: rec })}
              teilnehmerList={teilnehmer}
              onOpenTeilnehmer={rec => overlay.push({ type: 'teilnehmer', record: rec })}
            />
          </>
        )}
      </RecordOverlay>

      {/* Sitzungen Dialog */}
      <SitzungenDialog
        open={sitzungDialogOpen}
        onClose={() => { setSitzungDialogOpen(false); setEditingSitzung(null); setSitzungDefaults({}); }}
        onSubmit={async fields => {
          if (editingSitzung) {
            await LivingAppsService.updateSitzungenEntry(editingSitzung.record_id, fields);
            undoToast('Sitzung aktualisiert');
          } else {
            await LivingAppsService.createSitzungenEntry(fields);
            undoToast('Sitzung erstellt');
          }
          fetchAll();
        }}
        defaultValues={editingSitzung ? editingSitzung.fields : sitzungDefaults}
        recordId={editingSitzung?.record_id}
        erfahrungsraumFormateList={erfahrungsraumFormate}
        teilnehmerList={teilnehmer}
        enablePhotoScan={AI_PHOTO_SCAN['Sitzungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Sitzungen']}
      />

      {/* Bewertungen Dialog */}
      <BewertungenDialog
        open={bewertungDialogOpen}
        onClose={() => { setBewertungDialogOpen(false); setBewertungForSitzung(null); }}
        onSubmit={async fields => {
          await LivingAppsService.createBewertungenEntry(fields);
          undoToast('Bewertung gespeichert');
          fetchAll();
        }}
        defaultValues={bewertungForSitzung ? {
          sitzung: createRecordUrl(APP_IDS.SITZUNGEN, bewertungForSitzung),
          bewertungsdatum: todayKey,
        } : { bewertungsdatum: todayKey }}
        sitzungenList={sitzungen}
        teilnehmerList={teilnehmer}
        enablePhotoScan={AI_PHOTO_SCAN['Bewertungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bewertungen']}
      />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <CalendarSkeleton />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
