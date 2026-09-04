import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { auth, db } from '../firebase';
import { useState, useEffect } from 'react';
import { collection, query, getDoc, getDocs, doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import ProfileModal from '../components/ProfileModal';
import NotificationSettings from '../components/NotificationSettings';

// Shared monthly costs split among everyone. Room rent is NOT here: each member has their own.
const SHARED_COST_KEYS = ['buya', 'net', 'gas', 'water', 'garbage', 'guard'] as const;
type SharedCostKey = typeof SHARED_COST_KEYS[number];
type SharedCosts = Record<SharedCostKey, number>;
const EMPTY_SHARED_COSTS: SharedCosts = { buya: 0, net: 0, gas: 0, water: 0, garbage: 0, guard: 0 };

// Older months stored a single shared "rent"; ignore it and only keep the known shared keys.
function toSharedCosts(raw: unknown): SharedCosts {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result = { ...EMPTY_SHARED_COSTS };
  for (const key of SHARED_COST_KEYS) {
    const value = Number(source[key]);
    result[key] = Number.isFinite(value) ? value : 0;
  }
  return result;
}

function memberRent(member: { room_rent?: unknown }): number {
  const value = Number(member.room_rent);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [primaryAdminUid, setPrimaryAdminUid] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [costs, setCosts] = useState<SharedCosts>(EMPTY_SHARED_COSTS);
  // Unsaved per-member rent edits, keyed by uid. Only present while a value differs from Firestore.
  const [rentDrafts, setRentDrafts] = useState<Record<string, string>>({});
  const [savingRentFor, setSavingRentFor] = useState<string | null>(null);

  useEffect(() => {
    const usersUnsub = onSnapshot(query(collection(db, 'users')), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
    });

    void getDoc(doc(db, 'settings', 'app')).then((snapshot) => {
      setPrimaryAdminUid(snapshot.data()?.firstAdminUid ?? null);
    });

    const monthsUnsub = onSnapshot(query(collection(db, 'months')), (snap) => {
      const active = snap.docs.find(d => d.data().status === 'active');
      if (active) {
        setActiveMonth({ id: active.id, ...active.data() });
        if (active.data().fixed_costs) {
          setCosts(toSharedCosts(active.data().fixed_costs));
        }
      } else {
        setActiveMonth(null);
      }
    });

    return () => {
      usersUnsub();
      monthsUnsub();
    };
  }, []);

  const makeAdmin = async (member: any) => {
    if (member.role === 'manager') return;
    if (!confirm(`${member.name} কে অ্যাডমিন বানাতে চান?`)) return;

    try {
      await updateDoc(doc(db, 'users', member.id), { role: 'manager' });
      alert(t('adminMade'));
    } catch (err) {
      console.error('Could not update the member role:', err);
      alert('Failed to make this user an admin.');
    }
  };

  const removeAdmin = async (member: any) => {
    if (member.id === primaryAdminUid) {
      alert(t('primaryAdminProtected'));
      return;
    }
    if (users.filter((user) => user.role === 'manager').length <= 1) {
      alert(t('lastAdminProtected'));
      return;
    }
    if (!confirm(`${member.name} কে সাধারণ সদস্য করতে চান?`)) return;

    try {
      await updateDoc(doc(db, 'users', member.id), { role: 'member' });
      alert(t('adminRemoved'));
    } catch (err) {
      console.error('Could not remove the admin role:', err);
      alert('Failed to remove this admin.');
    }
  };

  const totalRoomRent = users.reduce((sum, member) => sum + memberRent(member), 0);

  const rentInputValue = (member: any) =>
    rentDrafts[member.id] ?? String(memberRent(member));

  const hasRentChange = (member: any) =>
    member.id in rentDrafts && Number(rentDrafts[member.id]) !== memberRent(member);

  const saveRent = async (member: any) => {
    const value = Number(rentDrafts[member.id]);
    if (!Number.isFinite(value) || value < 0) {
      alert(t('invalidRent'));
      return;
    }
    setSavingRentFor(member.id);
    try {
      await updateDoc(doc(db, 'users', member.id), { room_rent: value });
      setRentDrafts((drafts) => {
        const next = { ...drafts };
        delete next[member.id];
        return next;
      });
      alert(t('rentUpdated'));
    } catch (err) {
      console.error('Could not update the room rent:', err);
      alert(t('rentUpdateFailed'));
    } finally {
      setSavingRentFor(null);
    }
  };

  const handleUpdateCosts = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeMonth) {
      alert(t('noActiveMonth'));
      return;
    }
    await updateDoc(doc(db, 'months', activeMonth.id), {
      fixed_costs: costs
    });
    alert('Costs updated successfully');
  };

  const startNewMonth = async () => {
    const monthId = new Date().toISOString().substring(0, 7);
    await setDoc(doc(db, 'months', monthId), {
      month_id: monthId,
      status: 'active',
      fixed_costs: costs,
      total_meals: 0,
      total_bazar: 0,
      meal_rate: 0,
      timestamp: serverTimestamp()
    });
  };

  const closeMonth = async () => {
    if (!activeMonth) return;
    
    if (confirm("Are you sure you want to close this month? This will lock entries and calculate dues.")) {
      try {
        const mealsSnap = await getDocs(query(collection(db, 'daily_meals')));
        let totalMeals = 0;
        
        mealsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.date.startsWith(activeMonth.month_id)) {
            totalMeals += data.meal_count;
          }
        });

        const bazarSnap = await getDocs(query(collection(db, 'bazar_expenses')));
        let totalBazar = 0;
        bazarSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.date.startsWith(activeMonth.month_id)) {
            totalBazar += data.amount_spent;
          }
        });

        const mealRate = totalMeals > 0 ? totalBazar / totalMeals : 0;
        
        const sharedCostsTotal = SHARED_COST_KEYS.reduce((acc, key) => acc + Number(costs[key] ?? 0), 0);

        // Snapshot each member's rent so later rent changes do not rewrite closed months.
        const memberRents: Record<string, number> = {};
        users.forEach((member) => {
          memberRents[member.id] = memberRent(member);
        });
        const roomRentTotal = Object.values(memberRents).reduce((acc: number, curr: number) => acc + curr, 0);

        await updateDoc(doc(db, 'months', activeMonth.id), {
          status: 'closed',
          total_meals: totalMeals,
          total_bazar: totalBazar,
          meal_rate: mealRate,
          member_rents: memberRents,
          total_room_rent: roomRentTotal,
          fixed_costs_total: sharedCostsTotal + roomRentTotal
        });

        alert(`Month closed successfully! Meal Rate: ${mealRate.toFixed(2)} TK`);
      } catch (err) {
        console.error("Error closing month:", err);
        alert("Failed to close month.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      
      <header className="bg-blue-900 border-b border-blue-950 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10 text-white">
        <div>
          <h1 className="text-xl font-semibold">{t('adminPanel')}</h1>
          <p className="text-blue-200 text-sm">{t('manager')}: {userProfile?.name} {userProfile?.phone && `(${userProfile.phone})`}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/member/entry')}
            className="text-sm font-medium bg-blue-800 px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            {t('myMealEntry')}
          </button>

          <button 
            onClick={() => setShowProfile(true)}
            className="text-sm font-medium text-blue-200 hover:text-white"
          >
            {t('editProfile')}
          </button>
          
          <div className="bg-blue-950 rounded-lg p-1 flex">
            <button 
              onClick={() => setLang('bn')} 
              className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'bn' ? 'bg-blue-800 text-white' : 'text-blue-300'}`}
            >
              বাংলা
            </button>
            <button 
              onClick={() => setLang('en')} 
              className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'en' ? 'bg-blue-800 text-white' : 'text-blue-300'}`}
            >
              EN
            </button>
          </div>

          <button 
            onClick={() => auth.signOut()}
            className="text-sm font-medium bg-blue-800 px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            {t('signOut')}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        
        {/* Month Management */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-1">{t('currentMonthStatus')}</h2>
            <p className="text-gray-500 text-sm">
              {activeMonth ? `${t('active')}: ${activeMonth.month_id}` : t('noActiveMonth')}
            </p>
          </div>
          <div className="flex gap-4">
            {!activeMonth ? (
              <button onClick={startNewMonth} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 whitespace-nowrap">
                {t('startNewMonth')}
              </button>
            ) : (
              <button onClick={closeMonth} className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 whitespace-nowrap">
                {t('closeMonth')}
              </button>
            )}
          </div>
        </section>

        {/* Fixed Costs Settings */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-1">{t('fixedCosts')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('fixedCostsHint')}</p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">{t('totalRoomRent')}</span>
            <span className="text-lg font-semibold text-blue-900">{totalRoomRent} ৳</span>
          </div>
          <form onSubmit={handleUpdateCosts} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {SHARED_COST_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-sm text-gray-600 mb-1 capitalize">{key}</label>
                <input 
                  type="number"
                  min={0}
                  value={costs[key]}
                  onChange={(e) => setCosts({...costs, [key]: Number(e.target.value)})}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            ))}
            <div className="col-span-2 md:col-span-4 flex justify-end mt-2">
              <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors">
                {t('updateCosts')}
              </button>
            </div>
          </form>
        </section>

        <NotificationSettings />

        {/* Member Directory */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-medium text-gray-900">{t('memberDirectory')}</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('rentColumnHint')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                  <th className="p-4 font-medium">{t('name')}</th>
                  <th className="p-4 font-medium">{t('phone')}</th>
                  <th className="p-4 font-medium">{t('email')}</th>
                  <th className="p-4 font-medium">{t('role')}</th>
                  <th className="p-4 font-medium">{t('roomRent')}</th>
                  <th className="p-4 font-medium">{t('advance')}</th>
                  <th className="p-4 font-medium">{t('sonsthapon')}</th>
                  <th className="p-4 font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="p-4 text-gray-900 font-medium">{u.name}</td>
                    <td className="p-4 text-gray-500">{u.phone || '-'}</td>
                    <td className="p-4 text-gray-500 text-sm">{u.email}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${u.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {u.role === 'manager' ? t('manager') : t('member')}
                      </span>
                    </td>
                    <td className="p-4">
                      <form
                        onSubmit={(e) => { e.preventDefault(); void saveRent(u); }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`${t('roomRent')}: ${u.name}`}
                          value={rentInputValue(u)}
                          onChange={(e) => setRentDrafts({ ...rentDrafts, [u.id]: e.target.value })}
                          className="w-28 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <span className="text-gray-500 text-sm">৳</span>
                        {hasRentChange(u) && (
                          <button
                            type="submit"
                            disabled={savingRentFor === u.id}
                            className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {savingRentFor === u.id ? t('loading') : t('saveRent')}
                          </button>
                        )}
                      </form>
                    </td>
                    <td className="p-4 text-gray-700 font-medium">{u.advance_balance} ৳</td>
                    <td className="p-4 text-gray-700 font-medium">{u.sonsthapon} ৳</td>
                    <td className="p-4">
                      {u.role !== 'manager' ? (
                        <button onClick={() => makeAdmin(u)} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                          {t('makeAdmin')}
                        </button>
                      ) : u.id !== primaryAdminUid ? (
                        <button onClick={() => removeAdmin(u)} className="text-sm font-medium text-red-600 hover:text-red-800">
                          {t('removeAdmin')}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">{t('primaryAdmin')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}
