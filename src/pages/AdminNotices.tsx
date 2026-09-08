import { useState, type FormEvent } from 'react';
import {
  addDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { useToast } from '../contexts/ToastContext';
import { useCollection, type Doc } from '../hooks/useCollection';
import { noticesCol, noticeRef } from '../lib/paths';
import type { Notice, NoticePriority } from '../lib/tenant';
import { broadcastNoticePush } from '../notifications';
import AdminLayout from '../components/admin/AdminLayout';
import { Plus, Pin, Trash2, Bell, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function AdminNotices() {
  const { mess, member } = useMess();
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<NoticePriority>('normal');
  const [isPinned, setIsPinned] = useState(false);
  const [sendPush, setSendPush] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Subscribe to notices in this mess
  const { docs: notices } = useCollection<Notice>(
    () => (mess ? noticesCol(db, mess.id) : null),
    `notices:${mess?.id ?? ''}`,
  );

  // Sort notices: pinned first, then newest first
  const sortedNotices = [...notices].sort((a, b) => {
    if (a.data.is_pinned && !b.data.is_pinned) return -1;
    if (!a.data.is_pinned && b.data.is_pinned) return 1;

    const getTime = (doc: Doc<Notice>) => {
      const ts = doc.data.created_at as Timestamp | undefined;
      return ts?.toMillis?.() ?? 0;
    };
    return getTime(b) - getTime(a);
  });

  const handleCreateNotice = async (e: FormEvent) => {
    e.preventDefault();
    if (!mess || !member || !title.trim() || !content.trim()) return;

    setSubmitting(true);
    try {
      const newDoc = await addDoc(noticesCol(db, mess.id), {
        title: title.trim(),
        content: content.trim(),
        priority,
        is_pinned: isPinned,
        created_by_uid: member.uid,
        created_by_name: member.name,
        created_at: serverTimestamp(),
      });

      if (sendPush) {
        // Broadcast push notification to mess members
        void broadcastNoticePush({
          messId: mess.id,
          id: newDoc.id,
          title: title.trim(),
          content: content.trim(),
          priority,
        }).then((res) => {
          if (!res.ok) console.warn('Push broadcast warning:', res.message);
        });
      }

      toast('নোটিশ সফলভাবে প্রকাশিত হয়েছে');
      setTitle('');
      setContent('');
      setPriority('normal');
      setIsPinned(false);
      setSendPush(true);
      setShowModal(false);
    } catch (err) {
      console.error('Failed to publish notice:', err);
      toast('নোটিশ প্রকাশ ব্যর্থ হয়েছে', { tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (notice: Doc<Notice>) => {
    if (!mess) return;
    try {
      await updateDoc(noticeRef(db, mess.id, notice.id), {
        is_pinned: !notice.data.is_pinned,
      });
      toast(notice.data.is_pinned ? 'আনপিন করা হয়েছে' : 'পিন করা হয়েছে');
    } catch (err) {
      console.error('Toggle pin failed', err);
      toast('পিন আপডেট ব্যর্থ হয়েছে', { tone: 'error' });
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    if (!mess) return;
    if (!confirm('আপনি কি নিশ্চিত যে এই নোটিশটি ডিলিট করতে চান?')) return;

    try {
      await deleteDoc(noticeRef(db, mess.id, noticeId));
      toast('নোটিশ ডিলিট করা হয়েছে');
    } catch (err) {
      console.error('Delete notice failed', err);
      toast('ডিলিট ব্যর্থ হয়েছে', { tone: 'error' });
    }
  };

  const priorityMeta = {
    urgent: {
      label: 'জরুরি (Urgent)',
      badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-900',
      cardBorder: 'border-l-4 border-l-red-500',
      icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    },
    important: {
      label: 'গুরুত্বপূর্ণ (Important)',
      badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900',
      cardBorder: 'border-l-4 border-l-amber-500',
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    },
    normal: {
      label: 'সাধারণ (Normal)',
      badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-900',
      cardBorder: 'border-l-4 border-l-blue-500',
      icon: <Info className="w-4 h-4 text-blue-500" />,
    },
  };

  const formatDate = (raw: unknown) => {
    const ts = raw as Timestamp | undefined;
    if (!ts?.toDate) return '';
    return new Intl.DateTimeFormat('bn-BD', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(ts.toDate());
  };

  return (
    <AdminLayout
      activeTab="notices"
      title="নোটিশ বোর্ড"
      subtitle="মেসের সদস্যদের জন্য নোটিশ প্রকাশ ও পরিচালনা করুন"
      action={
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          নতুন নোটিশ দিন
        </button>
      }
    >
      <div className="max-w-5xl space-y-4">
        {sortedNotices.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-300 dark:border-gray-800 p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mx-auto mb-3">
              <Bell className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              কোনো নোটিশ নেই
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-4">
              মেসের জরুরি খবর, বিল পরিশোধের তাগাদা বা সাধারণ তথ্য জানাতে নোটিশ প্রকাশ করুন।
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              প্রথম নোটিশ প্রকাশ করুন
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedNotices.map((n) => {
              const p = priorityMeta[n.data.priority || 'normal'] || priorityMeta.normal;
              return (
                <div
                  key={n.id}
                  className={`bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs transition-all ${p.cardBorder}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {n.data.is_pinned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            <Pin className="w-3 h-3 fill-current" />
                            পিন করা
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${p.badgeClass}`}
                        >
                          {p.icon}
                          {p.label}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100">
                          {n.data.title}
                        </h3>
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span>পোস্ট করেছেন: {n.data.created_by_name}</span>
                        <span>•</span>
                        <span>{formatDate(n.data.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTogglePin(n)}
                        title={n.data.is_pinned ? 'আনপিন করুন' : 'উপরে পিন করুন'}
                        className={`p-1.5 rounded-lg border text-xs transition-colors ${
                          n.data.is_pinned
                            ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteNotice(n.id)}
                        title="ডিলিট করুন"
                        className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    {n.data.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Notice Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                নতুন নোটিশ তৈরি করুন
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNotice} className="p-4 sm:p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  শিরোনাম *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="যেমন: চলতি মাসের বাসা ভাড়া ও গ্যাস বিল জমা"
                  required
                  className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  বিবরণ *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="নোটিশের বিস্তারিত লিখুন..."
                  required
                  rows={4}
                  className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    গুরুত্ব (Priority)
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as NoticePriority)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="normal">সাধারণ (Normal)</option>
                    <option value="important">গুরুত্বপূর্ণ (Important)</option>
                    <option value="urgent">জরুরি (Urgent)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end space-y-2 pt-2 sm:pt-0">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={(e) => setIsPinned(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 rounded-sm"
                    />
                    উপরে পিন করে রাখুন
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-blue-700 dark:text-blue-300">
                    <input
                      type="checkbox"
                      checked={sendPush}
                      onChange={(e) => setSendPush(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 rounded-sm"
                    />
                    ফোনে পুশ নোটিফিকেশন পাঠান
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submitting || !title.trim() || !content.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors shadow-xs"
                >
                  {submitting ? 'প্রকাশ হচ্ছে...' : 'নোটিশ প্রকাশ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
