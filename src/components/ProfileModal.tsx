import { useState, type FormEvent } from 'react';
import { updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { useMess } from '../contexts/MessContext';
import { db } from '../firebase';
import { memberRef, userRef } from '../lib/paths';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';

interface ProfileModalProps {
  onClose: () => void;
}

/** Edits the global account name/phone and mirrors them into the current mess profile. */
export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { account, currentUser } = useAuth();
  const { messId, member } = useMess();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [name, setName] = useState(member?.name || account?.name || '');
  const [phone, setPhone] = useState(member?.phone || account?.phone || '');
  const [saving, setSaving] = useState(false);

  if (!currentUser) return null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.update(userRef(db, currentUser.uid), { name, phone });
      if (messId && member) batch.update(memberRef(db, messId, currentUser.uid), { name, phone });
      await batch.commit();
      toast(t('profileUpdated'));
      onClose();
    } catch (err) {
      console.error(err);
      // Fall back to just the account if the member write was rejected (e.g. suspended mess).
      try {
        await updateDoc(userRef(db, currentUser.uid), { name, phone });
        toast(t('profileUpdated'));
        onClose();
      } catch (inner) {
        console.error(inner);
        toast(t('saveFailed'), { tone: 'error' });
      }
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">{t('profileUpdate')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">{t('close')}</button>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')} ({t('optional')})</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? t('loading') : t('saveProfile')}
          </button>
        </form>
      </div>
    </div>
  );
}
