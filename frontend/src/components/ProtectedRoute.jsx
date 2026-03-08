import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If allowedRoles is specified, check if user's role is allowed
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Redirect to appropriate dashboard based on role
    const redirectPath = user?.role === 'CAB_DRIVER' ? '/driver' : 
                         user?.role === 'EMPLOYEE' ? '/employee' : '/dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  // If children are passed, render them (for nested route protection)
  // Otherwise render Outlet for parent route protection
  return children ? children : <Outlet />;
};

export default ProtectedRoute;
