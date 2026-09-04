import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import { MessProvider, useMess } from './contexts/MessContext';
import Login from './pages/Login';
import Messes from './pages/Messes';
import SuperAdmin from './pages/SuperAdmin';
import AdminDashboard from './pages/AdminDashboard';
import MemberDashboard from './pages/MemberDashboard';
import MealEntry from './pages/MealEntry';
import MonthsList from './pages/MonthsList';
import MonthReport from './pages/MonthReport';
import MemberMonth from './pages/MemberMonth';

function Spinner() {
  return <div className="h-screen w-full flex items-center justify-center">Loading...</div>;
}

function ProfileLoadError({ message }: { message: string }) {
  return <div className="h-screen w-full flex items-center justify-center p-4 text-center text-red-600">{message}</div>;
}

interface PrivateRouteProps {
  children: ReactNode;
  /** Role inside the current mess. Managers may also open member routes. */
  allowedRole?: 'manager' | 'member';
  /** Pages like /messes work without a selected mess. */
  requireMess?: boolean;
  superOnly?: boolean;
}

function PrivateRoute({ children, allowedRole, requireMess = true, superOnly = false }: PrivateRouteProps) {
  const { currentUser, isSuperAdmin, loading: authLoading, error } = useAuth();
  const { messId, role, blocked, loading: messLoading } = useMess();

  if (authLoading) return <Spinner />;
  if (error) return <ProfileLoadError message={error} />;
  if (!currentUser) return <Navigate to="/login" />;
  if (superOnly) return isSuperAdmin ? children : <Navigate to="/" />;
  if (!requireMess) return children;

  if (messLoading) return <Spinner />;
  if (!messId || blocked) return <Navigate to="/messes" />;

  const hasAllowedRole = !allowedRole || role === allowedRole || (allowedRole === 'member' && role === 'manager');
  if (!hasAllowedRole) return <Navigate to="/" />;
  return children;
}

function RoleBasedRedirect() {
  const { currentUser, loading: authLoading, error } = useAuth();
  const { messId, role, blocked, loading: messLoading } = useMess();

  if (authLoading || (currentUser && messLoading)) return <Spinner />;
  if (error) return <ProfileLoadError message={error} />;
  if (!currentUser) return <Navigate to="/login" />;
  if (!messId || blocked || !role) return <Navigate to="/messes" />;
  return <Navigate to={role === 'manager' ? '/admin' : '/member'} />;
}

function AppRoutes() {
  const { messId } = useMess();
  // Remount the whole tree when the mess changes so no tenant data can linger on screen.
  return (
    <Routes key={messId ?? 'none'}>
      <Route path="/login" element={<Login />} />
      <Route path="/messes" element={<PrivateRoute requireMess={false}><Messes /></PrivateRoute>} />
      <Route path="/super" element={<PrivateRoute requireMess={false} superOnly><SuperAdmin /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute allowedRole="manager"><AdminDashboard /></PrivateRoute>} />
      <Route path="/admin/months" element={<PrivateRoute allowedRole="manager"><MonthsList /></PrivateRoute>} />
      <Route path="/admin/months/:monthId" element={<PrivateRoute allowedRole="manager"><MonthReport /></PrivateRoute>} />
      <Route path="/member" element={<PrivateRoute allowedRole="member"><MemberDashboard /></PrivateRoute>} />
      <Route path="/member/entry" element={<PrivateRoute allowedRole="member"><MealEntry /></PrivateRoute>} />
      <Route path="/member/months" element={<PrivateRoute allowedRole="member"><MemberMonth /></PrivateRoute>} />
      <Route path="/member/months/:monthId" element={<PrivateRoute allowedRole="member"><MemberMonth /></PrivateRoute>} />
      <Route path="/" element={<RoleBasedRedirect />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <MessProvider>
            <Router>
              <AppRoutes />
            </Router>
          </MessProvider>
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
