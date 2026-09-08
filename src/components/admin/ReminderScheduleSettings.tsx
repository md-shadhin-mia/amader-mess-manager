import { useState, type FormEvent } from 'react';
import { updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useMess } from '../../contexts/MessContext';
import { useToast } from '../../contexts/ToastContext';
import { messRef } from '../../lib/paths';
import {
  DEFAULT_LUNCH_REMINDER_TIME,
  DEFAULT_DINNER_REMINDER_TIME,
} from '../../lib/tenant';

export default function ReminderScheduleSettings() {
  const { mess } = useMess();
  const { toast } = useToast();

  const [lunchTime, setLunchTime] = useState(mess?.lunch_reminder_time || DEFAULT_LUNCH_REMINDER_TIME);
  const [lunchEnabled, setLunchEnabled] = useState(mess?.lunch_reminder_enabled !== false);

  const [dinnerTime, setDinnerTime] = useState(mess?.dinner_reminder_time || DEFAULT_DINNER_REMINDER_TIME);
  const [dinnerEnabled, setDinnerEnabled] = useState(mess?.dinner_reminder_enabled !== false);

  const [bazarTime, setBazarTime] = useState(mess?.bazar_reminder_time || '08:00');
  const [bazarEnabled, setBazarEnabled] = useState(mess?.bazar_reminder_enabled !== false);

  const [saving, setSaving] = useState(false);

  if (!mess) return null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(messRef(db, mess.id), {
        lunch_reminder_time: lunchTime,
        lunch_reminder_enabled: lunchEnabled,
        dinner_reminder_time: dinnerTime,
        dinner_reminder_enabled: dinnerEnabled,
        bazar_reminder_time: bazarTime,
        bazar_reminder_enabled: bazarEnabled,
        updated_at: serverTimestamp(),
      });
      toast('রিমাইন্ডার সময়সূচি সফলভাবে সংরক্ষিত হয়েছে');
    } catch (err) {
      console.error('Failed to update reminder settings', err);
      toast('সংরক্ষণ ব্যর্থ হয়েছে', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    lunchTime !== (mess.lunch_reminder_time || DEFAULT_LUNCH_REMINDER_TIME) ||
    lunchEnabled !== (mess.lunch_reminder_enabled !== false) ||
    dinnerTime !== (mess.dinner_reminder_time || DEFAULT_DINNER_REMINDER_TIME) ||
    dinnerEnabled !== (mess.dinner_reminder_enabled !== false) ||
    bazarTime !== (mess.bazar_reminder_time || '08:00') ||
    bazarEnabled !== (mess.bazar_reminder_enabled !== false);

  return (
    <section className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-800 transition-colors">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-5 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span>⏰</span>
            মেস নোটিফিকেশন ও রিমাইন্ডার সময়সূচি
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            প্রতিটি মেসের জন্য পৃথক সময় নির্ধারণ করুন। ক্লাউডফ্লেয়ার ক্রন নির্ধারিত সময়ে সদস্যদের ডিভাইসে পুশ নোটিফিকেশন পাঠাবে।
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Lunch Reminder */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                দুপুরের মিল রিমাইন্ডার (Lunch Reminder)
              </span>
              <span className="text-[10px] font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                ডিফল্ট 8:30 AM
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              যাদের আজকের দুপুরের মিল এন্ট্রি হয়নি তাদের মনে করিয়ে দিতে পুশ পাঠানো হবে।
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="time"
              value={lunchTime}
              onChange={(e) => setLunchTime(e.target.value)}
              disabled={!lunchEnabled}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-800 dark:text-gray-200 disabled:opacity-40"
            />
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={lunchEnabled}
                onChange={(e) => setLunchEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 rounded-sm"
              />
              চালু
            </label>
          </div>
        </div>

        {/* Dinner Reminder */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                রাতের মিল রিমাইন্ডার (Dinner Reminder)
              </span>
              <span className="text-[10px] font-medium bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                ডিফল্ট 2:45 PM
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              যাদের আজকের রাতের মিল এন্ট্রি হয়নি তাদের বিকেলে মনে করিয়ে দিতে পুশ পাঠানো হবে।
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="time"
              value={dinnerTime}
              onChange={(e) => setDinnerTime(e.target.value)}
              disabled={!dinnerEnabled}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-800 dark:text-gray-200 disabled:opacity-40"
            />
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={dinnerEnabled}
                onChange={(e) => setDinnerEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 rounded-sm"
              />
              চালু
            </label>
          </div>
        </div>

        {/* Bazar Reminder */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                বাজারের দায়িত্ব রিমাইন্ডার (Bazar Reminder)
              </span>
              <span className="text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                ডিফল্ট 8:00 AM
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              আজকের তারিখে যার বাজার করার শিডিউল আছে, তাকে সকালে নোটিফিকেশন পাঠাবে।
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="time"
              value={bazarTime}
              onChange={(e) => setBazarTime(e.target.value)}
              disabled={!bazarEnabled}
              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-800 dark:text-gray-200 disabled:opacity-40"
            />
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={bazarEnabled}
                onChange={(e) => setBazarEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 rounded-sm"
              />
              চালু
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl disabled:opacity-40 transition-colors shadow-xs"
          >
            {saving ? 'সংরক্ষণ হচ্ছে...' : 'রিমাইন্ডার শিডিউল সেভ করুন'}
          </button>
        </div>
      </form>
    </section>
  );
}
