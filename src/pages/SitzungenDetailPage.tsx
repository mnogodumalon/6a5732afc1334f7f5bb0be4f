import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Sitzungen, ErfahrungsraumFormate, Teilnehmer } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import {
  RecordView, RecordHeader, RecordKeyFacts, RecordSection, RecordField,
  RecordAttachments, RecordViewSkeleton, RecordViewEmpty,
} from '@/components/widgets/RecordView';
import { SitzungenDialog } from '@/components/dialogs/SitzungenDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { formEnhancements } from '@/config/form-enhancements/Sitzungen';
import { evalComputed } from '@/config/form-enhancements/types';

export default function SitzungenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<Sitzungen | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [erfahrungsraumFormateList, setErfahrungsraumFormateList] = useState<ErfahrungsraumFormate[]>([]);
  const [teilnehmerList, setTeilnehmerList] = useState<Teilnehmer[]>([]);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, erfahrungsraumFormateData, teilnehmerData] = await Promise.all([
        LivingAppsService.getSitzungen(),
        LivingAppsService.getErfahrungsraumFormate(),
        LivingAppsService.getTeilnehmer(),
      ]);
      setErfahrungsraumFormateList(erfahrungsraumFormateData);
      setTeilnehmerList(teilnehmerData);
      setRecord(mainData.find(r => r.record_id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(fields: Sitzungen['fields']) {
    if (!record) return;
    await LivingAppsService.updateSitzungenEntry(record.record_id, fields);
    await loadData();
    setEditing(false);
  }

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteSitzungenEntry(record.record_id);
    setDeleteOpen(false);
    navigate('/sitzungen');
  }

  function getErfahrungsraumFormateDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return erfahrungsraumFormateList.find(r => r.record_id === refId)?.fields.name ?? '—';
  }

  function getTeilnehmerDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return teilnehmerList.find(r => r.record_id === refId)?.fields.vorname ?? '—';
  }

  if (loading) {
    return <RecordViewSkeleton />;
  }

  if (!record) {
    return (
      <RecordViewEmpty
        title="Eintrag nicht gefunden"
        action={
          <Button variant="ghost" onClick={() => navigate('/sitzungen')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            Zurück
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/sitzungen')}
      onEdit={() => setEditing(true)}
      backLabel="Zurück"
      editLabel="Bearbeiten"
    >
      <RecordHeader title={record.fields.titel ?? 'Sitzungen'} />

      {(() => {
        const lookupLists: Record<string, unknown> = {
          erfahrungsraum: erfahrungsraumFormateList,
          teilnehmer: teilnehmerList,
        };
        const fmtComputed = (k: string, n: number) =>
          /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k)
            ? n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
        const computedFacts = Object.entries(formEnhancements.computed)
          .map(([key, formula]) => {
            const v = evalComputed(formula, record!.fields as Record<string, unknown>, { lookupLists });
            return v != null
              ? { label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), value: fmtComputed(key, v) }
              : null;
          })
          .filter((f): f is { label: string; value: string } => f !== null);
        return computedFacts.length > 0 ? <RecordKeyFacts items={computedFacts} /> : null;
      })()}

      <RecordSection title="Details" cols={2}>
        <RecordField label="Titel der Sitzung" value={record.fields.titel} format="text" />
        <RecordField label="Erfahrungsraum-Format" value={getErfahrungsraumFormateDisplayName(record.fields.erfahrungsraum)} format="text" />
        <RecordField label="Datum und Uhrzeit" value={record.fields.datum_uhrzeit} format="datetime" />
        <RecordField label="Moderator – Nachname" value={record.fields.moderator_nachname} format="text" />
        <RecordField label="Teilnehmer" value={Array.isArray(record.fields.teilnehmer) ? record.fields.teilnehmer.map((u: unknown) => getTeilnehmerDisplayName(u)).join(', ') : null} format="text" />
        <RecordField label="Agenda" value={record.fields.agenda} format="longtext" className="md:col-span-2" />
        <RecordField label="Nachbereitungsnotizen" value={record.fields.nachbereitungsnotizen} format="longtext" className="md:col-span-2" />
        <RecordField label="Ortsbezeichnung" value={record.fields.ort_bezeichnung} format="text" />
        <RecordField label="Straße" value={record.fields.strasse} format="text" />
        <RecordField label="Hausnummer" value={record.fields.hausnummer} format="text" />
        <RecordField label="Postleitzahl" value={record.fields.postleitzahl} format="text" />
        <RecordField label="Stadt" value={record.fields.stadt} format="text" />
        <RecordField label="Moderator – Vorname" value={record.fields.moderator_vorname} format="text" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.SITZUNGEN} recordId={record.record_id} />

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
          <IconTrash className="h-4 w-4 mr-1.5" />
          Löschen
        </Button>
      </div>

      <SitzungenDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
        defaultValues={record.fields}
        recordId={record.record_id}
        erfahrungsraumFormateList={erfahrungsraumFormateList}
        teilnehmerList={teilnehmerList}
        enablePhotoScan={AI_PHOTO_SCAN['Sitzungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Sitzungen']}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Sitzungen löschen"
        description="Soll dieser Eintrag wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden."
      />
    </RecordView>
  );
}
