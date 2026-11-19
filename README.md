# Only Yours

Only Yours is an experimental two-person messenger with a browser app and an Android 11+ host. It supports encrypted text and media, pairing, voice and video calls, local history, and private device backups.

## Use

Open [the web app](https://only-yours-app-private.vercel.app/) or the [Android install page](https://only-yours-app-private.vercel.app/install). Each person creates an account on their own device, then one enters the other's pairing code in **Us & privacy**. Compare the shared fingerprint through a trusted channel before sending sensitive messages.

The APK is an experimental development build. Keep your password and an encrypted backup safe: losing the local vault and keys can make old messages inaccessible. Browser storage is tied to its origin.

## Features

- Two-person pairing and encrypted direct WebRTC data channels, with an encrypted offline relay fallback.
- Local-first text, images, files, voice messages, replies, reactions, read receipts, and typing indicators.
- View-once and disappearing-message options, plus affection animations.
- Voice and video calls, with optional screen sharing.
- Password-encrypted local vault and Android device authentication.

## Security limits

The cryptography is custom and unaudited. It does not provide the same reviewed guarantees as established secure messengers. It has no forward secrecy or post-compromise recovery. The first pairing relies on the server's public-key response until you verify the fingerprint. WebRTC can expose network addresses to the peer and STUN service. View-once and disappearing messages cannot prevent screenshots, external copies, modified clients, or device backups. Physical-device and two-phone testing remains necessary.

The relay stores account and pairing metadata plus queued ciphertext. It does not receive device private keys or plaintext messages. Notifications contain generic routing hints without message content.

## Local development

Requires Node.js 24 or newer. No npm packages are required for the web service.

```sh
npm start
npm test
```

Open `http://localhost:8787`. Web Crypto needs localhost or HTTPS. The local SQLite database is written under `data/`, which is excluded from Git.

The production API uses a separately configured database and server-side credentials. Set deployment secrets in the hosting environment; do not add them to source control. See `schema.sql`, `index.mjs`, and `vercel.json` for the database schema, API entry point, and routing configuration.

## Android development

Open `android/` in Android Studio with the Android SDK, or use `build-android.py` with the installed SDK tools and dependencies. For a development build, set `ONLY_YOURS_DEV_KEY_PASSWORD` in your environment. The script creates a local development keystore if needed. The keystore is excluded from Git. Use your own protected production signing identity for a release; an APK signed with a different identity cannot update an existing installation without migration.

The repository contains source code. Download the currently hosted development APK from the install page.
