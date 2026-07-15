import type { EnrichedBewertungen, EnrichedSitzungen } from '@/types/enriched';
import type { Bewertungen, ErfahrungsraumFormate, Sitzungen, Teilnehmer } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface SitzungenMaps {
  erfahrungsraumFormateMap: Map<string, ErfahrungsraumFormate>;
  teilnehmerMap: Map<string, Teilnehmer>;
}

export function enrichSitzungen(
  sitzungen: Sitzungen[],
  maps: SitzungenMaps
): EnrichedSitzungen[] {
  return sitzungen.map(r => ({
    ...r,
    erfahrungsraumName: resolveDisplay(r.fields.erfahrungsraum, maps.erfahrungsraumFormateMap, 'name'),
    teilnehmerName: resolveDisplay(r.fields.teilnehmer, maps.teilnehmerMap, 'vorname', 'nachname'),
  }));
}

interface BewertungenMaps {
  sitzungenMap: Map<string, Sitzungen>;
  teilnehmerMap: Map<string, Teilnehmer>;
}

export function enrichBewertungen(
  bewertungen: Bewertungen[],
  maps: BewertungenMaps
): EnrichedBewertungen[] {
  return bewertungen.map(r => ({
    ...r,
    sitzungName: resolveDisplay(r.fields.sitzung, maps.sitzungenMap, 'titel'),
    teilnehmerName: resolveDisplay(r.fields.teilnehmer, maps.teilnehmerMap, 'vorname', 'nachname'),
  }));
}
