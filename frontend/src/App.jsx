import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';

// Layout
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import CabsPage from './pages/CabsPage';
import RoutesPage from './pages/RoutesPage';
import RequestsPage from './pages/RequestsPage';
import LiveTrackingPage from './pages/LiveTrackingPage';
import DriverDashboardPage from './pages/DriverDashboardPage';
import EmployeeDashboardPage from './pages/EmployeeDashboardPage';
import EmployeeTrackingPage from './pages/EmployeeTrackingPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';
import SecurityGatePage from './pages/SecurityGatePage';

// Loading component
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

function App() {
  const { loading, isAuthenticated, user } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  // Determine default route based on user role
  const getDefaultRoute = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'HR_ADMIN':
      case 'ADMIN':
        return '/dashboard';
      case 'CAB_DRIVER':
      case 'DRIVER':
        return '/driver';
      case 'EMPLOYEE':
      case 'USER':
        return '/employee';
      case 'SECURITY':
        return '/security/gate';
      default:
        return '/dashboard';
    }
  };

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            style: {
              background: '#059669',
            },
          },
          error: {
            style: {
              background: '#dc2626',
            },
          },
        }}
      />
      
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to={getDefaultRoute()} replace /> : <LoginPage />} 
        />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            {/* Admin Routes */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute allowedRoles={['HR_ADMIN', 'ADMIN']}>
                  <DashboardPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/users" 
              element={
                <ProtectedRoute allowedRoles={['HR_ADMIN', 'ADMIN']}>
                  <UsersPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/cabs" 
              element={
                <ProtectedRoute allowedRoles={['HR_ADMIN', 'ADMIN']}>
                  <CabsPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/routes" 
              element={
                <ProtectedRoute allowedRoles={['HR_ADMIN', 'ADMIN']}>
                  <RoutesPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/requests" 
              element={
                <ProtectedRoute allowedRoles={['HR_ADMIN', 'ADMIN', 'EMPLOYEE', 'USER']}>
                  <RequestsPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tracking" 
              element={
                <ProtectedRoute allowedRoles={['HR_ADMIN', 'ADMIN']}>
                  <LiveTrackingPage />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/security/gate"
              element={
                <ProtectedRoute allowedRoles={['SECURITY', 'HR_ADMIN', 'ADMIN']}>
                  <SecurityGatePage />
                </ProtectedRoute>
              }
            />

            {/* Driver Routes */}
            <Route 
              path="/driver" 
              element={
                <ProtectedRoute allowedRoles={['CAB_DRIVER', 'DRIVER']}>
                  <DriverDashboardPage />
                </ProtectedRoute>
              } 
            />

            {/* Employee Routes */}
            <Route 
              path="/employee" 
              element={
                <ProtectedRoute allowedRoles={['EMPLOYEE', 'USER']}>
                  <EmployeeDashboardPage />
                </ProtectedRoute>
              } 
            />
            <Route
              path="/employee/tracking"
              element={
                <ProtectedRoute allowedRoles={['EMPLOYEE', 'USER']}>
                  <EmployeeTrackingPage />
                </ProtectedRoute>
              }
            />

            {/* Common Routes */}
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        {/* Redirect root to appropriate dashboard */}
        <Route 
          path="/" 
          element={<Navigate to={isAuthenticated ? getDefaultRoute() : '/login'} replace />} 
        />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default App;
