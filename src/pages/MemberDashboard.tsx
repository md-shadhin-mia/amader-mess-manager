import type { FormEvent } from 'react';
import { useAuth } from '../AuthContext';
import { auth } from '../firebase';
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import ProfileModal from '../components/ProfileModal';

export default function MemberDashboard() {
  const { userProfile } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [meals, setMeals] = useState<any[]>([]);
  const [mealCount, setMealCount] = useState(1);
  const [bazarAmount, setBazarAmount] = useState('');
  const [bazarItems, setBazarItems] = useState('');
  const [expenseType, setExpenseType] = useState('personal');
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    const mealsQuery = query(collection(db, 'daily_meals'));
    const unsub = onSnapshot(mealsQuery, (snapshot) => {
      const ms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      setMeals(ms.filter(m => m.user_id === userProfile.uid));
    });
    return unsub;
  }, [userProfile]);

  useEffect(() => {
    if (userProfile && (!userProfile.phone || !userProfile.name)) {
      setShowProfile(true);
    }
  }, [userProfile]);

  const addMeal = async () => {
    if (!userProfile) return;
    await addDoc(collection(db, 'daily_meals'), {
      date: new Date().toISOString().split('T')[0],
      user_id: userProfile.uid,
      meal_count: mealCount,
      timestamp: serverTimestamp()
    });
    setMealCount(1);
    alert(t('mealAdded'));
  };

  const addBazar = async (e: FormEvent) => {
    e.preventDefault();
    if (!userProfile || !bazarAmount || !bazarItems) return;
    await addDoc(collection(db, 'bazar_expenses'), {
      date: new Date().toISOString().split('T')[0],
      user_id: userProfile.uid,
      amount_spent: Number(bazarAmount),
      items_description: bazarItems,
      expense_type: expenseType,
      timestamp: serverTimestamp()
    });
    setBazarAmount('');
    setBazarItems('');
    alert(t('bazarAdded'));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('memberPanel')}</h1>
          <p className="text-sm text-gray-500">{t('welcome')}, {userProfile?.name} {userProfile?.phone && `(${userProfile.phone})`}</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowProfile(true)}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {t('editProfile')}
          </button>
          
          <div className="bg-gray-100 rounded-lg p-1 flex">
            <button 
              onClick={() => setLang('bn')} 
              className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'bn' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
            >
              বাংলা
            </button>
            <button 
              onClick={() => setLang('en')} 
              className={`px-3 py-1 text-sm font-medium rounded-md ${lang === 'en' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
            >
              EN
            </button>
          </div>

          <button 
            onClick={() => auth.signOut()}
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            {t('signOut')}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        
        {/* Daily Meal Entry */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('dailyMealEntry')}</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">{t('numberOfMeals')}</label>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setMealCount(Math.max(0, mealCount - 0.5))}
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-medium text-gray-600 hover:bg-gray-200"
                >-</button>
                <span className="text-xl font-semibold text-gray-900 w-12 text-center">{mealCount}</span>
                <button 
                  onClick={() => setMealCount(mealCount + 0.5)}
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-medium text-gray-600 hover:bg-gray-200"
                >+</button>
              </div>
            </div>
            <button 
              onClick={addMeal}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {t('saveMeal')}
            </button>
          </div>
        </section>

        {/* Bazar Entry */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('bazarEntry')}</h2>
          <form onSubmit={addBazar} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('amountTk')}</label>
                <input 
                  type="number"
                  value={bazarAmount}
                  onChange={(e) => setBazarAmount(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('type')}</label>
                <select 
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="personal">{t('personalMoney')}</option>
                  <option value="from_fund">{t('fromFund')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('itemsDesc')}</label>
              <textarea 
                value={bazarItems}
                onChange={(e) => setBazarItems(e.target.value)}
                placeholder="চাল, ডাল, তেল"
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                rows={3}
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full md:w-auto bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              {t('addExpense')}
            </button>
          </form>
        </section>

        {/* Ledger Summary */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('ledgerSummary')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('totalMealsLogged')}</p>
              <p className="text-2xl font-semibold text-gray-900">
                {meals.reduce((sum, m) => sum + m.meal_count, 0)}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('advanceBalance')}</p>
              <p className="text-2xl font-semibold text-gray-900">
                {userProfile?.advance_balance} ৳
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">{t('sonsthapon')}</p>
              <p className="text-2xl font-semibold text-gray-900">
                {userProfile?.sonsthapon} ৳
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
