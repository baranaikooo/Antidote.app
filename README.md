# Antidote

Antidote is a Slovak dating app. It recommends people using questionnaire answers and preferences, including distance. The first recommendation does not show a profile photo.

## Interface and conversation

- The welcome screen pairs a full-screen illustration with an interactive question. Sign-in uses Google through Supabase.
- The signed-in app offers a warm light theme and a navy dark theme. The system setting follows the device. The recorder uses the same theme as the conversation.
- A new conversation starts with one shared question. Each person records up to 20 seconds. Once both have answered, they can listen to both recordings and continue with text, GIFs or voice messages.
- Profile videos are shared after mutual consent.

## Development

- React, TanStack Start, Vite and Tailwind CSS power the web app. Capacitor packages it for Android.
- Supabase handles sign-in, profile data, recommendations, private media and conversation rules. The app calls the `get_recommended_matches` RPC for live recommendations. The [Python matching engine](matching_engine/) has its own model and tests.
- See [Setup](SETUP.md) for local development and [Android pilot](docs/android-pilot.md) for device checks.
- Verify the current design in the [live app](https://antidotesk.vercel.app). The source is in [the stylesheet](src/styles.css), [the application route](src/routes/index.tsx) and [the chat components](src/components/chat/).

Copyright © 2026 baranaikooo. All rights reserved.
