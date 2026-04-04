# Someone's Voice Assistant 🎙️

## Project Overview
- **Name**: Someone's Voice Assistant
- **Goal**: A completely free, full-stack AI voice assistant powered by Google Gemini
- **Status**: ✅ Fully Functional

## Features

### ✅ Implemented
- **🤖 AI Chat**: Powered by Google Gemini 2.0 Flash - answers any question conversationally
- **🎤 Voice Recognition**: Full speech-to-text with Web Speech API
- **🔊 Wake Word Detection**: Always listening for customizable wake word ("hey assistant" by default)
- **🗣️ Text-to-Speech**: Assistant speaks responses out loud
- **🎵 Music Player**: Search and play music via YouTube (Invidious/Piped APIs)
- **🌤️ Weather Reports**: Real-time weather via geolocation (Open-Meteo API - free, no key needed)
- **📰 News Headlines**: Latest news from Google News RSS feed
- **🕐 Standby Mode**: Beautiful clock display with 4 styles + weather widget
  - Digital Clock
  - Minimal Clock
  - Neon Clock (with glow effects)
  - Analog Clock (with animated hands)
- **🎨 Dark Matte Red UI**: Premium dark theme with red accents, glass morphism, and animations
- **⚙️ Settings Panel**: Customizable wake word, clock style, TTS toggle, continuous listening
- **📱 Responsive Design**: Works on desktop and mobile
- **🔒 Privacy First**: API key stored only in browser localStorage

## How to Use

### Getting Started
1. Visit the app URL
2. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
3. Enter your API key and click "Launch Assistant"

### Voice Commands
- **Ask anything**: "What is quantum computing?"
- **Play music**: "Play lofi hip hop beats"
- **Check weather**: "What's the weather like?"
- **Get news**: "Tell me the latest news"
- **Check time**: "What time is it?"
- **Stop music**: "Stop the music"

### Wake Word
- Say **"hey assistant"** followed by your question
- Customize the wake word in Settings

### Standby Mode
- Click the moon icon (🌙) to enter standby mode
- Beautiful animated clock with weather display
- Wake word still active in standby - just say the wake word to ask questions
- Click "Clock Style" to cycle through 4 different clock designs

### Quick Actions
Use the quick action buttons at the bottom:
- ☀️ Weather
- 📰 News
- 🎵 Play Music
- 🕐 Time
- 😂 Joke

## Tech Stack
- **Backend**: Hono (TypeScript) on Cloudflare Workers
- **Frontend**: Vanilla JS + Tailwind CSS + Font Awesome
- **AI**: Google Gemini 2.0 Flash API
- **Weather**: Open-Meteo API (free, no key)
- **News**: Google News RSS
- **Music**: Invidious/Piped APIs (free YouTube alternatives)
- **Voice**: Web Speech API (recognition + synthesis)
- **Fonts**: Inter, JetBrains Mono, Orbitron

## API Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Main application page |
| `/api/gemini` | POST | Proxy to Gemini API |
| `/api/weather?lat=X&lon=Y` | GET | Weather data |
| `/api/news?country=us` | GET | News headlines |
| `/api/youtube/search?q=X` | GET | YouTube music search |
| `/api/youtube/stream?id=X` | GET | Get audio stream URL |
| `/static/*` | GET | Static assets |

## URLs
- **Live**: https://3000-ilw5amgswpilxu2sfuspr-c81df28e.sandbox.novita.ai

## Data Architecture
- **Storage**: Browser localStorage (API key, preferences only)
- **No server-side database**: Completely stateless backend
- **All data fetched in real-time**: Weather, news, music streams

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active
- **Tech Stack**: Hono + TypeScript + TailwindCSS (CDN) + Vanilla JS
- **Last Updated**: 2026-04-04

## Privacy & Security
- Your Gemini API key is stored **only in your browser** (localStorage)
- API calls are proxied through the backend for CORS compatibility
- No tracking, no analytics, no data collection
- Completely free to use
