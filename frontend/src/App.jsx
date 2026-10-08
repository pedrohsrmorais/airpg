import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage            from './pages/LoginPage';
import CharacterSelectPage  from './pages/CharacterSelectPage';
import DashboardPage        from './pages/DashboardPage';
import CharacterPage        from './pages/CharacterPage';
import WorldPage            from './pages/WorldPage';
import InventoryPage        from './pages/InventoryPage';
import MarketPage           from './pages/MarketPage';
import LoadingScreen        from './components/LoadingScreen';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <Navigate to="/characters" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"       element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/characters" element={<ProtectedRoute><CharacterSelectPage /></ProtectedRoute>} />
        <Route path="/dashboard"  element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/character/:id" element={<ProtectedRoute><CharacterPage /></ProtectedRoute>} />
        <Route path="/world/:worldId" element={<ProtectedRoute><WorldPage /></ProtectedRoute>} />
        <Route path="/inventory/:characterId" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
        <Route path="/market/:marketId" element={<ProtectedRoute><MarketPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/characters" replace />} />
      </Routes>
    </AuthProvider>
  );
}
