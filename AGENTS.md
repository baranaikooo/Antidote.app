# Agent Guidelines for Antidote

Antidote is a Slovak dating app built with React, TanStack Start, Supabase, and Capacitor for Android.

## Architecture Overview
- **Frontend**: React, TanStack Start, Tailwind CSS, Vite.
- **Backend & Database**: Supabase (PostgreSQL, Auth, Storage, Edge Functions).
  - Storage buckets `media-snippets`, `voice-messages`, and `question-voices` are private and use time-limited signed URLs.
  - Authentication via Google OAuth and Supabase Auth.
  - Database functions enforce strict RLS and cascading deletion on `delete_own_user()`.
- **Mobile**: Capacitor Android with hardware permissions for camera, microphone, and network state.
- **Production Hosting**: Vercel (`https://antidotesk.vercel.app`).

## Interface

- The illustrated welcome screen is in `src/routes/index.tsx`. Theme colors and shared styles are in `src/styles.css`.
- Signed-in screens use the selected light, dark, or system theme. Reuse the shared theme variables for new controls and screens.
- For a new conversation, both people record an answer to the shared question. Regular chat opens after both answers are saved.

## Development Rules
- Maintain linear git history. Changes must be committed and pushed through Pull Requests to `main`.
- Never commit private credentials, service role keys, or compiled binaries (`.apk`, `.aab`) into the git repository.
- Keep the working tree clean and verify deployments on Vercel after merges.

