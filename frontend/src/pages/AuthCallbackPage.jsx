import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const AuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeLogin } = useAuth();

  const decodeBase64Url = (value) => {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  };

  useEffect(() => {
    const error = searchParams.get('error');
    const token = searchParams.get('token');
    const refreshToken = searchParams.get('refreshToken');
    const encodedUser = searchParams.get('user');
    const redirectPath = searchParams.get('redirect') || '/';

    if (error) {
      toast.error(error);
      navigate('/login', { replace: true });
      return;
    }

    if (!token || !refreshToken || !encodedUser) {
      toast.error('Microsoft sign-in response is incomplete.');
      navigate('/login', { replace: true });
      return;
    }

    try {
      const user = JSON.parse(decodeBase64Url(encodedUser));
      completeLogin({ user, token, refreshToken }, { silent: false });
      navigate(redirectPath, { replace: true });
    } catch (parseError) {
      toast.error('Unable to finish Microsoft sign-in.');
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate, completeLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Signing you in with Microsoft...</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;
