import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function MealEntry() {
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [mealCount, setMealCount] = useState(1);
  const [bazarAmount, setBazarAmount] = useState('');
  const [bazarItems, setBazarItems] = useState('');
  const [expenseType, setExpenseType] = useState('personal');

  const addMeal = async () => {
    if (!userProfile) return;
    await addDoc(collection(db, 'daily_meals'), {
      date: new Date().toISOString().split('T')[0],
      user_id: userProfile.uid,
      meal_count: mealCount,
      timestamp: serverTimestamp(),
    });
    setMealCount(1);
    alert(t('mealAdded'));
  };

  const addBazar = async (event: FormEvent) => {
    event.preventDefault();
    if (!userProfile || !bazarAmount || !bazarItems) return;
    await addDoc(collection(db, 'bazar_expenses'), {
      date: new Date().toISOString().split('T')[0],
      user_id: userProfile.uid,
      amount_spent: Number(bazarAmount),
      items_description: bazarItems,
      expense_type: expenseType,
      timestamp: serverTimestamp(),
    });
    setBazarAmount('');
    setBazarItems('');
    alert(t('bazarAdded'));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('mealEntryPage')}</h1>
          <p className="text-sm text-gray-500">{userProfile?.name}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/member')} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            {t('backDashboard')}
          </button>
          <button onClick={() => auth.signOut()} className="text-sm font-medium text-red-600 hover:text-red-700">
            {t('signOut')}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('dailyMealEntry')}</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">{t('numberOfMeals')}</label>
              <div className="flex items-center gap-4">
                <button onClick={() => setMealCount(Math.max(0, mealCount - 0.5))} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-medium text-gray-600 hover:bg-gray-200">-</button>
                <span className="text-xl font-semibold text-gray-900 w-12 text-center">{mealCount}</span>
                <button onClick={() => setMealCount(mealCount + 0.5)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-medium text-gray-600 hover:bg-gray-200">+</button>
              </div>
            </div>
            <button onClick={addMeal} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              {t('saveMeal')}
            </button>
          </div>
        </section>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{t('bazarEntry')}</h2>
          <form onSubmit={addBazar} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('amountTk')}</label>
                <input type="number" value={bazarAmount} onChange={(event) => setBazarAmount(event.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" required />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('type')}</label>
                <select value={expenseType} onChange={(event) => setExpenseType(event.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="personal">{t('personalMoney')}</option>
                  <option value="from_fund">{t('fromFund')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t('itemsDesc')}</label>
              <textarea value={bazarItems} onChange={(event) => setBazarItems(event.target.value)} placeholder="চাল, ডাল, তেল" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" rows={3} required />
            </div>
            <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors">
              {t('addExpense')}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
