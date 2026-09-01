import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import MemberDashboard from './pages/MemberDashboard';

function PrivateRoute({ children, allowedRole }: { children: ReactNode, allowedRole?: 'manager' | 'member' }) {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) return <div className="h-screen w-full flex items-center justify-center">Loading...</div>;

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (allowedRole && userProfile?.role !== allowedRole) {
    return <Navigate to="/" />;
  }

  return children;
}

function RoleBasedRedirect() {
  const { userProfile, loading } = useAuth();
  
  if (loading) return <div className="h-screen w-full flex items-center justify-center">Loading...</div>;

  if (userProfile?.role === 'manager') {
    return <Navigate to="/admin" />;
  } else if (userProfile?.role === 'member') {
    return <Navigate to="/member" />;
  }
  
  return <Navigate to="/login" />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/*" element={
              <PrivateRoute allowedRole="manager">
                <AdminDashboard />
              </PrivateRoute>
            } />
            <Route path="/member/*" element={
              <PrivateRoute allowedRole="member">
                <MemberDashboard />
              </PrivateRoute>
            } />
            <Route path="/" element={<RoleBasedRedirect />} />
          </Routes>
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
}
