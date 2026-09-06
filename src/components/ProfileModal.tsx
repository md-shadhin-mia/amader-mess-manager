import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { updateDoc, writeBatch } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useMess } from '../contexts/MessContext';
import { db } from '../firebase';
import { memberRef, userRef } from '../lib/paths';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { convertImageTo128x128 } from '../lib/image';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';

interface ProfileModalProps {
  onClose: () => void;
}

/** Edits the global account name/phone/avatar and mirrors them into the current mess profile. */
export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { account, currentUser } = useAuth();
  const { messId, member } = useMess();
  const { t } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialPhoto = member?.photo_url || account?.photo_url || currentUser?.photoURL || '';
  const [name, setName] = useState(member?.name || account?.name || '');
  const [phone, setPhone] = useState(member?.phone || account?.phone || '');
  const [photoUrl, setPhotoUrl] = useState<string>(initialPhoto);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!currentUser) return null;

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast(t('invalidImage'), { tone: 'error' });
      return;
    }

    setConverting(true);
    try {
      // Automatically center-crop and resize every avatar to 128x128 before upload
      const { dataUrl } = await convertImageTo128x128(file, 128);
      setPhotoUrl(dataUrl);
    } catch (err) {
      console.error('Image conversion error:', err);
      toast(t('invalidImage'), { tone: 'error' });
    } finally {
      setConverting(false);
      // Reset input value so the same file can be picked again if desired
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (converting) return;
    setSaving(true);

    const updatePayload = {
      name,
      phone,
      photo_url: photoUrl,
    };

    try {
      const batch = writeBatch(db);
      batch.update(userRef(db, currentUser.uid), updatePayload);
      if (messId && member) {
        batch.update(memberRef(db, messId, currentUser.uid), updatePayload);
      }
      await batch.commit();

      // Attempt to sync to Firebase Auth user profile silently
      try {
        if (currentUser) {
          const authPayload: { displayName: string; photoURL?: string } = { displayName: name };
          if (photoUrl && photoUrl.length < 2048) {
            authPayload.photoURL = photoUrl;
          } else if (!photoUrl) {
            authPayload.photoURL = '';
          }
          await updateProfile(currentUser, authPayload);
        }
      } catch (authErr) {
        console.warn('Silent auth profile update notice:', authErr);
      }

      toast(t('profileUpdated'));
      onClose();
    } catch (err) {
      console.error(err);
      // Fall back to just the account if the member write was rejected (e.g. suspended mess).
      try {
        await updateDoc(userRef(db, currentUser.uid), updatePayload);
        toast(t('profileUpdated'));
        onClose();
      } catch (inner) {
        console.error(inner);
        toast(t('saveFailed'), { tone: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-700 transition-colors">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/80">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('profileUpdate')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">✕</button>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {/* Avatar Upload Section */}
          <div className="flex flex-col items-center justify-center pb-2">
            <div className="relative group">
              <Avatar
                name={name || account?.name}
                photoUrl={photoUrl}
                size="xl"
                className="ring-4 ring-blue-100 dark:ring-blue-900/40 shadow-md transition-all"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={converting || saving}
                title={t('uploadAvatar')}
                className="absolute bottom-0 right-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              >
                {converting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label={t('uploadAvatar')}
              />
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={converting || saving}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {photoUrl ? t('changeAvatar') : t('uploadAvatar')}
              </button>
              {photoUrl && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={converting || saving}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('removeAvatar')}
                  </button>
                </>
              )}
            </div>

            {converting && (
              <p className="text-xs text-blue-500 mt-1 animate-pulse">{t('convertingAvatar')}</p>
            )}
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              128×128 px
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('phone')} ({t('optional')})</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('theme')}</label>
            <ThemeToggle variant="segmented" className="w-full justify-between" />
          </div>
          <button
            type="submit"
            disabled={saving || converting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? t('loading') : t('saveProfile')}
          </button>
        </form>
      </div>
    </div>
  );
}
