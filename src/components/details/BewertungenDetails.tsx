import type { Bewertungen, Sitzungen, Teilnehmer } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';

export interface BewertungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Bewertungen;
  /** N:1-Ziel „Sitzungen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  sitzungenList: Sitzungen[];
  /** Klick auf die Sitzungen-Relation → overlay.push auf dessen Detail. */
  onOpenSitzungen?: (record: Sitzungen) => void;
  /** N:1-Ziel „Teilnehmer": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  teilnehmerList: Teilnehmer[];
  /** Klick auf die Teilnehmer-Relation → overlay.push auf dessen Detail. */
  onOpenTeilnehmer?: (record: Teilnehmer) => void;
}

export function BewertungenDetails({
  record,
  sitzungenList,
  onOpenSitzungen,
  teilnehmerList,
  onOpenTeilnehmer,
}: BewertungenDetailsProps) {
  const sitzungTarget = sitzungenList.find(r => r.record_id === extractRecordId(record.fields.sitzung));
  const teilnehmerTarget = teilnehmerList.find(r => r.record_id === extractRecordId(record.fields.teilnehmer));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Datum der Bewertung" value={record.fields.bewertungsdatum} format="date" />
        <RecordField label="Gesamteindruck" value={record.fields.gesamteindruck} format="pill" />
        <RecordField label="Relevanz für meine Situation" value={record.fields.relevanz} format="pill" />
        <RecordField label="Umsetzbarkeit der Erkenntnisse" value={record.fields.umsetzbarkeit} format="pill" />
        <RecordField label="Qualität der eingesetzten Methoden" value={record.fields.methodenqualitaet} format="pill" />
        <RecordField label="Meine wichtigste Erkenntnis" value={record.fields.wichtigste_erkenntnis} format="longtext" className="md:col-span-2" />
        <RecordField label="Meine nächsten Schritte" value={record.fields.naechste_schritte} format="longtext" className="md:col-span-2" />
        <RecordField label="Verbesserungsvorschläge" value={record.fields.verbesserungsvorschlaege} format="longtext" className="md:col-span-2" />
        <RecordField label="Ich würde diesen Erfahrungsraum weiterempfehlen." value={record.fields.weiterempfehlung} format="bool" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={2}>
        <RecordRelation
          label="Sitzung"
          name={sitzungTarget?.fields.titel ?? '—'}
          meta={[sitzungTarget?.fields.moderator_nachname, sitzungTarget?.fields.ort_bezeichnung].filter(Boolean).join(' · ') || undefined}
          onClick={sitzungTarget && onOpenSitzungen ? () => onOpenSitzungen!(sitzungTarget!) : undefined}
        />
        <RecordRelation
          label="Teilnehmer"
          name={teilnehmerTarget?.fields.vorname ?? '—'}
          meta={[teilnehmerTarget?.fields.email, teilnehmerTarget?.fields.telefon].filter(Boolean).join(' · ') || undefined}
          onClick={teilnehmerTarget && onOpenTeilnehmer ? () => onOpenTeilnehmer!(teilnehmerTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.BEWERTUNGEN} recordId={record.record_id} />
    </>
  );
}
