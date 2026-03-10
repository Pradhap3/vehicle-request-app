import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';
import { authAPI } from '../services/api';

const LoginPage = () => {
  const [driverName, setDriverName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!driverName || !password) {
      setError(t('login_err_required'));
      return;
    }

    setLoading(true);
    
    const result = await login(driverName, password);
    
    setLoading(false);
    
    if (result.success) {
      // Navigate based on role
      const user = result.user;
      let redirectPath = from;
      
      if (from === '/') {
        switch (user.role) {
          case 'HR_ADMIN':
          case 'ADMIN':
            redirectPath = '/dashboard';
            break;
          case 'CAB_DRIVER':
          case 'DRIVER':
            redirectPath = '/driver';
            break;
          case 'EMPLOYEE':
          case 'USER':
            redirectPath = '/employee';
            break;
          default:
            redirectPath = '/dashboard';
        }
      }
      
      navigate(redirectPath, { replace: true });
    } else {
      setError(result.error);
    }
  };

  const handleMicrosoftLogin = async () => {
    try {
      setError('');
      setMicrosoftLoading(true);
      const response = await authAPI.getMicrosoftStartUrl(from === '/login' ? '/' : from);
      const url = response?.data?.data?.url;
      if (!url) {
        throw new Error('Microsoft sign-in URL is missing');
      }
      window.location.href = url;
    } catch (err) {
      setMicrosoftLoading(false);
      setError(err.response?.data?.error || err.message || 'Microsoft sign-in failed');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary-500 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
              <span className="text-primary-500 font-bold text-2xl">A</span>
            </div>
            <span className="font-bold text-xl italic">AISIN</span>
          </div>
        </div>
        
        <div>
          <h1 className="text-4xl font-bold mb-4">{t('login_title')}</h1>
          <p className="text-lg text-primary-200">
            {t('login_subtitle')}
          </p>
        </div>
        
        <div>
          <p className="text-sm text-primary-300">AISIN Corporation</p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">A</span>
            </div>
            <span className="font-bold text-xl text-primary-500 italic">AISIN Fleet</span>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('login_welcome')}</h2>
            <p className="text-gray-500 mb-8">{t('login_signin')}</p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleMicrosoftLogin}
                disabled={loading || microsoftLoading}
                className="w-full py-3 border border-gray-300 bg-white text-gray-800 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {microsoftLoading ? t('login_microsoft_signing_in') : t('login_microsoft')}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200"></div>
                <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{t('login_driver_section')}</span>
                <div className="h-px flex-1 bg-gray-200"></div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="driverName" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('login_driver_name')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    id="driverName"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    placeholder={t('login_driver_name_placeholder')}
                    autoComplete="username"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  {t('login_password')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    placeholder={t('login_password_placeholder')}
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('login_signing_in')}
                  </>
                ) : (
                  t('login_button')
                )}
              </button>
            </form>

            {/* Help text */}
            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">
                {t('login_help')}
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-gray-400 mt-8">
            © {new Date().getFullYear()} AISIN Corporation. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
