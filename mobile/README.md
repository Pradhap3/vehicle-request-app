# AISIN Fleet Mobile

This mobile app uses the same backend as the existing `vehicle-request-app`.

Current coverage:

- login with existing credentials
- driver operations dashboard
- security gate validation
- employee trip visibility

Run:

```bash
npm install
npm run start
```

Node requirement:

- use Node 18, 20, or 22 LTS
- do not use Node 25 for Expo install/runtime in this repo

Environment variables:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SOCKET_URL`
