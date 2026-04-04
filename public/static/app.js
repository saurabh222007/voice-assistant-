// ============================================
// SOMEONE'S VOICE ASSISTANT - Main Application
// ============================================

(function() {
  'use strict';

  // ============ STATE ============
  const state = {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    isSetup: false,
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    isStandby: false,
    wakeWordEnabled: true,
    wakeWord: 'hey assistant',
    clockStyle: localStorage.getItem('clock_style') || 'digital',
    ttsEnabled: localStorage.getItem('tts_enabled') !== 'false',
    ttsVoice: localStorage.getItem('tts_voice') || 'default',
    chatHistory: [],
    geminiHistory: [],
    weather: null,
    location: null,
    locationName: '',
    musicQueue: [],
    currentTrack: null,
    isPlaying: false,
    recognition: null,
    audioPlayer: new Audio(),
    synth: window.speechSynthesis,
    standbyTimer: null,
    continuousListening: false,
    wakeWordDetected: false,
    settingsOpen: false
  };

  // ============ WEATHER CODES ============
  const weatherCodes = {
    0: { icon: '☀️', desc: 'Clear sky' },
    1: { icon: '🌤️', desc: 'Mainly clear' },
    2: { icon: '⛅', desc: 'Partly cloudy' },
    3: { icon: '☁️', desc: 'Overcast' },
    45: { icon: '🌫️', desc: 'Foggy' },
    48: { icon: '🌫️', desc: 'Rime fog' },
    51: { icon: '🌦️', desc: 'Light drizzle' },
    53: { icon: '🌦️', desc: 'Moderate drizzle' },
    55: { icon: '🌧️', desc: 'Dense drizzle' },
    61: { icon: '🌧️', desc: 'Slight rain' },
    63: { icon: '🌧️', desc: 'Moderate rain' },
    65: { icon: '🌧️', desc: 'Heavy rain' },
    71: { icon: '🌨️', desc: 'Slight snow' },
    73: { icon: '🌨️', desc: 'Moderate snow' },
    75: { icon: '❄️', desc: 'Heavy snow' },
    77: { icon: '🌨️', desc: 'Snow grains' },
    80: { icon: '🌦️', desc: 'Rain showers' },
    81: { icon: '🌧️', desc: 'Moderate showers' },
    82: { icon: '⛈️', desc: 'Violent showers' },
    85: { icon: '🌨️', desc: 'Snow showers' },
    86: { icon: '🌨️', desc: 'Heavy snow showers' },
    95: { icon: '⛈️', desc: 'Thunderstorm' },
    96: { icon: '⛈️', desc: 'Thunderstorm with hail' },
    99: { icon: '⛈️', desc: 'Thunderstorm with heavy hail' }
  };

  // ============ INIT ============
  function init() {
    renderApp();
    initSpeechRecognition();
    fetchLocation();

    if (state.apiKey) {
      state.isSetup = true;
      showAssistant();
    }

    // Audio player events
    state.audioPlayer.addEventListener('timeupdate', updateMusicProgress);
    state.audioPlayer.addEventListener('ended', onTrackEnd);
    state.audioPlayer.addEventListener('error', (e) => {
      showToast('Music playback error. Trying next source...', 'error');
    });
  }

  // ============ RENDER ============
  function renderApp() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <!-- Background Animation -->
      <div class="bg-animation">
        <div class="bg-orb"></div>
        <div class="bg-orb"></div>
        <div class="bg-orb"></div>
      </div>

      <!-- Particles -->
      <div class="particles-container" id="particles"></div>

      <!-- Toast Container -->
      <div class="toast-container" id="toastContainer"></div>

      <!-- Setup Screen -->
      <div class="setup-screen" id="setupScreen">
        <div class="setup-card">
          <div class="logo-icon">
            <i class="fas fa-waveform-lines" style="font-size:32px;">🎙️</i>
          </div>
          <h1>Someone's Voice Assistant</h1>
          <p>A free AI-powered voice assistant. Enter your Gemini API key to get started. Your key stays in your browser only.</p>
          <div class="api-input-group">
            <i class="fas fa-key"></i>
            <input type="password" class="api-input" id="apiKeyInput" placeholder="Enter your Gemini API key..." value="${state.apiKey}">
          </div>
          <button class="btn-primary" id="startBtn" onclick="window.app.startSetup()">
            <i class="fas fa-rocket"></i>
            Launch Assistant
          </button>
          <div class="api-help">
            <p>🔑 Get your free API key from <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a></p>
            <p style="margin-top:8px;">🔒 Your key never leaves your browser. All API calls are made securely.</p>
          </div>
        </div>
      </div>

      <!-- Main Assistant View -->
      <div class="assistant-view" id="assistantView" style="display:none;">
        <!-- Top Bar -->
        <div class="top-bar">
          <div class="top-bar-left">
            <div class="top-bar-logo">🎙️</div>
            <div>
              <div class="top-bar-title"><span>Someone's</span> Assistant</div>
              <div style="display:flex;align-items:center;gap:4px;">
                <div class="status-dot" id="statusDot"></div>
                <span class="status-text" id="statusText">Ready</span>
              </div>
            </div>
          </div>
          <div class="top-bar-right">
            <button class="top-btn" id="standbyBtn" onclick="window.app.toggleStandby()" title="Standby Mode">
              <i class="fas fa-moon"></i>
            </button>
            <button class="top-btn" id="settingsBtn" onclick="window.app.toggleSettings()" title="Settings">
              <i class="fas fa-gear"></i>
            </button>
          </div>
        </div>

        <!-- Chat Area -->
        <div class="chat-area" id="chatArea">
          <div class="welcome-msg" id="welcomeMsg">
            <div class="welcome-orb">🎙️</div>
            <h2>Hi there! 👋</h2>
            <p>I'm Someone's Voice Assistant. Ask me anything, request music, or check the weather and news!</p>
            <div class="wake-word-hint">
              <i class="fas fa-microphone"></i> Say <kbd>${state.wakeWord}</kbd> or click the mic to start
            </div>
          </div>
        </div>

        <!-- Music Player -->
        <div class="music-player" id="musicPlayer">
          <div class="music-player-inner">
            <div class="music-thumb" id="musicThumb">
              <i class="fas fa-music"></i>
            </div>
            <div class="music-info">
              <div class="music-title" id="musicTitle">No track playing</div>
              <div class="music-artist" id="musicArtist">--</div>
            </div>
            <div class="music-controls">
              <button class="music-ctrl-btn" onclick="window.app.musicPrev()">
                <i class="fas fa-backward-step"></i>
              </button>
              <button class="music-ctrl-btn play-pause" id="playPauseBtn" onclick="window.app.togglePlayPause()">
                <i class="fas fa-play"></i>
              </button>
              <button class="music-ctrl-btn" onclick="window.app.musicNext()">
                <i class="fas fa-forward-step"></i>
              </button>
              <button class="music-ctrl-btn" onclick="window.app.stopMusic()">
                <i class="fas fa-stop"></i>
              </button>
            </div>
          </div>
          <div class="music-progress">
            <span class="music-time" id="musicCurrentTime">0:00</span>
            <div class="music-progress-bar" id="musicProgressBar" onclick="window.app.seekMusic(event)">
              <div class="music-progress-fill" id="musicProgressFill"></div>
            </div>
            <span class="music-time" id="musicDuration">0:00</span>
          </div>
        </div>

        <!-- Input Bar -->
        <div class="input-bar">
          <div class="input-container">
            <button class="input-btn mic-btn" id="micBtn" onclick="window.app.toggleMic()">
              <i class="fas fa-microphone"></i>
            </button>
            <input type="text" id="chatInput" placeholder="Ask me anything..." 
              onkeydown="if(event.key==='Enter')window.app.sendMessage()">
            <div class="voice-visualizer" id="visualizer">
              <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
            </div>
            <button class="input-btn send-btn" id="sendBtn" onclick="window.app.sendMessage()">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
          <div class="quick-actions">
            <button class="quick-action" onclick="window.app.quickAction('weather')">
              <i class="fas fa-cloud-sun"></i> Weather
            </button>
            <button class="quick-action" onclick="window.app.quickAction('news')">
              <i class="fas fa-newspaper"></i> News
            </button>
            <button class="quick-action" onclick="window.app.quickAction('music')">
              <i class="fas fa-music"></i> Play Music
            </button>
            <button class="quick-action" onclick="window.app.quickAction('time')">
              <i class="fas fa-clock"></i> Time
            </button>
            <button class="quick-action" onclick="window.app.quickAction('joke')">
              <i class="fas fa-face-laugh"></i> Joke
            </button>
          </div>
        </div>
      </div>

      <!-- Standby Screen -->
      <div class="standby-screen" id="standbyScreen" onclick="window.app.handleStandbyClick(event)">
        <div id="standbyClockContainer"></div>
        <div class="standby-weather" id="standbyWeather" style="display:none;"></div>
        <div class="standby-wake-indicator">
          <div class="dot"></div>
          <span>Listening for "<span id="standbyWakeWord">${state.wakeWord}</span>"</span>
        </div>
        <div class="standby-controls">
          <button class="standby-ctrl-btn" onclick="event.stopPropagation(); window.app.cycleClockStyle()">
            <i class="fas fa-clock"></i> Clock Style
          </button>
          <button class="standby-ctrl-btn" onclick="event.stopPropagation(); window.app.toggleStandby()">
            <i class="fas fa-arrow-left"></i> Exit
          </button>
        </div>
      </div>

      <!-- Settings Panel -->
      <div class="settings-overlay" id="settingsOverlay" onclick="window.app.toggleSettings()"></div>
      <div class="settings-panel" id="settingsPanel">
        <div class="settings-header">
          <h3><i class="fas fa-gear"></i> Settings</h3>
          <button class="settings-close" onclick="window.app.toggleSettings()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="setting-group">
          <label>Gemini API Key</label>
          <input type="password" class="api-input" id="settingsApiKey" value="${state.apiKey}" 
            style="border-radius:10px;padding-left:14px;width:100%;font-family:'JetBrains Mono',monospace;font-size:0.85rem;"
            onchange="window.app.updateApiKey(this.value)">
        </div>

        <div class="setting-group">
          <label>Wake Word</label>
          <input type="text" id="wakeWordInput" value="${state.wakeWord}" 
            onchange="window.app.updateWakeWord(this.value)">
        </div>

        <div class="setting-group">
          <label>Clock Style (Standby)</label>
          <select id="clockStyleSelect" onchange="window.app.setClockStyle(this.value)">
            <option value="digital" ${state.clockStyle === 'digital' ? 'selected' : ''}>Digital</option>
            <option value="minimal" ${state.clockStyle === 'minimal' ? 'selected' : ''}>Minimal</option>
            <option value="neon" ${state.clockStyle === 'neon' ? 'selected' : ''}>Neon</option>
            <option value="analog" ${state.clockStyle === 'analog' ? 'selected' : ''}>Analog</option>
          </select>
        </div>

        <div class="setting-toggle">
          <span class="setting-toggle-label">Text-to-Speech</span>
          <div class="toggle-switch ${state.ttsEnabled ? 'active' : ''}" id="ttsToggle" onclick="window.app.toggleTTS()"></div>
        </div>

        <div class="setting-toggle">
          <span class="setting-toggle-label">Wake Word Detection</span>
          <div class="toggle-switch ${state.wakeWordEnabled ? 'active' : ''}" id="wakeToggle" onclick="window.app.toggleWakeWord()"></div>
        </div>

        <div class="setting-toggle">
          <span class="setting-toggle-label">Continuous Listening</span>
          <div class="toggle-switch ${state.continuousListening ? 'active' : ''}" id="contListenToggle" onclick="window.app.toggleContinuousListening()"></div>
        </div>

        <div class="setting-group" style="margin-top:24px;">
          <label>About</label>
          <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">
            <strong>Someone's Voice Assistant</strong><br>
            Free AI voice assistant powered by Google Gemini.<br>
            Your API key stays in your browser only.<br>
            <br>
            <i class="fas fa-heart" style="color:var(--red-soft);"></i> Built with love. Totally free to use.
          </p>
        </div>

        <button class="btn-primary" style="margin-top:16px;background:var(--bg-tertiary);border:1px solid var(--border-color);" onclick="window.app.logout()">
          <i class="fas fa-sign-out"></i> Logout / Clear Key
        </button>
      </div>
    `;

    createParticles();
  }

  // ============ PARTICLES ============
  function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (15 + Math.random() * 25) + 's';
      p.style.animationDelay = (-Math.random() * 20) + 's';
      p.style.width = (1 + Math.random() * 3) + 'px';
      p.style.height = p.style.width;
      container.appendChild(p);
    }
  }

  // ============ SETUP ============
  function startSetup() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) {
      showToast('Please enter your Gemini API key', 'error');
      return;
    }

    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Validating...';

    // Validate key
    fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, message: 'Hello! Please respond with just "ready".' })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        showToast('Invalid API key: ' + data.error, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-rocket"></i> Launch Assistant';
        return;
      }
      state.apiKey = key;
      localStorage.setItem('gemini_api_key', key);
      state.isSetup = true;
      showAssistant();
      showToast('Welcome! Assistant is ready 🎙️', 'success');
    })
    .catch(err => {
      showToast('Connection error: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-rocket"></i> Launch Assistant';
    });
  }

  function showAssistant() {
    document.getElementById('setupScreen').classList.add('hidden');
    document.getElementById('assistantView').style.display = 'flex';
    
    if (state.wakeWordEnabled) {
      startWakeWordListening();
    }

    // Focus input
    setTimeout(() => {
      document.getElementById('chatInput')?.focus();
    }, 500);
  }

  // ============ SPEECH RECOGNITION ============
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported');
      return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = 'en-US';
    state.recognition.maxAlternatives = 1;

    state.recognition.onresult = handleSpeechResult;
    state.recognition.onerror = handleSpeechError;
    state.recognition.onend = handleSpeechEnd;
  }

  function handleSpeechResult(event) {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    const fullTranscript = (finalTranscript || interimTranscript).toLowerCase().trim();

    // Wake word detection
    if (!state.wakeWordDetected && state.wakeWordEnabled && !state.isListening) {
      if (fullTranscript.includes(state.wakeWord.toLowerCase())) {
        state.wakeWordDetected = true;
        
        if (state.isStandby) {
          toggleStandby();
        }
        
        showToast('Wake word detected! Listening... 🎤', 'success');
        setStatus('listening', 'Listening...');
        state.isListening = true;
        updateMicUI(true);
        
        // Reset after getting the command
        setTimeout(() => {
          state.wakeWordDetected = false;
        }, 100);
        return;
      }
    }

    // If actively listening (after wake word or mic click)
    if (state.isListening && finalTranscript) {
      // Remove wake word from transcript
      let command = finalTranscript.trim();
      const wakeIdx = command.toLowerCase().indexOf(state.wakeWord.toLowerCase());
      if (wakeIdx !== -1) {
        command = command.substring(wakeIdx + state.wakeWord.length).trim();
      }

      if (command.length > 0) {
        stopListening();
        document.getElementById('chatInput').value = command;
        sendMessage();
      }
    }

    // Show interim transcript in input
    if (state.isListening && interimTranscript) {
      let display = interimTranscript;
      const wakeIdx = display.toLowerCase().indexOf(state.wakeWord.toLowerCase());
      if (wakeIdx !== -1) {
        display = display.substring(wakeIdx + state.wakeWord.length).trim();
      }
      document.getElementById('chatInput').value = display;
    }
  }

  function handleSpeechError(event) {
    if (event.error === 'no-speech' || event.error === 'aborted') {
      // Restart for continuous listening
      if (state.wakeWordEnabled && !state.isListening) {
        setTimeout(() => startWakeWordListening(), 500);
      }
      return;
    }
    console.error('Speech error:', event.error);
    if (state.isListening) {
      stopListening();
      showToast('Speech recognition error: ' + event.error, 'error');
    }
  }

  function handleSpeechEnd() {
    // Auto-restart for wake word detection
    if (state.wakeWordEnabled && state.isSetup && !state.isListening) {
      setTimeout(() => startWakeWordListening(), 300);
    }
    // Auto-restart if still actively listening
    if (state.isListening) {
      try {
        state.recognition.start();
      } catch(e) {}
    }
  }

  function startWakeWordListening() {
    if (!state.recognition || !state.wakeWordEnabled) return;
    try {
      state.recognition.start();
      setStatus('ready', `Listening for "${state.wakeWord}"`);
    } catch(e) {
      // Already running
    }
  }

  function toggleMic() {
    if (state.isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function startListening() {
    if (!state.recognition) {
      showToast('Speech recognition not supported in this browser. Try Chrome.', 'error');
      return;
    }

    state.isListening = true;
    state.wakeWordDetected = true; // Skip wake word when manually clicking mic
    updateMicUI(true);
    setStatus('listening', 'Listening...');

    try {
      state.recognition.stop();
    } catch(e) {}

    setTimeout(() => {
      try {
        state.recognition.start();
      } catch(e) {}
    }, 100);
  }

  function stopListening() {
    state.isListening = false;
    state.wakeWordDetected = false;
    updateMicUI(false);
    setStatus('ready', 'Ready');

    try {
      state.recognition.stop();
    } catch(e) {}

    // Restart wake word detection
    if (state.wakeWordEnabled) {
      setTimeout(() => startWakeWordListening(), 500);
    }
  }

  function updateMicUI(active) {
    const micBtn = document.getElementById('micBtn');
    const viz = document.getElementById('visualizer');
    if (micBtn) {
      micBtn.classList.toggle('active', active);
    }
    if (viz) {
      viz.classList.toggle('active', active);
    }
  }

  // ============ MESSAGE HANDLING ============
  async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message || state.isProcessing) return;

    input.value = '';
    
    // Remove welcome message
    const welcome = document.getElementById('welcomeMsg');
    if (welcome) welcome.remove();

    // Add user message to chat
    addChatMessage('user', message);

    // Determine intent
    const intent = detectIntent(message);
    
    state.isProcessing = true;
    setStatus('processing', 'Thinking...');
    addTypingIndicator();

    try {
      switch(intent.type) {
        case 'weather':
          await handleWeatherRequest(message);
          break;
        case 'news':
          await handleNewsRequest(message);
          break;
        case 'music':
          await handleMusicRequest(intent.query || message);
          break;
        case 'time':
          handleTimeRequest();
          break;
        case 'stop_music':
          stopMusic();
          removeTypingIndicator();
          addChatMessage('assistant', 'Music stopped! 🎵');
          break;
        default:
          await handleGeminiRequest(message);
      }
    } catch(err) {
      removeTypingIndicator();
      addChatMessage('assistant', 'Sorry, something went wrong: ' + err.message);
    }

    state.isProcessing = false;
    setStatus('ready', 'Ready');
  }

  function detectIntent(msg) {
    const lower = msg.toLowerCase();

    // Music
    const musicPatterns = [
      /play\s+(.+)/i,
      /put on\s+(.+)/i,
      /play me\s+(.+)/i,
      /play some\s+(.+)/i,
      /music[\s:]+(.+)/i,
      /song[\s:]+(.+)/i,
      /listen to\s+(.+)/i
    ];

    for (const pattern of musicPatterns) {
      const match = msg.match(pattern);
      if (match) {
        return { type: 'music', query: match[1].trim() };
      }
    }

    // Stop music
    if (lower.match(/stop\s*(the\s*)?(music|song|playing|audio)/)) {
      return { type: 'stop_music' };
    }
    if (lower.match(/pause\s*(the\s*)?(music|song|playing|audio)/)) {
      return { type: 'stop_music' };
    }

    // Weather
    if (lower.match(/weather|temperature|forecast|rain|sunny|cold|hot|humid/)) {
      return { type: 'weather' };
    }

    // News
    if (lower.match(/news|headlines|what'?s happening|current events|latest/)) {
      return { type: 'news' };
    }

    // Time
    if (lower.match(/^what('?s| is) the time|^time please|^tell me the time|^current time/)) {
      return { type: 'time' };
    }

    return { type: 'general' };
  }

  // ============ WEATHER ============
  async function handleWeatherRequest(message) {
    if (!state.location) {
      removeTypingIndicator();
      addChatMessage('assistant', 'I need your location to check the weather. Please allow location access and try again.');
      fetchLocation();
      return;
    }

    try {
      const resp = await fetch(`/api/weather?lat=${state.location.lat}&lon=${state.location.lon}`);
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      state.weather = data.weather;
      state.locationName = data.locationName;

      const current = data.weather.current;
      const daily = data.weather.daily;
      const code = current.weather_code;
      const wInfo = weatherCodes[code] || { icon: '🌡️', desc: 'Unknown' };

      removeTypingIndicator();

      // Create weather card HTML
      const forecastHtml = daily ? `
        <div class="weather-forecast">
          ${daily.time.slice(0, 3).map((day, i) => {
            const dayCode = daily.weather_code[i];
            const dInfo = weatherCodes[dayCode] || { icon: '🌡️' };
            const dayName = i === 0 ? 'Today' : new Date(day).toLocaleDateString('en', { weekday: 'short' });
            return `<div class="forecast-day">
              <div class="day-name">${dayName}</div>
              <div class="day-icon">${dInfo.icon}</div>
              <div class="day-temp">${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°</div>
            </div>`;
          }).join('')}
        </div>
      ` : '';

      const weatherHtml = `
        <div class="weather-card">
          <div class="weather-card-main">
            <div class="weather-card-icon">${wInfo.icon}</div>
            <div>
              <div class="weather-card-temp">${Math.round(current.temperature_2m)}°C</div>
              <div class="weather-card-detail">${wInfo.desc} • Feels like ${Math.round(current.apparent_temperature)}°C</div>
              <div class="weather-card-detail">💨 Wind: ${current.wind_speed_10m} km/h • 💧 Humidity: ${current.relative_humidity_2m}%</div>
              <div class="weather-card-detail" style="color:var(--red-soft);">📍 ${data.locationName}</div>
            </div>
          </div>
          ${forecastHtml}
        </div>
      `;

      const textResponse = `It's currently ${Math.round(current.temperature_2m)}°C in ${data.locationName}. ${wInfo.desc} with ${current.wind_speed_10m} km/h wind. Feels like ${Math.round(current.apparent_temperature)}°C.`;

      addChatMessage('assistant', textResponse + weatherHtml);
      speak(textResponse);

      // Update standby weather
      updateStandbyWeather();

    } catch(err) {
      removeTypingIndicator();
      addChatMessage('assistant', 'Sorry, couldn\'t fetch weather data: ' + err.message);
    }
  }

  // ============ NEWS ============
  async function handleNewsRequest(message) {
    try {
      const resp = await fetch('/api/news');
      const data = await resp.json();

      removeTypingIndicator();

      if (!data.articles || data.articles.length === 0) {
        addChatMessage('assistant', 'Sorry, couldn\'t fetch news right now. Try again later.');
        return;
      }

      const newsHtml = `
        <div class="news-card">
          ${data.articles.slice(0, 5).map(a => `
            <div class="news-item">
              <div>${a.title}</div>
              <div class="news-source">${a.source || 'News'} • ${a.pubDate ? new Date(a.pubDate).toLocaleDateString() : ''}</div>
            </div>
          `).join('')}
        </div>
      `;

      const headlines = data.articles.slice(0, 3).map(a => a.title).join('. ');
      const textResponse = `Here are the top headlines: ${headlines}`;

      addChatMessage('assistant', 'Here are the latest news headlines:' + newsHtml);
      speak(textResponse);

    } catch(err) {
      removeTypingIndicator();
      addChatMessage('assistant', 'Sorry, couldn\'t fetch news: ' + err.message);
    }
  }

  // ============ MUSIC ============
  async function handleMusicRequest(query) {
    try {
      removeTypingIndicator();
      addChatMessage('assistant', `🔍 Searching for "${query}"...`);
      addTypingIndicator();

      const resp = await fetch(`/api/youtube/search?q=${encodeURIComponent(query + ' audio')}`);
      const data = await resp.json();

      removeTypingIndicator();

      if (!data.results || data.results.length === 0) {
        addChatMessage('assistant', `Sorry, couldn't find any results for "${query}". Try a different search.`);
        speak(`Sorry, I couldn't find ${query}. Try something else.`);
        return;
      }

      // Show search results
      const resultsHtml = `
        <div class="search-results">
          ${data.results.map((r, i) => `
            <div class="search-result-item" onclick="window.app.playTrack('${r.id}', ${JSON.stringify(r.title).replace(/'/g, "\\'")} , '${(r.author || '').replace(/'/g, "\\'")}')">
              <div class="search-result-thumb">
                ${r.thumbnail ? `<img src="${r.thumbnail}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-music\\' style=\\'padding:10px;color:var(--red-matte)\\'></i>'">` : '<i class="fas fa-music" style="padding:10px;color:var(--red-matte)"></i>'}
              </div>
              <div class="search-result-info">
                <div class="search-result-title">${r.title}</div>
                <div class="search-result-artist">${r.author || 'Unknown'} • ${formatDuration(r.duration)}</div>
              </div>
              <i class="fas fa-play" style="color:var(--red-soft);font-size:12px;"></i>
            </div>
          `).join('')}
        </div>
      `;

      addChatMessage('assistant', `Found results for "${query}". Click to play:` + resultsHtml);

      // Auto-play first result
      const first = data.results[0];
      speak(`Playing ${first.title} by ${first.author || 'unknown artist'}.`);
      playTrack(first.id, first.title, first.author);

    } catch(err) {
      removeTypingIndicator();
      addChatMessage('assistant', 'Sorry, music search failed: ' + err.message);
    }
  }

  async function playTrack(videoId, title, author) {
    try {
      showMusicPlayer(title || 'Loading...', author || '');
      setPlayPauseIcon(false); // show loading

      const resp = await fetch(`/api/youtube/stream?id=${videoId}`);
      const data = await resp.json();

      if (data.error || !data.audioUrl) {
        // Fallback: embed as youtube iframe audio
        showToast('Direct streaming unavailable. Using alternate method...', 'error');
        // Try cobalt API as fallback
        try {
          const cobaltResp = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ url: `https://youtube.com/watch?v=${videoId}`, isAudioOnly: true })
          });
          const cobaltData = await cobaltResp.json();
          if (cobaltData.url) {
            state.audioPlayer.src = cobaltData.url;
            state.audioPlayer.play();
            state.currentTrack = { id: videoId, title: title || data.title, author: author || data.author };
            state.isPlaying = true;
            setPlayPauseIcon(true);
            showMusicPlayer(title || data.title || 'Unknown', author || data.author || '');
            return;
          }
        } catch(e) {}

        showToast('Could not play this track. Try another one.', 'error');
        return;
      }

      state.audioPlayer.src = data.audioUrl;
      state.audioPlayer.crossOrigin = 'anonymous';
      
      try {
        await state.audioPlayer.play();
      } catch(e) {
        // Might need user interaction
        showToast('Click play to start music (browser requires interaction)', 'error');
      }

      state.currentTrack = { id: videoId, title: data.title || title, author: data.author || author };
      state.isPlaying = true;
      setPlayPauseIcon(true);
      showMusicPlayer(data.title || title || 'Unknown', data.author || author || '');

      if (data.thumbnail) {
        const thumb = document.getElementById('musicThumb');
        if (thumb) thumb.innerHTML = `<img src="${data.thumbnail}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-music\\'></i>'">`;
      }

    } catch(err) {
      showToast('Error playing track: ' + err.message, 'error');
    }
  }

  function togglePlayPause() {
    if (!state.audioPlayer.src) return;
    if (state.isPlaying) {
      state.audioPlayer.pause();
      state.isPlaying = false;
    } else {
      state.audioPlayer.play();
      state.isPlaying = true;
    }
    setPlayPauseIcon(state.isPlaying);
  }

  function setPlayPauseIcon(playing) {
    const btn = document.getElementById('playPauseBtn');
    if (btn) btn.innerHTML = `<i class="fas fa-${playing ? 'pause' : 'play'}"></i>`;
  }

  function stopMusic() {
    state.audioPlayer.pause();
    state.audioPlayer.src = '';
    state.isPlaying = false;
    state.currentTrack = null;
    setPlayPauseIcon(false);
    const player = document.getElementById('musicPlayer');
    if (player) player.classList.remove('visible');
  }

  function showMusicPlayer(title, artist) {
    const player = document.getElementById('musicPlayer');
    if (player) player.classList.add('visible');
    const titleEl = document.getElementById('musicTitle');
    const artistEl = document.getElementById('musicArtist');
    if (titleEl) titleEl.textContent = title;
    if (artistEl) artistEl.textContent = artist || '--';
  }

  function updateMusicProgress() {
    const fill = document.getElementById('musicProgressFill');
    const curTime = document.getElementById('musicCurrentTime');
    const durTime = document.getElementById('musicDuration');

    if (!fill || !state.audioPlayer.duration) return;

    const pct = (state.audioPlayer.currentTime / state.audioPlayer.duration) * 100;
    fill.style.width = pct + '%';
    curTime.textContent = formatTime(state.audioPlayer.currentTime);
    durTime.textContent = formatTime(state.audioPlayer.duration);
  }

  function seekMusic(event) {
    const bar = document.getElementById('musicProgressBar');
    if (!bar || !state.audioPlayer.duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width;
    state.audioPlayer.currentTime = pct * state.audioPlayer.duration;
  }

  function onTrackEnd() {
    state.isPlaying = false;
    setPlayPauseIcon(false);
  }

  function musicPrev() {
    if (state.audioPlayer.currentTime > 3) {
      state.audioPlayer.currentTime = 0;
    }
  }

  function musicNext() {
    // Could implement queue - for now restart
    onTrackEnd();
  }

  // ============ GEMINI AI ============
  async function handleGeminiRequest(message) {
    try {
      // Add context
      const now = new Date();
      const timeContext = `[Current time: ${now.toLocaleString()}. User location: ${state.locationName || 'unknown'}]`;
      const fullMessage = timeContext + ' ' + message;

      const resp = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: state.apiKey,
          message: fullMessage,
          history: state.geminiHistory.slice(-10) // Keep last 10 exchanges
        })
      });

      const data = await resp.json();
      removeTypingIndicator();

      if (data.error) {
        addChatMessage('assistant', 'Error: ' + data.error);
        return;
      }

      // Store in history
      state.geminiHistory.push({ role: 'user', parts: [{ text: message }] });
      state.geminiHistory.push({ role: 'model', parts: [{ text: data.response }] });

      // Format response
      const formatted = formatMarkdown(data.response);
      addChatMessage('assistant', formatted);
      speak(data.response.replace(/[*#`_]/g, '').replace(/\[.*?\]/g, ''));

    } catch(err) {
      removeTypingIndicator();
      addChatMessage('assistant', 'Sorry, I encountered an error: ' + err.message);
    }
  }

  function handleTimeRequest() {
    removeTypingIndicator();
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    addChatMessage('assistant', `🕐 The current time is <strong>${time}</strong><br>📅 ${date}`);
    speak(`The current time is ${time}. Today is ${date}.`);
  }

  // ============ QUICK ACTIONS ============
  function quickAction(type) {
    const actions = {
      weather: 'What\'s the weather like?',
      news: 'Tell me the latest news',
      music: 'Play some relaxing lo-fi music',
      time: 'What time is it?',
      joke: 'Tell me a funny joke'
    };
    document.getElementById('chatInput').value = actions[type] || '';
    sendMessage();
  }

  // ============ CHAT UI ============
  function addChatMessage(role, content) {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role}`;
    msgDiv.innerHTML = `
      <div class="avatar">
        ${role === 'assistant' ? '🎙️' : '<i class="fas fa-user" style="font-size:12px;"></i>'}
      </div>
      <div class="bubble">${content}</div>
    `;

    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;

    state.chatHistory.push({ role, content });
  }

  function addTypingIndicator() {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;

    // Remove existing typing indicator
    removeTypingIndicator();

    const div = document.createElement('div');
    div.className = 'chat-msg assistant';
    div.id = 'typingIndicator';
    div.innerHTML = `
      <div class="avatar">🎙️</div>
      <div class="bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
  }

  // ============ TEXT-TO-SPEECH ============
  function speak(text) {
    if (!state.ttsEnabled || !state.synth) return;

    // Cancel any ongoing speech
    state.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to find a good voice
    const voices = state.synth.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
                     voices.find(v => v.lang.startsWith('en') && v.localService) ||
                     voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      state.isSpeaking = true;
      setStatus('speaking', 'Speaking...');
    };
    utterance.onend = () => {
      state.isSpeaking = false;
      setStatus('ready', 'Ready');
      // Resume listening after speaking
      if (state.continuousListening && state.isSetup) {
        startListening();
      }
    };

    state.synth.speak(utterance);
  }

  // ============ LOCATION ============
  function fetchLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.location = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          // Fetch initial weather for standby
          fetchWeatherForStandby();
        },
        (err) => {
          console.warn('Location error:', err.message);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }

  async function fetchWeatherForStandby() {
    if (!state.location) return;
    try {
      const resp = await fetch(`/api/weather?lat=${state.location.lat}&lon=${state.location.lon}`);
      const data = await resp.json();
      if (!data.error) {
        state.weather = data.weather;
        state.locationName = data.locationName;
        updateStandbyWeather();
      }
    } catch(e) {}
  }

  function updateStandbyWeather() {
    const container = document.getElementById('standbyWeather');
    if (!container || !state.weather) return;

    const current = state.weather.current;
    const code = current.weather_code;
    const wInfo = weatherCodes[code] || { icon: '🌡️', desc: 'Unknown' };

    container.style.display = 'flex';
    container.innerHTML = `
      <div class="standby-weather-icon">${wInfo.icon}</div>
      <div>
        <div class="standby-weather-temp">${Math.round(current.temperature_2m)}°</div>
        <div class="standby-weather-desc">${wInfo.desc}</div>
        <div class="standby-weather-loc">📍 ${state.locationName}</div>
      </div>
    `;
  }

  // ============ STANDBY MODE ============
  function toggleStandby() {
    state.isStandby = !state.isStandby;
    const screen = document.getElementById('standbyScreen');
    if (!screen) return;

    if (state.isStandby) {
      screen.classList.add('active');
      updateStandbyWeather();
      updateStandbyClock();
      state.standbyTimer = setInterval(updateStandbyClock, 1000);
      // Keep wake word listening
      if (state.wakeWordEnabled) {
        startWakeWordListening();
      }
    } else {
      screen.classList.remove('active');
      if (state.standbyTimer) {
        clearInterval(state.standbyTimer);
        state.standbyTimer = null;
      }
    }
  }

  function handleStandbyClick(event) {
    // Don't exit on button clicks
    if (event.target.closest('.standby-controls') || event.target.closest('.standby-ctrl-btn')) return;
    // Double-click to exit
  }

  function updateStandbyClock() {
    const container = document.getElementById('standbyClockContainer');
    if (!container) return;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const secStr = String(seconds).padStart(2, '0');
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    switch(state.clockStyle) {
      case 'digital':
        container.innerHTML = `
          <div class="standby-clock clock-digital">
            <div class="clock-time">${timeStr}</div>
            <div class="clock-seconds">:${secStr}</div>
            <div class="clock-date">${dateStr}</div>
          </div>
        `;
        break;

      case 'minimal':
        container.innerHTML = `
          <div class="standby-clock clock-minimal">
            <div class="clock-time">${timeStr}</div>
            <div class="clock-date">${dateStr}</div>
          </div>
        `;
        break;

      case 'neon':
        container.innerHTML = `
          <div class="standby-clock clock-neon">
            <div class="clock-time">${timeStr}:${secStr}</div>
            <div class="clock-date">${dateStr}</div>
          </div>
        `;
        break;

      case 'analog':
        const hourDeg = (hours % 12) * 30 + minutes * 0.5;
        const minDeg = minutes * 6 + seconds * 0.1;
        const secDeg = seconds * 6;

        let markers = '';
        for (let i = 0; i < 12; i++) {
          markers += `<div class="marker ${i % 3 === 0 ? 'major' : ''}" style="transform: translateX(-50%) rotate(${i * 30}deg);"></div>`;
        }

        container.innerHTML = `
          <div class="clock-analog-container">
            <div class="analog-clock">
              ${markers}
              <div class="hand hour-hand" style="transform: rotate(${hourDeg}deg);"></div>
              <div class="hand minute-hand" style="transform: rotate(${minDeg}deg);"></div>
              <div class="hand second-hand" style="transform: rotate(${secDeg}deg);"></div>
              <div class="center-dot"></div>
            </div>
            <div class="analog-date">${dateStr}</div>
          </div>
        `;
        break;
    }
  }

  function cycleClockStyle() {
    const styles = ['digital', 'minimal', 'neon', 'analog'];
    const idx = styles.indexOf(state.clockStyle);
    state.clockStyle = styles[(idx + 1) % styles.length];
    localStorage.setItem('clock_style', state.clockStyle);
    updateStandbyClock();

    // Update settings select
    const sel = document.getElementById('clockStyleSelect');
    if (sel) sel.value = state.clockStyle;

    showToast(`Clock: ${state.clockStyle}`, 'success');
  }

  function setClockStyle(style) {
    state.clockStyle = style;
    localStorage.setItem('clock_style', style);
    if (state.isStandby) updateStandbyClock();
  }

  // ============ SETTINGS ============
  function toggleSettings() {
    state.settingsOpen = !state.settingsOpen;
    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsOverlay');
    if (panel) panel.classList.toggle('open', state.settingsOpen);
    if (overlay) overlay.classList.toggle('open', state.settingsOpen);
  }

  function updateApiKey(key) {
    state.apiKey = key.trim();
    localStorage.setItem('gemini_api_key', state.apiKey);
    showToast('API key updated', 'success');
  }

  function updateWakeWord(word) {
    state.wakeWord = word.trim().toLowerCase();
    const standbyWord = document.getElementById('standbyWakeWord');
    if (standbyWord) standbyWord.textContent = state.wakeWord;
    showToast(`Wake word set to "${state.wakeWord}"`, 'success');
  }

  function toggleTTS() {
    state.ttsEnabled = !state.ttsEnabled;
    localStorage.setItem('tts_enabled', state.ttsEnabled);
    const toggle = document.getElementById('ttsToggle');
    if (toggle) toggle.classList.toggle('active', state.ttsEnabled);
  }

  function toggleWakeWord() {
    state.wakeWordEnabled = !state.wakeWordEnabled;
    const toggle = document.getElementById('wakeToggle');
    if (toggle) toggle.classList.toggle('active', state.wakeWordEnabled);

    if (state.wakeWordEnabled) {
      startWakeWordListening();
    } else {
      try { state.recognition?.stop(); } catch(e) {}
    }
  }

  function toggleContinuousListening() {
    state.continuousListening = !state.continuousListening;
    const toggle = document.getElementById('contListenToggle');
    if (toggle) toggle.classList.toggle('active', state.continuousListening);
  }

  function logout() {
    localStorage.removeItem('gemini_api_key');
    state.apiKey = '';
    state.isSetup = false;
    location.reload();
  }

  // ============ UTILITY ============
  function setStatus(type, text) {
    const dot = document.getElementById('statusDot');
    const label = document.getElementById('statusText');
    if (dot) {
      dot.className = 'status-dot';
      if (type === 'listening') dot.classList.add('listening');
      if (type === 'processing') dot.classList.add('processing');
    }
    if (label) label.textContent = text;
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatMarkdown(text) {
    return text
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'error' ? 'circle-exclamation' : type === 'success' ? 'circle-check' : 'circle-info'}"></i>
      ${message}
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============ EXPOSE API ============
  window.app = {
    startSetup,
    sendMessage,
    toggleMic,
    toggleStandby,
    handleStandbyClick,
    toggleSettings,
    togglePlayPause,
    stopMusic,
    seekMusic,
    musicPrev,
    musicNext,
    playTrack,
    quickAction,
    cycleClockStyle,
    setClockStyle,
    updateApiKey,
    updateWakeWord,
    toggleTTS,
    toggleWakeWord,
    toggleContinuousListening,
    logout
  };

  // ============ START ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Load voices (some browsers load async)
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

})();
