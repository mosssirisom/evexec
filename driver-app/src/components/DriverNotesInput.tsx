'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FileText, Loader2, CheckCircle } from 'lucide-react';

interface DriverNotesInputProps {
  bookingId: string;
  initialNotes: string | null;
}

export default function DriverNotesInput({ bookingId, initialNotes }: DriverNotesInputProps) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [original, setOriginal] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (notes === original) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from('bookings')
      .update({ driver_notes: notes || null })
      .eq('id', bookingId);
    setOriginal(notes);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="mx-5 mb-4 bg-[#0B1525] border border-white/8 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={14} className="text-white/25" />
        <p className="text-[10px] text-white/30 uppercase tracking-widest">Driver Notes</p>
        {saved && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-green-400">
            <CheckCircle size={12} /> Saved
          </span>
        )}
      </div>
      <textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
        onBlur={save}
        placeholder="Private notes about this job…"
        rows={3}
        className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-[#d5a538]/40 transition-colors"
      />
      <button
        onClick={save}
        disabled={saving || notes === original}
        className="mt-2 text-xs text-[#d5a538] disabled:text-white/20 flex items-center gap-1.5 transition-colors"
      >
        {saving && <Loader2 size={11} className="animate-spin" />}
        {saving ? 'Saving…' : 'Save notes'}
      </button>
    </div>
  );
}
