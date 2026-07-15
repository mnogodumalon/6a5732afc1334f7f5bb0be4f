// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Teilnehmer {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    organisation?: string;
    rolle?: string;
    email?: string;
    telefon?: string;
    notizen?: string;
  };
}

export interface ErfahrungsraumFormate {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    name?: string;
    beschreibung?: string;
    zielsetzung?: string;
    zielgruppe?: string;
    methodik?: LookupValue;
    weitere_methoden?: string;
    dauer_stunden?: number;
    max_teilnehmer?: number;
    status?: LookupValue;
    materialien?: string;
    anmerkungen?: string;
  };
}

export interface Sitzungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    erfahrungsraum?: string; // applookup -> URL zu 'ErfahrungsraumFormate' Record
    datum_uhrzeit?: string; // Format: YYYY-MM-DD oder ISO String
    moderator_nachname?: string;
    teilnehmer?: string;
    agenda?: string;
    nachbereitungsnotizen?: string;
    dokumente?: string;
    ort_bezeichnung?: string;
    strasse?: string;
    hausnummer?: string;
    postleitzahl?: string;
    stadt?: string;
    standort?: GeoLocation; // { lat, long, info }
    moderator_vorname?: string;
  };
}

export interface Bewertungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    sitzung?: string; // applookup -> URL zu 'Sitzungen' Record
    teilnehmer?: string; // applookup -> URL zu 'Teilnehmer' Record
    bewertungsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    gesamteindruck?: LookupValue;
    relevanz?: LookupValue;
    umsetzbarkeit?: LookupValue;
    methodenqualitaet?: LookupValue;
    wichtigste_erkenntnis?: string;
    naechste_schritte?: string;
    verbesserungsvorschlaege?: string;
    weiterempfehlung?: boolean;
  };
}

export const APP_IDS = {
  TEILNEHMER: '6a5732837233ac731b9d8400',
  ERFAHRUNGSRAUM_FORMATE: '6a573287887b7fd750dcce20',
  SITZUNGEN: '6a573288cd157e1946410884',
  BEWERTUNGEN: '6a573289304dfda38cab4969',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'erfahrungsraum_formate': {
    methodik: [{ key: "simulation", label: "Simulation" }, { key: "szenarioarbeit", label: "Szenarioarbeit" }, { key: "prototyping", label: "Prototyping" }, { key: "design_thinking", label: "Design Thinking" }, { key: "world_cafe", label: "World Café" }, { key: "zukunftswerkstatt", label: "Zukunftswerkstatt" }, { key: "open_space", label: "Open Space" }, { key: "rollenspiel", label: "Rollenspiel" }, { key: "sonstiges", label: "Sonstiges" }],
    status: [{ key: "aktiv", label: "Aktiv" }, { key: "in_entwicklung", label: "In Entwicklung" }, { key: "archiviert", label: "Archiviert" }],
  },
  'bewertungen': {
    gesamteindruck: [{ key: "bewertung_1", label: "1 – Sehr schlecht" }, { key: "bewertung_2", label: "2 – Schlecht" }, { key: "bewertung_3", label: "3 – Befriedigend" }, { key: "bewertung_4", label: "4 – Gut" }, { key: "bewertung_5", label: "5 – Sehr gut" }],
    relevanz: [{ key: "relevanz_1", label: "1 – Sehr schlecht" }, { key: "relevanz_2", label: "2 – Schlecht" }, { key: "relevanz_3", label: "3 – Befriedigend" }, { key: "relevanz_4", label: "4 – Gut" }, { key: "relevanz_5", label: "5 – Sehr gut" }],
    umsetzbarkeit: [{ key: "umsetz_1", label: "1 – Sehr schlecht" }, { key: "umsetz_2", label: "2 – Schlecht" }, { key: "umsetz_3", label: "3 – Befriedigend" }, { key: "umsetz_4", label: "4 – Gut" }, { key: "umsetz_5", label: "5 – Sehr gut" }],
    methodenqualitaet: [{ key: "methode_1", label: "1 – Sehr schlecht" }, { key: "methode_2", label: "2 – Schlecht" }, { key: "methode_3", label: "3 – Befriedigend" }, { key: "methode_4", label: "4 – Gut" }, { key: "methode_5", label: "5 – Sehr gut" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'teilnehmer': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'organisation': 'string/text',
    'rolle': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'notizen': 'string/textarea',
  },
  'erfahrungsraum_formate': {
    'name': 'string/text',
    'beschreibung': 'string/textarea',
    'zielsetzung': 'string/textarea',
    'zielgruppe': 'string/text',
    'methodik': 'lookup/select',
    'weitere_methoden': 'string/text',
    'dauer_stunden': 'number',
    'max_teilnehmer': 'number',
    'status': 'lookup/radio',
    'materialien': 'file',
    'anmerkungen': 'string/textarea',
  },
  'sitzungen': {
    'titel': 'string/text',
    'erfahrungsraum': 'applookup/select',
    'datum_uhrzeit': 'date/datetimeminute',
    'moderator_nachname': 'string/text',
    'teilnehmer': 'multipleapplookup/select',
    'agenda': 'string/textarea',
    'nachbereitungsnotizen': 'string/textarea',
    'dokumente': 'file',
    'ort_bezeichnung': 'string/text',
    'strasse': 'string/text',
    'hausnummer': 'string/text',
    'postleitzahl': 'string/text',
    'stadt': 'string/text',
    'standort': 'geo',
    'moderator_vorname': 'string/text',
  },
  'bewertungen': {
    'sitzung': 'applookup/select',
    'teilnehmer': 'applookup/select',
    'bewertungsdatum': 'date/date',
    'gesamteindruck': 'lookup/radio',
    'relevanz': 'lookup/radio',
    'umsetzbarkeit': 'lookup/radio',
    'methodenqualitaet': 'lookup/radio',
    'wichtigste_erkenntnis': 'string/textarea',
    'naechste_schritte': 'string/textarea',
    'verbesserungsvorschlaege': 'string/textarea',
    'weiterempfehlung': 'bool',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateTeilnehmer = StripLookup<Teilnehmer['fields']>;
export type CreateErfahrungsraumFormate = StripLookup<ErfahrungsraumFormate['fields']>;
export type CreateSitzungen = StripLookup<Sitzungen['fields']>;
export type CreateBewertungen = StripLookup<Bewertungen['fields']>;