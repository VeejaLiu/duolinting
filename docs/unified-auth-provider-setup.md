# Unified learner authentication: provider setup

The email-first flow works with the existing transactional mail service. Apple and Google controls appear only when both the server and the relevant app build have their public provider configuration. Keep actual hosts, credentials, keys, and operational steps in the ignored local deployment runbook; this document lists variable names and checks only.

Provider-only accounts may learn without an email or password. They can add email login after reauthenticating with a linked provider and verifying the new mailbox. A usable password requires that verified email login address.

## Server configuration

Set a dedicated, random `EMAIL_CODE_SECRET` of at least 32 characters. It must differ from `SECRET_JWT`. Set `OAUTH_REFRESH_TOKEN_KEY` to a base64-encoded random 32-byte key before enabling Apple. Preserve this key across releases so saved Apple refresh tokens remain decryptable for revocation.

For Google, set `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, and `GOOGLE_ANDROID_CLIENT_ID`. The backend accepts only verified ID tokens for these client IDs and compares their nonce with a short-lived transaction. The Web client ID is public and is also passed to the Expo Web build as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

For Apple, set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `APPLE_SERVICE_ID`, and `APPLE_REDIRECT_URI`. The redirect must be a public HTTPS URL ending in `/api/v1/auth/oauth/apple/callback`. Set `OAUTH_WEB_ORIGINS` to a comma-separated list of exact HTTPS origins allowed to receive the one-use browser exchange ticket. The private key and token-encryption key must remain server-side; never use `EXPO_PUBLIC_*` for either.

The production Compose file forwards these values. Unconfigured providers stay hidden; production startup rejects a missing or example `EMAIL_CODE_SECRET`.

## Google Cloud

Create one Web OAuth client for browser sign-in and server ID-token audience, one iOS client for bundle ID `com.duolinting.app`, and one Android client for package `com.duolinting.app`. Register the SHA-1 fingerprints for development, upload signing, and Google Play App Signing as applicable. Configure the OAuth brand, support contact, authorized domains, and published privacy policy. Request only basic sign-in identity; the app does not require Google offline access or a Google refresh token.

The iOS client ID and Web client ID are public build inputs: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. The Expo config adds the native Google plugin and reversed iOS URL scheme when both are present. Native testing requires a development build containing the Nitro module; Expo Go cannot exercise it.

## Apple Developer

Enable Sign in with Apple on the existing App ID for bundle ID `com.duolinting.app`. Create a Services ID for browser and Android authorization, associate it with the same primary App ID, and register the HTTPS callback. Create a Sign in with Apple private key, then store its Team ID, Key ID, and private key only in the ignored server configuration. Configure Private Email Relay for the transactional mail sender if relay addresses will receive mail.

Set `EXPO_PUBLIC_APPLE_AUTH_ENABLED=true` in the iOS build environment only after the capability is enabled. The Expo config then includes `expo-apple-authentication` and its entitlement. Android uses the system browser and a one-use app return ticket. The server stores Apple refresh tokens encrypted per client ID, so native and Services ID grants can both be revoked on unlink or account deletion.
