import { useState } from 'react';
import type { Sitzungen, ErfahrungsraumFormate, Teilnehmer } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { IconPencil, IconFileText, IconChevronDown } from '@tabler/icons-react';
import { GeoMapPicker } from '@/components/GeoMapPicker';
import { MapRouteLinks } from '@/components/widgets/MapWidget';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

interface SitzungenViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Sitzungen | null;
  onEdit: (record: Sitzungen) => void;
  erfahrungsraumFormateList: ErfahrungsraumFormate[];
  teilnehmerList: Teilnehmer[];
}

export function SitzungenViewDialog({ open, onClose, record, onEdit, erfahrungsraumFormateList, teilnehmerList }: SitzungenViewDialogProps) {
  const [showCoords, setShowCoords] = useState(false);

  function getErfahrungsraumFormateDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return erfahrungsraumFormateList.find(r => r.record_id === id)?.fields.name ?? '—';
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
          <DialogTitle>Sitzungen anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Titel der Sitzung</Label>
            <p className="text-sm">{record.fields.titel ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Erfahrungsraum-Format</Label>
            <p className="text-sm">{getErfahrungsraumFormateDisplayName(record.fields.erfahrungsraum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Datum und Uhrzeit</Label>
            <p className="text-sm">{formatDate(record.fields.datum_uhrzeit)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Moderator – Nachname</Label>
            <p className="text-sm">{record.fields.moderator_nachname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Teilnehmer</Label>
            {Array.isArray(record.fields.teilnehmer) && record.fields.teilnehmer.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {record.fields.teilnehmer.map((url: any, i: number) => (
                  <span key={i} className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getTeilnehmerDisplayName(url)}</span>
                ))}
              </div>
            ) : <p className="text-sm">—</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Agenda</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.agenda ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nachbereitungsnotizen</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.nachbereitungsnotizen ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Dokumente / Protokoll</Label>
            {record.fields.dokumente ? (
              <MediaThumbnail src={record.fields.dokumente} fit="contain" className="w-full rounded-lg border" />
            ) : <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Ortsbezeichnung</Label>
            <p className="text-sm">{record.fields.ort_bezeichnung ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Straße</Label>
            <p className="text-sm">{record.fields.strasse ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hausnummer</Label>
            <p className="text-sm">{record.fields.hausnummer ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Postleitzahl</Label>
            <p className="text-sm">{record.fields.postleitzahl ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Stadt</Label>
            <p className="text-sm">{record.fields.stadt ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Standort auf der Karte</Label>
            {record.fields.standort?.info && (
              <p className="text-sm text-muted-foreground break-words whitespace-normal">{record.fields.standort.info}</p>
            )}
            {record.fields.standort?.lat != null && record.fields.standort?.long != null && (
              <GeoMapPicker
                lat={record.fields.standort.lat}
                lng={record.fields.standort.long}
                readOnly
              />
            )}
            {record.fields.standort?.lat != null && record.fields.standort?.long != null && (
              <MapRouteLinks lat={record.fields.standort.lat} long={record.fields.standort.long} className="mt-1" />
            )}
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 max-sm:py-2 transition-colors" onClick={() => setShowCoords(v => !v)}>
              {showCoords ? 'Koordinaten verbergen' : 'Koordinaten anzeigen'}
              <IconChevronDown className={`h-3 w-3 transition-transform ${showCoords ? "rotate-180" : ""}`} />
            </button>
            {showCoords && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-xs text-muted-foreground">Breitengrad:</span> {record.fields.standort?.lat?.toFixed(6) ?? '—'}</div>
                <div><span className="text-xs text-muted-foreground">Längengrad:</span> {record.fields.standort?.long?.toFixed(6) ?? '—'}</div>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Moderator – Vorname</Label>
            <p className="text-sm">{record.fields.moderator_vorname ?? '—'}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.SITZUNGEN} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}