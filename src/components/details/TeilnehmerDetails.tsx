import type { Teilnehmer, Sitzungen, Bewertungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface TeilnehmerDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Teilnehmer;
  /** 1:N „Sitzungen": VOLLE Liste — der Block filtert auf diesen Record. */
  sitzungenList: Sitzungen[];
  /** Zeilen-Klick → overlay.push auf das Sitzungen-Detail (nie der Edit-Dialog). */
  onOpenSitzungen: (record: Sitzungen) => void;
  /** Kontextuelles „+": öffnet den Sitzungen-Dialog mit diesem Record vorgesetzt. */
  onAddSitzungen: () => void;
  /** 1:N „Bewertungen": VOLLE Liste — der Block filtert auf diesen Record. */
  bewertungenList: Bewertungen[];
  /** Zeilen-Klick → overlay.push auf das Bewertungen-Detail (nie der Edit-Dialog). */
  onOpenBewertungen: (record: Bewertungen) => void;
  /** Kontextuelles „+": öffnet den Bewertungen-Dialog mit diesem Record vorgesetzt. */
  onAddBewertungen: () => void;
}

export function TeilnehmerDetails({
  record,
  sitzungenList,
  onOpenSitzungen,
  onAddSitzungen,
  bewertungenList,
  onOpenBewertungen,
  onAddBewertungen,
}: TeilnehmerDetailsProps) {
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Vorname" value={record.fields.vorname} format="text" />
        <RecordField label="Nachname" value={record.fields.nachname} format="text" />
        <RecordField label="Organisation" value={record.fields.organisation} format="text" />
        <RecordField label="Rolle / Position" value={record.fields.rolle} format="text" />
        <RecordField label="E-Mail-Adresse" value={record.fields.email} format="email" />
        <RecordField label="Telefonnummer" value={record.fields.telefon} format="text" />
        <RecordField label="Notizen" value={record.fields.notizen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title="Sitzungen"
        items={sitzungenList.filter(r => Array.isArray(r.fields.teilnehmer) && r.fields.teilnehmer.some((u: unknown) => extractRecordId(u) === record.record_id))}
        map={r => ({ name: r.fields.titel ?? 'Sitzungen', meta: r.fields.datum_uhrzeit })}
        onOpen={onOpenSitzungen}
        onAdd={onAddSitzungen}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title="Bewertungen"
        items={bewertungenList.filter(r => extractRecordId(r.fields.teilnehmer) === record.record_id)}
        map={r => ({ name: 'Bewertungen', meta: r.fields.bewertungsdatum })}
        onOpen={onOpenBewertungen}
        onAdd={onAddBewertungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.TEILNEHMER} recordId={record.record_id} />
    </>
  );
}
