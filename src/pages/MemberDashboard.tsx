import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import ProfileModal from '../components/ProfileModal';

export default function MemberDashboard() {
  const { userProfile } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const [meals, setMeals] = useState<any[]>([]);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    const mealsQuery = query(collection(db, 'daily_meals'));
    return onSnapshot(mealsQuery, (snapshot) => {
      const entries = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() as any }));
      setMeals(entries.filter((meal) => meal.user_id === userProfile.uid));
    });
  }, [userProfile]);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('memberPanel')}</h1>
          <p className="text-sm text-gray-500">{t('welcome')}, {userProfile?.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/member/entry')} className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            {t('openEntry')}
          </button>
          <button onClick={() => setShowProfile(true)} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            {t('editProfile')}
          </button>
          <div className="bg-gray-100 rounded-lg p-1 flex">
            <button onClick={() => setLang('bn')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'bn' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>বাংলা</button>
            <button onClick={() => setLang('en')} className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'en' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>EN</button>
          </div>
          <button onClick={() => auth.signOut()} className="text-sm font-medium text-red-600 hover:text-red-700">{t('signOut')}</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <section className="bg-blue-600 text-white p-6 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t('mealEntryPage')}</h2>
            <p className="text-blue-100 text-sm">{t('entryDescription')}</p>
          </div>
          <button onClick={() => navigate('/member/entry')} className="bg-white text-blue-700 px-5 py-2 rounded-lg font-medium hover:bg-blue-50">
            {t('openEntry')}
          </button>
        </section>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('ledgerSummary')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('myRoomRent')}</p>
              <p className="text-2xl font-semibold text-gray-900">
                {typeof userProfile?.room_rent === 'number' ? `${userProfile.room_rent} ৳` : t('notSet')}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('totalMealsLogged')}</p>
              <p className="text-2xl font-semibold text-gray-900">{meals.reduce((sum, meal) => sum + meal.meal_count, 0)}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('advanceBalance')}</p>
              <p className="text-2xl font-semibold text-gray-900">{userProfile?.advance_balance} ৳</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('sonsthapon')}</p>
              <p className="text-2xl font-semibold text-gray-900">{userProfile?.sonsthapon} ৳</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
