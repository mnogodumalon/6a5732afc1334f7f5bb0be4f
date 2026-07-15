import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Teilnehmer, ErfahrungsraumFormate, Sitzungen, Bewertungen } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

/** Dashboard data + the OPTIMISTIC-WRITE API.
 *
 *  The per-entity setters (`set<Entity>`) are exported for exactly one job:
 *  optimistic updates on drag writes (onEventDrop / onEventResize /
 *  onCardMove). Call the setter FIRST — the bar/card lands instantly — then
 *  fire the PATCH in the background and call `fetchAll()` ONLY in the catch.
 *  Never await the PATCH before updating state (the UI freezes for the full
 *  round-trip on every drag) and never refetch after a successful write.
 *  There is no other mechanism (no `__optimistic`, no `mutate`).
 */
export function useDashboardData() {
  const [teilnehmer, setTeilnehmer] = useState<Teilnehmer[]>([]);
  const [erfahrungsraumFormate, setErfahrungsraumFormate] = useState<ErfahrungsraumFormate[]>([]);
  const [sitzungen, setSitzungen] = useState<Sitzungen[]>([]);
  const [bewertungen, setBewertungen] = useState<Bewertungen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [teilnehmerData, erfahrungsraumFormateData, sitzungenData, bewertungenData] = await Promise.all([
        LivingAppsService.getTeilnehmer(),
        LivingAppsService.getErfahrungsraumFormate(),
        LivingAppsService.getSitzungen(),
        LivingAppsService.getBewertungen(),
      ]);
      setTeilnehmer(teilnehmerData);
      setErfahrungsraumFormate(erfahrungsraumFormateData);
      setSitzungen(sitzungenData);
      setBewertungen(bewertungenData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [teilnehmerData, erfahrungsraumFormateData, sitzungenData, bewertungenData] = await Promise.all([
          LivingAppsService.getTeilnehmer(),
          LivingAppsService.getErfahrungsraumFormate(),
          LivingAppsService.getSitzungen(),
          LivingAppsService.getBewertungen(),
        ]);
        setTeilnehmer(teilnehmerData);
        setErfahrungsraumFormate(erfahrungsraumFormateData);
        setSitzungen(sitzungenData);
        setBewertungen(bewertungenData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const teilnehmerMap = useMemo(() => {
    const m = new Map<string, Teilnehmer>();
    teilnehmer.forEach(r => m.set(r.record_id, r));
    return m;
  }, [teilnehmer]);

  const erfahrungsraumFormateMap = useMemo(() => {
    const m = new Map<string, ErfahrungsraumFormate>();
    erfahrungsraumFormate.forEach(r => m.set(r.record_id, r));
    return m;
  }, [erfahrungsraumFormate]);

  const sitzungenMap = useMemo(() => {
    const m = new Map<string, Sitzungen>();
    sitzungen.forEach(r => m.set(r.record_id, r));
    return m;
  }, [sitzungen]);

  return { teilnehmer, setTeilnehmer, erfahrungsraumFormate, setErfahrungsraumFormate, sitzungen, setSitzungen, bewertungen, setBewertungen, loading, error, fetchAll, teilnehmerMap, erfahrungsraumFormateMap, sitzungenMap };
}