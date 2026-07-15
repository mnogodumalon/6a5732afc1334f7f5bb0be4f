import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Bewertungen, Sitzungen, Teilnehmer } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import {
  RecordView, RecordHeader, RecordKeyFacts, RecordSection, RecordField,
  RecordAttachments, RecordViewSkeleton, RecordViewEmpty,
} from '@/components/widgets/RecordView';
import { BewertungenDialog } from '@/components/dialogs/BewertungenDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { formEnhancements } from '@/config/form-enhancements/Bewertungen';
import { evalComputed } from '@/config/form-enhancements/types';

export default function BewertungenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<Bewertungen | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sitzungenList, setSitzungenList] = useState<Sitzungen[]>([]);
  const [teilnehmerList, setTeilnehmerList] = useState<Teilnehmer[]>([]);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, sitzungenData, teilnehmerData] = await Promise.all([
        LivingAppsService.getBewertungen(),
        LivingAppsService.getSitzungen(),
        LivingAppsService.getTeilnehmer(),
      ]);
      setSitzungenList(sitzungenData);
      setTeilnehmerList(teilnehmerData);
      setRecord(mainData.find(r => r.record_id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(fields: Bewertungen['fields']) {
    if (!record) return;
    await LivingAppsService.updateBewertungenEntry(record.record_id, fields);
    await loadData();
    setEditing(false);
  }

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteBewertungenEntry(record.record_id);
    setDeleteOpen(false);
    navigate('/bewertungen');
  }

  function getSitzungenDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return sitzungenList.find(r => r.record_id === refId)?.fields.titel ?? '—';
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
          <Button variant="ghost" onClick={() => navigate('/bewertungen')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            Zurück
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/bewertungen')}
      onEdit={() => setEditing(true)}
      backLabel="Zurück"
      editLabel="Bearbeiten"
    >
      <RecordHeader title={'Bewertungen'} />

      {(() => {
        const lookupLists: Record<string, unknown> = {
          sitzung: sitzungenList,
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
        <RecordField label="Sitzung" value={getSitzungenDisplayName(record.fields.sitzung)} format="text" />
        <RecordField label="Teilnehmer" value={getTeilnehmerDisplayName(record.fields.teilnehmer)} format="text" />
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

      <RecordAttachments appId={APP_IDS.BEWERTUNGEN} recordId={record.record_id} />

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
          <IconTrash className="h-4 w-4 mr-1.5" />
          Löschen
        </Button>
      </div>

      <BewertungenDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
        defaultValues={record.fields}
        recordId={record.record_id}
        sitzungenList={sitzungenList}
        teilnehmerList={teilnehmerList}
        enablePhotoScan={AI_PHOTO_SCAN['Bewertungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bewertungen']}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Bewertungen löschen"
        description="Soll dieser Eintrag wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden."
      />
    </RecordView>
  );
}
