# Someone's Voice Assistant 🎙️

A completely free, 100% serverless full-stack AI voice assistant powered by Google Gemini, optimized for **Cloudflare Pages**. 

## ✨ Features

- **🤖 AI Chat**: Powered by Google Gemini - answers any question conversationally.
- **🎤 Voice Recognition**: Full speech-to-text with Web Speech API.
- **🔊 Wake Word Detection**: Always listening for your custom wake word (e.g., "hey assistant").
- **🗣️ Text-to-Speech**: Assistant speaks responses naturally.
- **🎵 Music Player**: Stateless music playback via YouTube (using Piped/Invidious proxy APIs).
- **🌤️ Weather & News**: Real-time geolocation weather formatting and RSS news parsing.
- **🕐 Standby Mode**: 5 beautiful animated clock styles including an immersive Aurora UI.
- **🎨 Dark Matte Red UI**: Premium theme with glass-morphic accents, animated gradients, and completely pure vanilla CSS logic.
- **🔒 Privacy First**: Your API key stays completely localized in your browser `localStorage`.

---

## 🚀 Live Demo

*Deploy your own or link your live demo here.*

![Setup Page Theme Screenshot](public/favicon.svg) <!-- Placeholders for screenshots -->

---

## 📦 Project Structure

Structured specifically for **Cloudflare Pages** deployment.

```text
voice-assistant/
├── functions/
│   └── api/
│       └── [[route]].ts    # Serverless Hono backend proxying API requests
├── public/                 # Statically served files
│   ├── index.html
│   ├── script.js           # Core browser application logic
│   └── styles.css          # Theme definition & structure
├── package.json
├── wrangler.toml           # Cloudflare dev/deployment configuration
├── .gitignore
└── README.md
```

## ⚙️ Tech Stack
- **Frontend**: Vanilla HTML / JS / CSS (No large frameworks or build steps).
- **Backend / Proxy**: Cloudflare Workers / Pages Functions execution.
- **Framework**: Hono (TypeScript-based router optimized for edges).
- **Data Integrations**: Google Gemini API, Open-Meteo, Google News RSS, Piped API (Music streaming).

---

## 🛠️ Usage & Local Development

This project uses Cloudflare Wrangler to simulate the edge node environment locally.

### 1. Requirements
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Setup
Clone the repository and install the dependencies:
```bash
git clone https://github.com/saurabh222007/voice-assistant-.git
cd voice-assistant-
npm install
```

### 3. Run Locally
```bash
# Starts the Wrangler edge development server
npm run dev
```
Open the provided `localhost` link in your browser. 

---

## 🌐 Deploying to Cloudflare Pages (Free)

Deploying takes roughly 2 minutes directly from GitHub.

1. Push this repository to your GitHub account.
2. In your Cloudflare dashboard, go to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select this repository.
4. Configure the build settings:
   - **Framework preset**: `None`
   - **Build command**: `npm install`
   - **Build output directory**: `public`
5. Click **Save and Deploy**. Cloudflare automatically detects the `functions/` directory and creates the edge endpoints!

---

## 🔒 Security & Privacy Statement

This application enforces a strict client-side model regarding user identity. **No databases are connected**, and no personal data or chat logs are collected server-side.
1. The **Gemini API Key** is requested via frontend UI and saved to `localStorage`.
2. It's securely injected into requests flowing to the Cloudflare endpoints to protect from CORS blocks and inject systemic prompts, passing directly to Google.

<br>
<p align="center">Made with ❤️ by <strong>Someone</strong></p>
