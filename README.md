# Antidote

**No swiping. Just psychology.**

Antidote is a Slovak dating app that uses a psychometric questionnaire and user preferences to recommend people. New conversations start with a shared question and a short voice answer from each person.

## 🌟 Key Features

- **No Swiping**: Matches are generated based on psychological alignment (Cognitive Depth, Conscientiousness, Extraversion).
- **Liveness Verification**: A mandatory 3-second live video snippet using on-device face detection ensures everyone is a real human. No catfish, no AI bots.
- **Voice-first conversation**. Both voice answers become available at the same time. The conversation then supports text, GIFs, and voice messages.
- **Appearance**. The welcome screen has a full-bleed illustration over a deep navy background and an interactive opening question. The signed-in app supports a warm light theme and a navy dark theme, with a system setting that follows the device. See [the live app](https://antidotesk.vercel.app) and [the current stylesheet](src/styles.css).
- **Value Bankroll**: Users define their core priorities (Freedom, Family, Career, Creativity, Stability) via an interactive radar chart.
- **Google OAuth**: Fast and secure one-tap login without SMS costs or passwords.

## 🛠 Tech Stack

- **Frontend**: React, TanStack Start, Tailwind CSS
- **Native Wrapper**: Capacitor (Android WebView with deep integration)
- **Backend/Auth/DB**: Supabase (PostgreSQL, Edge Functions, Auth)
- **AI/ML**: TensorFlow.js (BlazeFace for on-device liveness verification)

## 🧠 The Psychology Algorithm

Antidote abandons the traditional "looks-first" matching approach. Instead, the engine calculates compatibility based on a multi-dimensional psychological profile:

- **Cognitive Depth**: Assessed through interactions and response complexity.
- **Personality Traits**: Measured via standard metrics like Conscientiousness and Extraversion.
- **Value Bankroll**: Users define their life priorities (Freedom, Family, Career, Creativity, Stability) using an interactive radar chart. The engine seeks resonance in shared core values rather than superficial traits.

## 🗺 Roadmap

- [x] Liveness Verification (Anti-Catfish / On-device ML)
- [x] Illustrated welcome screen and light and dark themes
- [x] Shared voice question for new conversations
- [x] Value Bankroll & Interactive Radar Chart
- [ ] Advanced Matching Engine Algorithm Integration
- [ ] iOS App Store Release
- [ ] AI Voice Analysis for Mood & Tone Detection

## 📄 License & Contact

**License:** Copyright © 2026 baranaikooo. All rights reserved.
_(If you decide to make this fully open-source later, you can replace this with an MIT License)._

**Contact:** Have questions, feedback, or want to collaborate? Feel free to open a GitHub Issue or reach out via your GitHub profile.
