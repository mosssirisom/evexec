'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Phone, Car, Hash, Loader2, CheckCircle, Pencil, X, AlertCircle } from 'lucide-react';
import type { Driver } from '@/lib/types';

interface ProfileEditorProps {
  driver: Driver;
}

export default function ProfileEditor({ driver }: ProfileEditorProps) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(driver.phone ?? '');
  const [vehicleModel, setVehicleModel] = useState(driver.vehicle_model ?? '');
  const [vehicleReg, setVehicleReg] = useState(driver.vehicle_registration ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fields = [
    { icon: <Phone size={15} />, label: 'Phone',        value: driver.phone },
    { icon: <Car size={15} />,   label: 'Vehicle',      value: driver.vehicle_model },
    { icon: <Hash size={15} />,  label: 'Registration', value: driver.vehicle_registration },
  ];

  async function handleSave() {
    setSaving(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase
      .from('drivers')
      .update({
        phone: phone || null,
        vehicle_model: vehicleModel || null,
        vehicle_registration: vehicleReg || null,
      })
      .eq('id', driver.id);

    setSaving(false);
    if (err) {
      setError('Failed to save. Please try again.');
      return;
    }
    driver.phone = phone || null;
    driver.vehicle_model = vehicleModel || null;
    driver.vehicle_registration = vehicleReg || null;

    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3500);
  }

  function handleCancel() {
    setPhone(driver.phone ?? '');
    setVehicleModel(driver.vehicle_model ?? '');
    setVehicleReg(driver.vehicle_registration ?? '');
    setEditing(false);
    setError('');
  }

  if (!editing) {
    return (
      <div className="mx-5 mb-4 bg-[#0B1525] border border-white/8 rounded-2xl px-5 py-1">
        <div className="flex items-center justify-between pt-3.5 pb-2">
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Details</p>
          <button
            onClick={() => { setSaved(false); setEditing(true); }}
            className="flex items-center gap-1.5 text-[11px] text-[#d5a538] hover:text-[#f1c56a] transition-colors"
          >
            <Pencil size={11} />
            Edit
          </button>
        </div>

        {fields.map(({ icon, label, value }) => (
          <div key={label} className="flex items-center gap-4 py-4 border-b border-white/5 last:border-0">
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/25 flex-shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">{label}</p>
              <p className="text-sm text-white font-medium truncate">{value ?? '—'}</p>
            </div>
          </div>
        ))}

        {saved && (
          <div className="flex items-center gap-2 pb-3 text-green-400 text-xs">
            <CheckCircle size={13} /> Profile updated
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-5 mb-4 bg-[#0B1525] border border-[#d5a538]/25 rounded-2xl px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-[#d5a538] uppercase tracking-widest">Edit Details</p>
        <button
          onClick={handleCancel}
          className="text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {[
        {
          label: 'Phone',
          value: phone,
          onChange: setPhone,
          placeholder: '+44 7700 900000',
          icon: <Phone size={13} />,
        },
        {
          label: 'Vehicle model',
          value: vehicleModel,
          onChange: setVehicleModel,
          placeholder: 'e.g. Tesla Model 3',
          icon: <Car size={13} />,
        },
        {
          label: 'Registration',
          value: vehicleReg,
          onChange: setVehicleReg,
          placeholder: 'e.g. AB21 XYZ',
          icon: <Hash size={13} />,
        },
      ].map(({ label, value, onChange, placeholder, icon }) => (
        <div key={label} className="mb-4">
          <label className="flex items-center gap-1.5 text-[10px] text-white/35 uppercase tracking-widest mb-2">
            <span className="text-white/20">{icon}</span>
            {label}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-white/5 border border-white/10 focus:border-[#d5a538]/40 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors"
          />
        </div>
      ))}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs mb-3">
          <AlertCircle size={13} />
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 rounded-xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
        style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}
