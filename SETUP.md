# Antidote setup

## Local web app

Use Node.js 24 and npm, as in the Android release workflow.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the Supabase project you want to use.
3. For a fresh Supabase project, apply the migrations in `supabase/migrations`. Enable Google under **Authentication → Providers**, set the Google client ID and secret in Supabase, and register the Supabase callback URL with Google. Add the local app URL to the Supabase redirect allowlist.
4. Run `npm run dev` and open the URL printed by Vite.

For voice input, allow the microphone. For onboarding video, allow the camera. Production recording requires HTTPS. The browser reads the media through `MediaRecorder` and reports denied permissions in the app.

## Build and Android

Run `npm test -- --run` for tests and `npm run build` for a production build. The Vercel build output is in `.vercel/output`. The Android app loads the production web app in Capacitor. The [GitHub workflow](.github/workflows/android-release.yml) publishes a signed APK after the matching Vercel deployment is live.

## GIF search

The Supabase Edge Function `search-chat-gifs` uses a KLIPY application key saved as `KLIPY_APP_KEY` in Supabase Edge Function Secrets. It also accepts the older secret name `Klipy`. Results from the provider carry the **Powered by KLIPY** label. If the provider is unavailable, the app searches the built-in GIPHY selection.
