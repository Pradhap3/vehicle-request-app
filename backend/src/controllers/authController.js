// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const logger = require('../utils/logger');
const { connectDB } = require('../config/database');

const isDatabaseUnavailableError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('database not connected') ||
    msg.includes('cannot open server') ||
    msg.includes('elogin') ||
    msg.includes('esocket')
  );
};

const ensureDbConnection = async () => {
  await connectDB();
};

const MICROSOFT_PROVIDER = 'MICROSOFT';
const STAFF_ROLES = new Set(['HR_ADMIN', 'ADMIN', 'EMPLOYEE', 'USER']);

const getMicrosoftConfig = () => {
  const tenantId = process.env.MS_TENANT_ID || 'common';
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_REDIRECT_URI;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Microsoft SSO is not configured. Set MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_REDIRECT_URI.');
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    frontendUrl,
    authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo'
  };
};

const decodeJwtPayload = (token) => {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const extractMicrosoftAuthErrorMessage = (error) => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const description = String(
    data?.error_description ||
    data?.error?.message ||
    data?.message ||
    error?.message ||
    ''
  ).trim();

  const lowerDescription = description.toLowerCase();

  if (lowerDescription.includes('aadsts53003') || lowerDescription.includes('53003')) {
    return 'Microsoft sign-in is blocked by your organization policy. Contact your Microsoft Entra admin.';
  }

  if (lowerDescription.includes('redirect uri') || lowerDescription.includes('redirect_uri')) {
    return 'Microsoft sign-in failed because the redirect URI does not match the app registration.';
  }

  if (lowerDescription.includes('invalid client secret') || lowerDescription.includes('client secret')) {
    return 'Microsoft sign-in failed because the client secret is invalid or expired.';
  }

  if (lowerDescription.includes('application') && lowerDescription.includes('not found')) {
    return 'Microsoft sign-in failed because the app registration could not be found in this tenant.';
  }

  if (status === 401) {
    return 'Microsoft rejected the sign-in request. Check client secret, tenant ID, and redirect URI.';
  }

  if (description) {
    return description.replace(/\s+/g, ' ').slice(0, 300);
  }

  return 'Microsoft sign-in failed';
};

const buildFrontendRedirect = (frontendUrl, params = {}) => {
  const redirectUrl = new URL('/auth/callback', frontendUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      redirectUrl.searchParams.set(key, value);
    }
  });
  return redirectUrl.toString();
};

const createOauthState = (redirectPath = '/') =>
  jwt.sign(
    {
      type: 'MICROSOFT_OAUTH_STATE',
      redirectPath
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

const parseOauthState = (value) => {
  const decoded = jwt.verify(value, process.env.JWT_SECRET);
  if (decoded?.type !== 'MICROSOFT_OAUTH_STATE') {
    throw new Error('Invalid OAuth state');
  }
  return decoded;
};

const sanitizeUserPayload = (user) => ({
  id: user.id,
  employee_id: user.employee_id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  preferred_language: user.preferred_language,
  auth_provider: user.auth_provider || 'LOCAL'
});

const completeLogin = async (user) => {
  await User.updateLastLogin(user.id);
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);
  return {
    token,
    refreshToken,
    user: sanitizeUserPayload(user)
  };
};

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '8h' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
};

// Login - Production Ready (No Demo Login)
exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const loginIdentifier = String(req.body.identifier || req.body.email || '').trim();
    const { password } = req.body;
    await ensureDbConnection();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Driver name and password are required'
      });
    }

    let user = null;
    const looksLikeEmail = loginIdentifier.includes('@');

    if (looksLikeEmail) {
      user = await User.findByEmail(loginIdentifier);
    } else {
      user = await User.findDriverByName(loginIdentifier);
    }
    
    if (!user) {
      logger.warn(`Login attempt for unknown identifier: ${loginIdentifier}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid driver name or password'
      });
    }

    if (!user.is_active) {
      logger.warn(`Login attempt for inactive user: ${loginIdentifier}`);
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated. Please contact administrator.'
      });
    }

    if (user.auth_provider === MICROSOFT_PROVIDER && STAFF_ROLES.has(user.role)) {
      return res.status(400).json({
        success: false,
        error: 'Use Microsoft sign-in for this account.'
      });
    }

    if (!looksLikeEmail && !['CAB_DRIVER', 'DRIVER'].includes(user.role)) {
      return res.status(400).json({
        success: false,
        error: 'Only drivers can use name-based login.'
      });
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      logger.warn(`Invalid password attempt for: ${loginIdentifier}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid driver name or password'
      });
    }

    const authResult = await completeLogin(user);

    logger.info(`User logged in: ${loginIdentifier}`);

    res.json({
      success: true,
      data: authResult
    });
  } catch (error) {
    logger.error('Login error:', error);
    if (error.code === 'DRIVER_NAME_NOT_UNIQUE') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Database temporarily unavailable. Please retry in a few minutes.'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};

exports.getMicrosoftStartUrl = async (req, res) => {
  try {
    const config = getMicrosoftConfig();
    const redirectPath = String(req.query.redirect || '/').startsWith('/') ? req.query.redirect : '/';
    const authUrl = new URL(config.authorizeUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', 'openid profile email User.Read');
    authUrl.searchParams.set('state', createOauthState(redirectPath));

    res.json({
      success: true,
      data: {
        url: authUrl.toString()
      }
    });
  } catch (error) {
    logger.error('Get Microsoft start URL error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize Microsoft sign-in'
    });
  }
};

exports.microsoftCallback = async (req, res) => {
  let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    await ensureDbConnection();
    const config = getMicrosoftConfig();
    frontendUrl = config.frontendUrl;
    const { code, state } = req.query;
    const parsedState = parseOauthState(state);

    if (!code) {
      return res.redirect(buildFrontendRedirect(frontendUrl, {
        error: 'Missing Microsoft authorization code'
      }));
    }

    const tokenResponse = await axios.post(
      config.tokenUrl,
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
        scope: 'openid profile email User.Read'
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token: accessToken, id_token: idToken } = tokenResponse.data || {};
    let profile = null;

    try {
      const userInfoResponse = await axios.get(config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      profile = userInfoResponse.data;
    } catch (userinfoError) {
      profile = decodeJwtPayload(idToken);
    }

    const email = profile?.email || profile?.preferred_username || profile?.upn;
    const externalSubject = profile?.sub || profile?.oid;
    const displayName = profile?.name || email;

    if (!email || !externalSubject) {
      throw new Error('Unable to read Microsoft account profile');
    }

    let user = await User.findByExternalIdentity(MICROSOFT_PROVIDER, externalSubject);
    if (!user) {
      user = await User.findByEmail(email);
    }

    if (!user) {
      return res.redirect(buildFrontendRedirect(frontendUrl, {
        error: 'No AISIN account is linked to this Microsoft email.'
      }));
    }

    if (!user.is_active) {
      return res.redirect(buildFrontendRedirect(frontendUrl, {
        error: 'Account is deactivated. Please contact administrator.'
      }));
    }

    if (!STAFF_ROLES.has(user.role)) {
      return res.redirect(buildFrontendRedirect(frontendUrl, {
        error: 'Microsoft sign-in is available only for employees, HR, and admins.'
      }));
    }

    await User.update(user.id, {
      auth_provider: MICROSOFT_PROVIDER,
      external_subject: externalSubject,
      name: user.name || displayName
    });
    user = await User.findById(user.id);

    const authResult = await completeLogin(user);
    logger.info(`Microsoft SSO login successful: ${email}`);

    res.redirect(buildFrontendRedirect(frontendUrl, {
      token: authResult.token,
      refreshToken: authResult.refreshToken,
      user: Buffer.from(JSON.stringify(authResult.user), 'utf8').toString('base64url'),
      redirect: parsedState.redirectPath || '/'
    }));
  } catch (error) {
    logger.error('Microsoft callback error:', error);
    res.redirect(buildFrontendRedirect(frontendUrl, {
      error: extractMicrosoftAuthErrorMessage(error)
    }));
  }
};

// Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    await ensureDbConnection();

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }

    const authResult = await completeLogin(user);

    res.json({
      success: true,
      data: {
        token: authResult.token,
        refreshToken: authResult.refreshToken
      }
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Database temporarily unavailable. Please retry in a few minutes.'
      });
    }
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    await ensureDbConnection();
    const user = await User.findById(req.user.id);
    
    res.json({
      success: true,
      data: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department: user.department,
        preferred_language: user.preferred_language,
        last_login: user.last_login
      }
    });
  } catch (error) {
    logger.error('Get me error:', error);
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Database temporarily unavailable. Please retry in a few minutes.'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to get user data'
    });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, preferred_language } = req.body;
    
    const updated = await User.update(req.user.id, {
      name,
      phone,
      preferred_language
    });

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    // Accept both naming conventions
    const currentPassword = req.body.currentPassword || req.body.current_password;
    const newPassword = req.body.newPassword || req.body.new_password;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    const user = await User.findByEmail(req.user.email);
    
    const isValid = await User.verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    await User.update(req.user.id, { password: newPassword });

    logger.info(`Password changed for user: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

// Logout (client-side token removal, but we can log it)
exports.logout = async (req, res) => {
  try {
    logger.info(`User logged out: ${req.user.email}`);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
};
