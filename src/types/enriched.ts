import type { Bewertungen, Sitzungen } from './app';

export type EnrichedSitzungen = Sitzungen & {
  erfahrungsraumName: string;
  teilnehmerName: string;
};

export type EnrichedBewertungen = Bewertungen & {
  sitzungName: string;
  teilnehmerName: string;
};
