import type { Sitzungen, ErfahrungsraumFormate, Teilnehmer, Bewertungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface SitzungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Sitzungen;
  /** N:1-Ziel „ErfahrungsraumFormate": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  erfahrungsraumFormateList: ErfahrungsraumFormate[];
  /** Klick auf die ErfahrungsraumFormate-Relation → overlay.push auf dessen Detail. */
  onOpenErfahrungsraumFormate?: (record: ErfahrungsraumFormate) => void;
  /** N:1-Ziel „Teilnehmer": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  teilnehmerList: Teilnehmer[];
  /** Klick auf die Teilnehmer-Relation → overlay.push auf dessen Detail. */
  onOpenTeilnehmer?: (record: Teilnehmer) => void;
  /** 1:N „Bewertungen": VOLLE Liste — der Block filtert auf diesen Record. */
  bewertungenList: Bewertungen[];
  /** Zeilen-Klick → overlay.push auf das Bewertungen-Detail (nie der Edit-Dialog). */
  onOpenBewertungen: (record: Bewertungen) => void;
  /** Kontextuelles „+": öffnet den Bewertungen-Dialog mit diesem Record vorgesetzt. */
  onAddBewertungen: () => void;
}

export function SitzungenDetails({
  record,
  erfahrungsraumFormateList,
  onOpenErfahrungsraumFormate,
  teilnehmerList,
  onOpenTeilnehmer: _onOpenTeilnehmer,
  bewertungenList,
  onOpenBewertungen,
  onAddBewertungen,
}: SitzungenDetailsProps) {
  const erfahrungsraumTarget = erfahrungsraumFormateList.find(r => r.record_id === extractRecordId(record.fields.erfahrungsraum));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Titel der Sitzung" value={record.fields.titel} format="text" />
        <RecordField label="Datum und Uhrzeit" value={record.fields.datum_uhrzeit} format="datetime" />
        <RecordField label="Moderator – Nachname" value={record.fields.moderator_nachname} format="text" />
        <RecordField label="Teilnehmer" value={Array.isArray(record.fields.teilnehmer) ? record.fields.teilnehmer.map((u: unknown) => teilnehmerList.find(t => t.record_id === extractRecordId(u))?.fields.vorname ?? '—').join(', ') : null} format="text" />
        <RecordField label="Agenda" value={record.fields.agenda} format="longtext" className="md:col-span-2" />
        <RecordField label="Nachbereitungsnotizen" value={record.fields.nachbereitungsnotizen} format="longtext" className="md:col-span-2" />
        <RecordField label="Dokumente / Protokoll" className="md:col-span-2">
          {record.fields.dokumente ? (
            <MediaThumbnail src={record.fields.dokumente as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
        <RecordField label="Ortsbezeichnung" value={record.fields.ort_bezeichnung} format="text" />
        <RecordField label="Straße" value={record.fields.strasse} format="text" />
        <RecordField label="Hausnummer" value={record.fields.hausnummer} format="text" />
        <RecordField label="Postleitzahl" value={record.fields.postleitzahl} format="text" />
        <RecordField label="Stadt" value={record.fields.stadt} format="text" />
        <RecordField label="Standort auf der Karte" value={record.fields.standort?.info ?? (record.fields.standort ? `${record.fields.standort.lat}, ${record.fields.standort.long}` : null)} />
        <RecordField label="Moderator – Vorname" value={record.fields.moderator_vorname} format="text" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={1}>
        <RecordRelation
          label="Erfahrungsraum-Format"
          name={erfahrungsraumTarget?.fields.name ?? '—'}
          meta={[erfahrungsraumTarget?.fields.zielgruppe, erfahrungsraumTarget?.fields.weitere_methoden].filter(Boolean).join(' · ') || undefined}
          onClick={erfahrungsraumTarget && onOpenErfahrungsraumFormate ? () => onOpenErfahrungsraumFormate!(erfahrungsraumTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title="Bewertungen"
        items={bewertungenList.filter(r => extractRecordId(r.fields.sitzung) === record.record_id)}
        map={r => ({ name: 'Bewertungen', meta: r.fields.bewertungsdatum })}
        onOpen={onOpenBewertungen}
        onAdd={onAddBewertungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.SITZUNGEN} recordId={record.record_id} />
    </>
  );
}
