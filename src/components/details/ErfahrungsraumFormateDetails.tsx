import type { ErfahrungsraumFormate, Sitzungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface ErfahrungsraumFormateDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: ErfahrungsraumFormate;
  /** 1:N „Sitzungen": VOLLE Liste — der Block filtert auf diesen Record. */
  sitzungenList: Sitzungen[];
  /** Zeilen-Klick → overlay.push auf das Sitzungen-Detail (nie der Edit-Dialog). */
  onOpenSitzungen: (record: Sitzungen) => void;
  /** Kontextuelles „+": öffnet den Sitzungen-Dialog mit diesem Record vorgesetzt. */
  onAddSitzungen: () => void;
}

export function ErfahrungsraumFormateDetails({
  record,
  sitzungenList,
  onOpenSitzungen,
  onAddSitzungen,
}: ErfahrungsraumFormateDetailsProps) {
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Name des Erfahrungsraums" value={record.fields.name} format="text" />
        <RecordField label="Beschreibung" value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label="Zielsetzung" value={record.fields.zielsetzung} format="longtext" className="md:col-span-2" />
        <RecordField label="Zielgruppe" value={record.fields.zielgruppe} format="text" />
        <RecordField label="Methodik" value={record.fields.methodik} format="pill" />
        <RecordField label="Weitere Methoden / Ergänzungen" value={record.fields.weitere_methoden} format="text" />
        <RecordField label="Geplante Dauer (in Stunden)" value={record.fields.dauer_stunden} format="text" />
        <RecordField label="Maximale Teilnehmerzahl" value={record.fields.max_teilnehmer} format="text" />
        <RecordField label="Status" value={record.fields.status} format="pill" />
        <RecordField label="Materialien / Unterlagen" className="md:col-span-2">
          {record.fields.materialien ? (
            <MediaThumbnail src={record.fields.materialien as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
        <RecordField label="Anmerkungen" value={record.fields.anmerkungen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title="Sitzungen"
        items={sitzungenList.filter(r => extractRecordId(r.fields.erfahrungsraum) === record.record_id)}
        map={r => ({ name: r.fields.titel ?? 'Sitzungen', meta: r.fields.datum_uhrzeit })}
        onOpen={onOpenSitzungen}
        onAdd={onAddSitzungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.ERFAHRUNGSRAUM_FORMATE} recordId={record.record_id} />
    </>
  );
}
