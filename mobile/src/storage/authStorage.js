import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'aisin_fleet_token';
const REFRESH_TOKEN_KEY = 'aisin_fleet_refresh_token';
const USER_KEY = 'aisin_fleet_user';

export const authStorage = {
  async load() {
    const [token, refreshToken, user] = await Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(REFRESH_TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY)
    ]);

    return {
      token,
      refreshToken,
      user: user ? JSON.parse(user) : null
    };
  },
  async save(session) {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, session.token),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken || ''),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(session.user))
    ]);
  },
  async clear() {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY)
    ]);
  }
};
