import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Layout from './Layout';
import Dashboard from './Dashboard';
import Commands from './Commands';
import Timers from './Timers';
import Alerts from './Alerts';
import Events from './Events';
import Points from './Points';
import Moderation from './Moderation';
import Discord from './Discord';
import Clips from './Clips';
import Settings from './Settings';

// Loading spinner component
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0e0e10] flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin h-12 w-12 text-[#53fc18] mx-auto mb-4" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Public route (redirect to dashboard if logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Main app content with routes
function AppContent() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="commands" element={<Commands />} />
        <Route path="timers" element={<Timers />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="events" element={<Events />} />
        <Route path="points" element={<Points />} />
        <Route path="moderation" element={<Moderation />} />
        <Route path="discord" element={<Discord />} />
        <Route path="clips" element={<Clips />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
