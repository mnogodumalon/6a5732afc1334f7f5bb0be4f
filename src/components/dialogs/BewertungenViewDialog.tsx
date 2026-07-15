import type { Bewertungen, Sitzungen, Teilnehmer } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Badge } from '@/components/ui/badge';
import { IconPencil } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

interface BewertungenViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Bewertungen | null;
  onEdit: (record: Bewertungen) => void;
  sitzungenList: Sitzungen[];
  teilnehmerList: Teilnehmer[];
}

export function BewertungenViewDialog({ open, onClose, record, onEdit, sitzungenList, teilnehmerList }: BewertungenViewDialogProps) {
  function getSitzungenDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return sitzungenList.find(r => r.record_id === id)?.fields.titel ?? '—';
  }

  function getTeilnehmerDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return teilnehmerList.find(r => r.record_id === id)?.fields.vorname ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bewertungen anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sitzung</Label>
            <p className="text-sm">{getSitzungenDisplayName(record.fields.sitzung)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Teilnehmer</Label>
            <p className="text-sm">{getTeilnehmerDisplayName(record.fields.teilnehmer)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Datum der Bewertung</Label>
            <p className="text-sm">{formatDate(record.fields.bewertungsdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Gesamteindruck</Label>
            <Badge variant="secondary">{record.fields.gesamteindruck?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Relevanz für meine Situation</Label>
            <Badge variant="secondary">{record.fields.relevanz?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Umsetzbarkeit der Erkenntnisse</Label>
            <Badge variant="secondary">{record.fields.umsetzbarkeit?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Qualität der eingesetzten Methoden</Label>
            <Badge variant="secondary">{record.fields.methodenqualitaet?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Meine wichtigste Erkenntnis</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.wichtigste_erkenntnis ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Meine nächsten Schritte</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.naechste_schritte ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Verbesserungsvorschläge</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.verbesserungsvorschlaege ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Ich würde diesen Erfahrungsraum weiterempfehlen.</Label>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              record.fields.weiterempfehlung ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {record.fields.weiterempfehlung ? 'Ja' : 'Nein'}
            </span>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.BEWERTUNGEN} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}