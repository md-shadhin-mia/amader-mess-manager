import { useState } from 'react';
import { db } from '../firebase';
import { useMess } from '../contexts/MessContext';
import { useCollection, type Doc } from '../hooks/useCollection';
import { noticesCol } from '../lib/paths';
import type { Notice } from '../lib/tenant';
import { Bell, Pin, AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

export default function NoticeBoardWidget() {
  const { mess } = useMess();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { docs: notices } = useCollection<Notice>(
    () => (mess ? noticesCol(db, mess.id) : null),
    `notices:${mess?.id ?? ''}`,
  );

  if (!mess || notices.length === 0) return null;

  // Sort: pinned first, then newest first
  const sorted = [...notices].sort((a, b) => {
    if (a.data.is_pinned && !b.data.is_pinned) return -1;
    if (!a.data.is_pinned && b.data.is_pinned) return 1;

    const getTime = (doc: Doc<Notice>) => {
      const ts = doc.data.created_at as Timestamp | undefined;
      return ts?.toMillis?.() ?? 0;
    };
    return getTime(b) - getTime(a);
  });

  const priorityMeta = {
    urgent: {
      label: 'জরুরি',
      badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300 border-red-200 dark:border-red-900',
      borderClass: 'border-l-4 border-l-red-500 bg-red-50/40 dark:bg-red-950/20',
      icon: <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />,
    },
    important: {
      label: 'গুরুত্বপূর্ণ',
      badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-900',
      borderClass: 'border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/20',
      icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
    },
    normal: {
      label: 'সাধারণ',
      badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-900',
      borderClass: 'border-l-4 border-l-blue-500',
      icon: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
    },
  };

  const formatDate = (raw: unknown) => {
    const ts = raw as Timestamp | undefined;
    if (!ts?.toDate) return '';
    return new Intl.DateTimeFormat('bn-BD', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(ts.toDate());
  };

  return (
    <section className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-700 transition-colors">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          মেস নোটিশ বোর্ড ({sorted.length})
        </h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ম্যানেজারের সাম্প্রতিক ঘোষণা
        </span>
      </div>

      <div className="space-y-3">
        {sorted.map((notice) => {
          const p = priorityMeta[notice.data.priority || 'normal'] || priorityMeta.normal;
          const isExpanded = expandedId === notice.id;
          const isLong = notice.data.content.length > 150;

          return (
            <div
              key={notice.id}
              className={`p-4 rounded-xl border border-gray-200 dark:border-gray-700/80 transition-all ${p.borderClass}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {notice.data.is_pinned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      <Pin className="w-3 h-3 fill-current" />
                      পিন করা
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${p.badgeClass}`}
                  >
                    {p.icon}
                    {p.label}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {notice.data.title}
                  </h3>
                </div>

                <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span>{notice.data.created_by_name}</span>
                  <span>•</span>
                  <span>{formatDate(notice.data.created_at)}</span>
                </div>
              </div>

              <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mt-1">
                {isLong && !isExpanded
                  ? `${notice.data.content.slice(0, 150)}...`
                  : notice.data.content}
              </div>

              {isLong && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : notice.id)}
                  className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {isExpanded ? (
                    <>
                      কম দেখুন <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      সম্পূর্ণ নোটিশ পড়ুন <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
