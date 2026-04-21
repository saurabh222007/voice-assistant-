// ============================================
// SOMEONE'S VOICE ASSISTANT v2.0 - Enhanced
// ============================================
(function() {
  'use strict';

  const VERSION = '2.0.0';

  const state = {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    isSetup: false, isListening: false, isProcessing: false,
    isSpeaking: false, isStandby: false,
    wakeWordEnabled: true, wakeWord: 'hey assistant',
    clockStyle: localStorage.getItem('clock_style') || 'digital',
    ttsEnabled: localStorage.getItem('tts_enabled') !== 'false',
    ttsVoice: localStorage.getItem('tts_voice') || 'default',
    chatHistory: [], geminiHistory: [],
    weather: null, location: null, locationName: '',
    musicQueue: [], currentTrack: null, isPlaying: false,
    recognition: null, audioPlayer: new Audio(),
    synth: window.speechSynthesis, standbyTimer: null,
    continuousListening: false, wakeWordDetected: false,
    settingsOpen: false, reducedMotion: localStorage.getItem('reduced_motion') === 'true',
    volume: parseFloat(localStorage.getItem('volume') || '0.8'),
    isOnline: true, lastWakeTime: 0, userInteracted: false
  };

  const fusionClockData = {
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  };

  state.audioPlayer.volume = state.volume;

  const weatherCodes = {
    0:{icon:'☀️',desc:'Clear sky'},1:{icon:'🌤️',desc:'Mainly clear'},2:{icon:'⛅',desc:'Partly cloudy'},
    3:{icon:'☁️',desc:'Overcast'},45:{icon:'🌫️',desc:'Foggy'},48:{icon:'🌫️',desc:'Rime fog'},
    51:{icon:'🌦️',desc:'Light drizzle'},53:{icon:'🌦️',desc:'Moderate drizzle'},55:{icon:'🌧️',desc:'Dense drizzle'},
    61:{icon:'🌧️',desc:'Slight rain'},63:{icon:'🌧️',desc:'Moderate rain'},65:{icon:'🌧️',desc:'Heavy rain'},
    71:{icon:'🌨️',desc:'Slight snow'},73:{icon:'🌨️',desc:'Moderate snow'},75:{icon:'❄️',desc:'Heavy snow'},
    77:{icon:'🌨️',desc:'Snow grains'},80:{icon:'🌦️',desc:'Rain showers'},81:{icon:'🌧️',desc:'Moderate showers'},
    82:{icon:'⛈️',desc:'Violent showers'},85:{icon:'🌨️',desc:'Snow showers'},86:{icon:'🌨️',desc:'Heavy snow showers'},
    95:{icon:'⛈️',desc:'Thunderstorm'},96:{icon:'⛈️',desc:'Thunderstorm + hail'},99:{icon:'⛈️',desc:'Thunderstorm + heavy hail'}
  };

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  function timeStr() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // ============ INIT ============
  function init() {
    renderApp();
    initSpeechRecognition();
    fetchLocation();
    checkConnection();
    setInterval(checkConnection, 30000);

    if (state.apiKey) { state.isSetup = true; showAssistant(); }
    
    // Satisfy browser security: First user click enables audio/mic context
    document.addEventListener('click', () => {
      if (!state.userInteracted) {
        state.userInteracted = true;
        if (state.isSetup && state.wakeWordEnabled && !state.isListening) {
          startWakeWordListening();
        }
      }
    }, { once: true });

    state.audioPlayer.addEventListener('timeupdate', updateMusicProgress);
    state.audioPlayer.addEventListener('ended', onTrackEnd);
    state.audioPlayer.addEventListener('playing', () => {
      state.isPlaying = true; setPlayPauseIcon(true);
      const t = document.getElementById('musicThumb');
      if (t) t.classList.add('spinning');
    });
    state.audioPlayer.addEventListener('pause', () => {
      const t = document.getElementById('musicThumb');
      if (t) t.classList.remove('spinning');
    });
    state.audioPlayer.addEventListener('error', (e) => {
      const err = state.audioPlayer.error;
      let msg = 'Unknown';
      if (err) {
        if (err.code === 1) msg = 'Aborted';
        else if (err.code === 2) msg = 'Network Error';
        else if (err.code === 3) msg = 'Decode Error';
        else if (err.code === 4) msg = 'Source Not Supported';
      }
      logDebug(`Audio Player Error [Code ${err?.code || '?'}]: ${msg}`);
      showToast('Music playback error', 'error');
    });
  }

  async function checkConnection() {
    try {
      const r = await fetch('/', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      state.isOnline = r.ok;
    } catch { state.isOnline = false; }
    const dot = document.getElementById('statusDot');
    if (dot && !state.isListening && !state.isProcessing) {
      dot.classList.toggle('offline', !state.isOnline);
    }
  }

  // ============ RENDER ============
  function renderApp() {
    const root = document.getElementById('react-root') || document.getElementById('app');
    if (!root) return;
    root.id = 'app';

    const voices = state.synth ? state.synth.getVoices().filter(v => v.lang.startsWith('en')) : [];
    const voiceOptions = voices.map(v => `<option value="${v.name}" ${state.ttsVoice === v.name ? 'selected' : ''}>${v.name.substring(0, 30)}</option>`).join('');

    root.innerHTML = `
      <div class="bg-animation"><div class="bg-orb"></div><div class="bg-orb"></div><div class="bg-orb"></div></div>
      <div class="particles-container" id="particles"></div>
      <div class="toast-container" id="toastContainer"></div>
      <div class="debug-console" id="debugConsole"></div>

      <!-- Setup Screen -->
      <div class="setup-screen" id="setupScreen">
        <div class="setup-card">
          <div class="logo-icon">🎙️</div>
          <h1>Someone's Voice Assistant</h1>
          <p>A free AI-powered voice assistant. Enter your Gemini API key to get started. Your key stays in your browser only.</p>
          <div class="api-input-group">
            <i class="fas fa-key"></i>
            <input type="password" class="api-input" id="apiKeyInput" placeholder="Enter your Gemini API key..." value="${state.apiKey}">
          </div>
          <button class="btn-primary" id="startBtn" onclick="window.app.startSetup()">
            <i class="fas fa-rocket"></i> Launch Assistant
          </button>
          <div class="api-help">
            <p>🔑 Get your free API key from <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a></p>
            <p style="margin-top:8px;">🔒 Your key never leaves your browser.</p>
          </div>
          <div class="copyright">Made with <span class="heart">❤️</span> by <strong>Someone</strong></div>
        </div>
      </div>

      <!-- Main Assistant View -->
      <div class="assistant-view" id="assistantView" style="display:none;">
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
            <button class="top-btn" id="clearChatBtn" onclick="window.app.clearChat()" title="Clear Chat"><i class="fas fa-trash-can"></i></button>
            <button class="top-btn" id="standbyBtn" onclick="window.app.toggleStandby()" title="Standby"><i class="fas fa-moon"></i></button>
            <button class="top-btn" id="settingsBtn" onclick="window.app.toggleSettings()" title="Settings"><i class="fas fa-gear"></i></button>
          </div>
        </div>

        <div class="chat-area" id="chatArea">
          <div class="welcome-msg" id="welcomeMsg">
            <div class="welcome-orb">🎙️</div>
            <h2>${getGreeting()}! 👋</h2>
            <p>I'm Someone's Voice Assistant. Ask me anything, request music, or check the weather and news!</p>
            <div class="wake-word-hint"><i class="fas fa-microphone"></i> Say <kbd>${state.wakeWord}</kbd> or click the mic to start</div>
          </div>
        </div>

        <div class="music-player" id="musicPlayer">
          <div class="music-player-inner">
            <div class="music-thumb" id="musicThumb"><i class="fas fa-music"></i></div>
            <div class="music-info">
              <div class="music-title" id="musicTitle">No track playing</div>
              <div class="music-artist" id="musicArtist">--</div>
            </div>
            <div class="music-controls">
              <button class="music-ctrl-btn" onclick="window.app.musicPrev()"><i class="fas fa-backward-step"></i></button>
              <button class="music-ctrl-btn play-pause" id="playPauseBtn" onclick="window.app.togglePlayPause()"><i class="fas fa-play"></i></button>
              <button class="music-ctrl-btn" onclick="window.app.musicNext()"><i class="fas fa-forward-step"></i></button>
              <button class="music-ctrl-btn" onclick="window.app.stopMusic()"><i class="fas fa-stop"></i></button>
            </div>
          </div>
          <div class="music-progress">
            <span class="music-time" id="musicCurrentTime">0:00</span>
            <div class="music-progress-bar" id="musicProgressBar" onclick="window.app.seekMusic(event)"><div class="music-progress-fill" id="musicProgressFill"></div></div>
            <span class="music-time" id="musicDuration">0:00</span>
          </div>
          <div class="volume-control">
            <span class="volume-icon" onclick="window.app.toggleMute()"><i class="fas fa-volume-high" id="volumeIcon"></i></span>
            <input type="range" class="volume-slider" id="volumeSlider" min="0" max="1" step="0.05" value="${state.volume}" oninput="window.app.setVolume(this.value)">
          </div>
        </div>

        <div class="input-bar">
          <div class="input-container">
            <button class="input-btn mic-btn" id="micBtn" onclick="window.app.toggleMic()"><i class="fas fa-microphone"></i></button>
            <input type="text" id="chatInput" placeholder="Ask me anything..." onkeydown="if(event.key==='Enter')window.app.sendMessage()">
            <div class="voice-visualizer" id="visualizer"><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div></div>
            <button class="input-btn send-btn" id="sendBtn" onclick="window.app.sendMessage()"><i class="fas fa-paper-plane"></i></button>
          </div>
          <div class="quick-actions">
            <button class="quick-action" onclick="window.app.quickAction('weather')"><i class="fas fa-cloud-sun"></i> Weather</button>
            <button class="quick-action" onclick="window.app.quickAction('news')"><i class="fas fa-newspaper"></i> News</button>
            <button class="quick-action" onclick="window.app.quickAction('music')"><i class="fas fa-music"></i> Play Music</button>
            <button class="quick-action" onclick="window.app.quickAction('time')"><i class="fas fa-clock"></i> Time</button>
            <button class="quick-action" onclick="window.app.quickAction('joke')"><i class="fas fa-face-laugh"></i> Joke</button>
          </div>
        </div>
      </div>

      <!-- Standby Screen -->
      <div class="standby-screen" id="standbyScreen" onclick="window.app.handleStandbyClick(event)">
        <div id="standbyClockContainer"></div>
        <div class="standby-weather" id="standbyWeather" style="display:none;"></div>
        <div class="standby-music" id="standbyMusic">
          <span class="standby-music-title" id="standbyMusicTitle"></span>
          <button class="standby-music-btn" onclick="event.stopPropagation();window.app.togglePlayPause()"><i class="fas fa-pause" id="standbyPlayIcon"></i></button>
          <button class="standby-music-btn" onclick="event.stopPropagation();window.app.stopMusic()"><i class="fas fa-stop"></i></button>
        </div>
        <div class="standby-wake-indicator"><div class="dot"></div><span>Listening for "<span id="standbyWakeWord">${state.wakeWord}</span>"</span></div>
        <div class="standby-controls">
          <button class="standby-ctrl-btn" onclick="event.stopPropagation();window.app.cycleClockStyle()"><i class="fas fa-clock"></i> Clock Style</button>
          <button class="standby-ctrl-btn" onclick="event.stopPropagation();window.app.toggleStandby()"><i class="fas fa-arrow-left"></i> Exit</button>
        </div>
      </div>

      <!-- Settings Panel -->
      <div class="settings-overlay" id="settingsOverlay" onclick="window.app.toggleSettings()"></div>
      <div class="settings-panel" id="settingsPanel">
        <div class="settings-header">
          <h3><i class="fas fa-gear"></i> Settings</h3>
          <button class="settings-close" onclick="window.app.toggleSettings()"><i class="fas fa-times"></i></button>
        </div>
        <div class="setting-group">
          <label>Gemini API Key</label>
          <input type="password" class="api-input" id="settingsApiKey" value="${state.apiKey}" style="border-radius:10px;padding-left:14px;width:100%;font-family:'JetBrains Mono',monospace;font-size:0.85rem;" onchange="window.app.updateApiKey(this.value)">
        </div>
        <div class="setting-group">
          <label>Wake Word</label>
          <input type="text" id="wakeWordInput" value="${state.wakeWord}" onchange="window.app.updateWakeWord(this.value)">
        </div>
        <div class="setting-group">
          <div class="setting-toggle">
            <span class="setting-toggle-label">Show Debug Console</span>
            <div class="toggle-switch ${localStorage.getItem('debug_mode') === 'true' ? 'active' : ''}" onclick="window.app.toggleDebugMode()"></div>
          </div>
        </div>
        <div class="setting-group">
          <label>Clock Style (Standby)</label>
          <select id="clockStyleSelect" onchange="window.app.setClockStyle(this.value)">
            <option value="digital" ${state.clockStyle==='digital'?'selected':''}>Digital</option>
            <option value="minimal" ${state.clockStyle==='minimal'?'selected':''}>Minimal</option>
            <option value="neon" ${state.clockStyle==='neon'?'selected':''}>Neon</option>
            <option value="analog" ${state.clockStyle==='analog'?'selected':''}>Analog</option>
            <option value="fusion" ${state.clockStyle==='fusion'?'selected':''}>Fusion ✨</option>
            <option value="aurora" ${state.clockStyle==='aurora'?'selected':''}>Aurora ✨</option>
          </select>
        </div>
        <div class="setting-group">
          <label>TTS Voice</label>
          <select id="voiceSelect" onchange="window.app.setVoice(this.value)">
            <option value="default">System Default</option>
            ${voiceOptions}
          </select>
        </div>
        <div class="setting-toggle">
          <span class="setting-toggle-label">Text-to-Speech</span>
          <div class="toggle-switch ${state.ttsEnabled?'active':''}" id="ttsToggle" onclick="window.app.toggleTTS()"></div>
        </div>
        <div class="setting-toggle">
          <span class="setting-toggle-label">Wake Word Detection</span>
          <div class="toggle-switch ${state.wakeWordEnabled?'active':''}" id="wakeToggle" onclick="window.app.toggleWakeWord()"></div>
        </div>
        <div class="setting-toggle">
          <span class="setting-toggle-label">Continuous Listening</span>
          <div class="toggle-switch ${state.continuousListening?'active':''}" id="contListenToggle" onclick="window.app.toggleContinuousListening()"></div>
        </div>
        <div class="setting-toggle">
          <span class="setting-toggle-label">Reduced Motion</span>
          <div class="toggle-switch ${state.reducedMotion?'active':''}" id="motionToggle" onclick="window.app.toggleMotion()"></div>
        </div>
        <div class="setting-group" style="margin-top:24px;">
          <label>About</label>
          <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">
            <strong>Someone's Voice Assistant</strong><br>
            Free AI voice assistant powered by Google Gemini.<br>
            Your API key stays in your browser only.<br><br>
            Made with <span style="color:#e74c3c;">❤️</span> by <strong style="color:var(--gold-accent);">Someone</strong><br>
            <span style="font-size:0.75rem;color:var(--text-muted);">© ${new Date().getFullYear()} All rights reserved.</span>
          </p>
        </div>
        <div class="version-info">
          <div class="ver-label">Version</div>
          <div class="ver-num">v${VERSION}</div>
        </div>
        <button class="btn-primary" style="margin-top:16px;background:var(--bg-tertiary);border:1px solid var(--border-color);" onclick="window.app.logout()">
          <i class="fas fa-sign-out"></i> Logout / Clear Key
        </button>
      </div>
    `;

    if (!state.reducedMotion) createParticles();
  }

  function createParticles() {
    const c = document.getElementById('particles');
    if (!c) return;
    for (let i = 0; i < 25; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random()*100+'%';
      p.style.animationDuration = (18+Math.random()*25)+'s';
      p.style.animationDelay = (-Math.random()*20)+'s';
      p.style.width = (1+Math.random()*2.5)+'px';
      p.style.height = p.style.width;
      c.appendChild(p);
    }
  }

  // ============ SETUP ============
  function startSetup() {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) { showToast('Please enter your Gemini API key', 'error'); return; }

    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Validating...';

    fetch('/api/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, message: 'Hello! Respond with just "ready".' })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) { showToast('API Error: ' + data.error, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Launch Assistant'; return; }
      if (!data.response) { showToast('Unexpected response. Check your API key.', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Launch Assistant'; return; }
      state.apiKey = key;
      localStorage.setItem('gemini_api_key', key);
      state.isSetup = true;
      showAssistant();
      showToast(`${getGreeting()}! Assistant is ready 🎙️`, 'success');
    })
    .catch(err => { showToast('Connection error: ' + err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Launch Assistant'; });
  }

  function showAssistant() {
    document.getElementById('setupScreen').classList.add('hidden');
    document.getElementById('assistantView').style.display = 'flex';
    
    // Only start if user has already interacted, otherwise wait for first click
    if (state.wakeWordEnabled && state.userInteracted) {
      startWakeWordListening();
    } else if (state.wakeWordEnabled) {
      setStatus('ready', 'Click anywhere to enable microphone');
    }
    
    setTimeout(() => document.getElementById('chatInput')?.focus(), 500);
  }

  // ============ SPEECH RECOGNITION ============
  function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    state.recognition = new SR();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = 'en-US';
    state.recognition.maxAlternatives = 1;
    state.recognition.onresult = handleSpeechResult;
    state.recognition.onerror = handleSpeechError;
    state.recognition.onend = handleSpeechEnd;
  }

  function logDebug(msg, type = 'error') {
    const console = document.getElementById('debugConsole');
    if (!console) return;
    const line = document.createElement('div');
    line.className = `debug-line ${type}`;
    line.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.prepend(line);
    if (localStorage.getItem('debug_mode') === 'true') console.classList.add('visible');
    console.error(`DEBUG [${type}]: ${msg}`);
  }

  function handleSpeechResult(event) {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t; else interim += t;
    }
    const full = (final || interim).toLowerCase().trim();

    // Wake word detection with debounce
    if (!state.wakeWordDetected && state.wakeWordEnabled && !state.isListening) {
      if (full.includes(state.wakeWord.toLowerCase())) {
        const now = Date.now();
        if (now - state.lastWakeTime < 2000) return; // debounce
        state.lastWakeTime = now;
        state.wakeWordDetected = true;
        if (state.isStandby) toggleStandby();
        showToast('Wake word detected! Listening... 🎤', 'success');
        setStatus('listening', 'Listening...');
        state.isListening = true;
        updateMicUI(true);
        setTimeout(() => { state.wakeWordDetected = false; }, 100);
        return;
      }
    }

    if (state.isListening && final) {
      let command = final.trim();
      const wIdx = command.toLowerCase().indexOf(state.wakeWord.toLowerCase());
      if (wIdx !== -1) command = command.substring(wIdx + state.wakeWord.length).trim();
      if (command.length > 0) { stopListening(); document.getElementById('chatInput').value = command; sendMessage(); }
    }

    if (state.isListening && interim) {
      let display = interim;
      const wIdx = display.toLowerCase().indexOf(state.wakeWord.toLowerCase());
      if (wIdx !== -1) display = display.substring(wIdx + state.wakeWord.length).trim();
      document.getElementById('chatInput').value = display;
    }
  }

  function handleSpeechError(e) {
    logDebug(`Speech error: ${e.error}`);
    if (e.error === 'no-speech' || e.error === 'aborted') {
      if (state.wakeWordEnabled && !state.isListening && state.userInteracted) {
        setTimeout(() => startWakeWordListening(), 500);
      }
      return;
    }
    
    if (e.error === 'not-allowed') {
      showToast('Microphone access denied. Please enable it in browser settings.', 'error');
      state.wakeWordEnabled = false;
      const toggle = document.getElementById('wakeToggle');
      if (toggle) toggle.classList.remove('active');
    } else if (e.error === 'network') {
      showToast('Speech recognition network error.', 'error');
    }
    
    if (state.isListening) { stopListening(); }
    setStatus('ready', 'Speech discovery paused');
  }

  function handleSpeechEnd() {
    if (state.wakeWordEnabled && state.isSetup && !state.isListening && state.userInteracted) {
      setTimeout(() => startWakeWordListening(), 300);
    }
    if (state.isListening) { try { state.recognition.start(); } catch(err) {} }
  }

  function startWakeWordListening() {
    if (!state.recognition || !state.wakeWordEnabled || !state.userInteracted) return;
    try { 
      state.recognition.start(); 
      setStatus('ready', `Listening for "${state.wakeWord}"`); 
    } catch(err) {
      // Recognition usually already started or starting
    }
  }

  function toggleMic() { state.isListening ? stopListening() : startListening(); }

  function startListening() {
    if (!state.recognition) { showToast('Speech recognition not supported. Try Chrome.', 'error'); return; }
    state.isListening = true; state.wakeWordDetected = true;
    updateMicUI(true); setStatus('listening', 'Listening...');
    try { state.recognition.stop(); } catch(e) {}
    setTimeout(() => { try { state.recognition.start(); } catch(e) {} }, 100);
  }

  function stopListening() {
    state.isListening = false; state.wakeWordDetected = false;
    updateMicUI(false); setStatus('ready', 'Ready');
    try { state.recognition.stop(); } catch(e) {}
    if (state.wakeWordEnabled) setTimeout(() => startWakeWordListening(), 500);
  }

  function updateMicUI(active) {
    const m = document.getElementById('micBtn'), v = document.getElementById('visualizer');
    if (m) m.classList.toggle('active', active);
    if (v) v.classList.toggle('active', active);
  }

  // ============ MESSAGES ============
  async function sendMessage(overrideText=null) {
    const input = document.getElementById('chatInput');
    const message = overrideText || input.value.trim();
    if (!message || state.isProcessing) return;
    if (!overrideText) input.value = '';

    const welcome = document.getElementById('welcomeMsg');
    if (welcome) welcome.remove();

    addChatMessage('user', message);
    const intent = detectIntent(message);
    state.isProcessing = true;
    setStatus('processing', 'Thinking...');

    switch(intent.type) {
      case 'weather': addSkeleton(); await handleWeatherRequest(message); break;
      case 'news': addSkeleton(); await handleNewsRequest(message); break;
      case 'music': await handleMusicRequest(intent.query || message); break;
      case 'time': handleTimeRequest(); break;
      case 'stop_music': stopMusic(); addChatMessage('assistant', 'Music stopped! 🎵'); break;
      default: addTypingIndicator(); await handleGeminiRequest(message);
    }

    state.isProcessing = false;
    setStatus('ready', 'Ready');
  }

  function detectIntent(msg) {
    const lower = msg.toLowerCase();
    const musicPatterns = [/play\s+(.+)/i,/put on\s+(.+)/i,/play me\s+(.+)/i,/play some\s+(.+)/i,/music[\s:]+(.+)/i,/song[\s:]+(.+)/i,/listen to\s+(.+)/i];
    for (const p of musicPatterns) { const m = msg.match(p); if (m) return { type: 'music', query: m[1].trim() }; }
    if (lower.match(/stop\s*(the\s*)?(music|song|playing|audio)/)) return { type: 'stop_music' };
    if (lower.match(/pause\s*(the\s*)?(music|song|playing|audio)/)) return { type: 'stop_music' };
    if (lower.match(/weather|temperature|forecast|rain|sunny|cold|hot|humid/)) return { type: 'weather' };
    if (lower.match(/news|headlines|what'?s happening|current events|latest/)) return { type: 'news' };
    if (lower.match(/^what('?s| is) the time|^time please|^tell me the time|^current time/)) return { type: 'time' };
    return { type: 'general' };
  }

  // ============ WEATHER ============
  async function handleWeatherRequest() {
    if (!state.location) { removeSkeleton(); addChatMessage('assistant', 'I need your location. Please allow location access and try again.'); fetchLocation(); return; }
    try {
      const resp = await fetch(`/api/weather?lat=${state.location.lat}&lon=${state.location.lon}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      state.weather = data.weather; state.locationName = data.locationName;
      const cur = data.weather.current, code = cur.weather_code;
      const w = weatherCodes[code] || { icon: '🌡️', desc: 'Unknown' };
      removeSkeleton();
      const forecastHtml = data.weather.daily ? `<div class="weather-forecast">${data.weather.daily.time.slice(0,3).map((d,i) => {
        const dc = data.weather.daily.weather_code[i], di = weatherCodes[dc]||{icon:'🌡️'};
        const dn = i===0?'Today':new Date(d).toLocaleDateString('en',{weekday:'short'});
        return `<div class="forecast-day"><div class="day-name">${dn}</div><div class="day-icon">${di.icon}</div><div class="day-temp">${Math.round(data.weather.daily.temperature_2m_max[i])}°/${Math.round(data.weather.daily.temperature_2m_min[i])}°</div></div>`;
      }).join('')}</div>` : '';
      const weatherHtml = `<div class="weather-card"><div class="weather-card-main"><div class="weather-card-icon">${w.icon}</div><div><div class="weather-card-temp">${Math.round(cur.temperature_2m)}°C</div><div class="weather-card-detail">${w.desc} • Feels like ${Math.round(cur.apparent_temperature)}°C</div><div class="weather-card-detail">💨 ${cur.wind_speed_10m} km/h • 💧 ${cur.relative_humidity_2m}%</div><div class="weather-card-detail" style="color:var(--gold-accent);">📍 ${data.locationName}</div></div></div>${forecastHtml}</div>`;
      const text = `It's ${Math.round(cur.temperature_2m)}°C in ${data.locationName}. ${w.desc}, feels like ${Math.round(cur.apparent_temperature)}°C.`;
      addChatMessage('assistant', text + weatherHtml); speak(text); updateStandbyWeather();
    } catch(err) { removeSkeleton(); addChatMessage('assistant', 'Couldn\'t fetch weather: ' + err.message); }
  }

  // ============ NEWS ============
  async function handleNewsRequest() {
    try {
      const resp = await fetch('/api/news'), data = await resp.json();
      removeSkeleton();
      if (!data.articles?.length) { addChatMessage('assistant', 'Couldn\'t fetch news right now.'); return; }
      const newsHtml = `<div class="news-card">${data.articles.slice(0,5).map(a => `<div class="news-item"><div>${a.title}</div><div class="news-source">${a.source||'News'} • ${a.pubDate?new Date(a.pubDate).toLocaleDateString():''}</div></div>`).join('')}</div>`;
      const headlines = data.articles.slice(0,3).map(a => a.title).join('. ');
      addChatMessage('assistant', 'Here are the latest headlines:' + newsHtml); speak('Top headlines: ' + headlines);
    } catch(err) { removeSkeleton(); addChatMessage('assistant', 'Couldn\'t fetch news: ' + err.message); }
  }

  // ============ MUSIC ============
  async function handleMusicRequest(query) {
    try {
      addChatMessage('assistant', `🔍 Searching for "${query}"...`);
      addTypingIndicator();
      const resp = await fetch(`/api/youtube/search?q=${encodeURIComponent(query + ' audio')}`);
      const data = await resp.json();
      removeTypingIndicator();
      if (!data.results?.length) { 
        addChatMessage('assistant', `No results for "${query}". Try different words.`); 
        speak(`Sorry, couldn't find ${query}.`); 
        return; 
      }
      
      const resultsHtml = `<div class="search-results">${data.results.map((r, idx) => `<div class="search-result-item" onclick="window.app.playTrack('${r.id}',${JSON.stringify(r.title).replace(/'/g,"\\'")},'${(r.author||'').replace(/'/g,"\\'")}', ${JSON.stringify(data.results.slice(idx + 1)).replace(/'/g,"\\'")})"><div class="search-result-thumb">${r.thumbnail?`<img src="${r.thumbnail}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-music\\' style=\\'padding:10px;color:var(--red-matte)\\'></i>'">`:'<i class="fas fa-music" style="padding:10px;color:var(--red-matte)"></i>'}</div><div class="search-result-info"><div class="search-result-title">${r.title}</div><div class="search-result-artist">${r.author||'Unknown'} • ${formatDuration(r.duration)}</div></div><i class="fas fa-play" style="color:var(--red-soft);font-size:12px;"></i></div>`).join('')}</div>`;
      addChatMessage('assistant', `Found results for "${query}":` + resultsHtml);
      
      const first = data.results[0];
      const remaining = data.results.slice(1);
      speak(`Playing ${first.title} by ${first.author || 'unknown artist'}.`);
      playTrack(first.id, first.title, first.author, remaining);
    } catch(err) { 
      removeTypingIndicator(); 
      addChatMessage('assistant', 'Music search failed: ' + err.message); 
    }
  }

  async function playTrack(videoId, title, author, queue = []) {
    try {
      showMusicPlayer(title || 'Loading...', author || ''); 
      setPlayPauseIcon(false);
      
      logDebug(`Fetching stream for: ${videoId}`, 'info');
      const resp = await fetch(`/api/youtube/stream?id=${videoId}`);
      if (!resp.ok) {
        logDebug(`Stream API Error: ${resp.status}`);
        throw new Error('Stream fetch failed');
      }
      const data = await resp.json();
      
      if (data.error || !data.audioUrl) {
        logDebug(`Stream Data Error: ${data.error || 'No audioUrl'}`);
        if (queue && queue.length > 0) {
          const next = queue[0];
          const remaining = queue.slice(1);
          showToast(`Stream unavailable. Trying: ${next.title}...`, 'info');
          playTrack(next.id, next.title, next.author, remaining);
          return;
        }
        showToast('Streaming unavailable for all sources.', 'error'); 
        return;
      }
      
      // Keep "playing" state intact while switching source natively
      state.audioPlayer.loop = false;
      state.audioPlayer.src = data.audioUrl;
      
      // Update UI beforehand
      state.currentTrack = { id: videoId, title: data.title||title, author: data.author||author };
      showMusicPlayer(data.title||title||'Unknown', data.author||author||'');
      if (data.thumbnail) { 
        const t = document.getElementById('musicThumb'); 
        if (t) t.innerHTML = `<img src="${data.thumbnail}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-music\\'></i>'">`; 
      }
      updateStandbyMusic();

      try { 
        const p = state.audioPlayer.play();
        if (p !== undefined) await p;
        state.isPlaying = true; 
        setPlayPauseIcon(true);
      } catch(e) { 
        state.isPlaying = false;
        setPlayPauseIcon(false);
        
        // Autoplay Policy Exception! 
        speak('I found it. Please tap anywhere on the screen to enable audio.');
        showToast('Tap anywhere to play music', 'info');
        
        const tapToPlay = () => {
           state.audioPlayer.play().catch(()=>{});
           state.isPlaying = true;
           setPlayPauseIcon(true);
           document.removeEventListener('click', tapToPlay);
           document.removeEventListener('touchstart', tapToPlay);
        };
        document.addEventListener('click', tapToPlay);
        document.addEventListener('touchstart', tapToPlay);
      }
    } catch(err) { 
      if (queue && queue.length > 0) {
        const next = queue[0];
        const remaining = queue.slice(1);
        showToast('Connection issue. Trying next source...', 'info');
        playTrack(next.id, next.title, next.author, remaining);
      } else {
        showToast('Error playing: ' + err.message, 'error'); 
      }
    }
  }

  function togglePlayPause() {
    if (!state.audioPlayer.src) return;
    if (state.isPlaying) { state.audioPlayer.pause(); state.isPlaying = false; }
    else { state.audioPlayer.play(); state.isPlaying = true; }
    setPlayPauseIcon(state.isPlaying);
    updateStandbyMusic();
  }

  function setPlayPauseIcon(playing) {
    const b = document.getElementById('playPauseBtn');
    if (b) b.innerHTML = `<i class="fas fa-${playing?'pause':'play'}"></i>`;
    const sb = document.getElementById('standbyPlayIcon');
    if (sb) sb.className = `fas fa-${playing?'pause':'play'}`;
  }

  function stopMusic() {
    state.audioPlayer.pause(); state.audioPlayer.src = '';
    state.isPlaying = false; state.currentTrack = null;
    setPlayPauseIcon(false);
    const p = document.getElementById('musicPlayer');
    if (p) p.classList.remove('visible');
    const t = document.getElementById('musicThumb');
    if (t) { t.classList.remove('spinning'); t.innerHTML = '<i class="fas fa-music"></i>'; }
    updateStandbyMusic();
  }

  function showMusicPlayer(title, artist) {
    const p = document.getElementById('musicPlayer'); if (p) p.classList.add('visible');
    const t = document.getElementById('musicTitle'), a = document.getElementById('musicArtist');
    if (t) t.textContent = title; if (a) a.textContent = artist || '--';
  }

  function updateMusicProgress() {
    const fill = document.getElementById('musicProgressFill'), cur = document.getElementById('musicCurrentTime'), dur = document.getElementById('musicDuration');
    if (!fill || !state.audioPlayer.duration) return;
    fill.style.width = (state.audioPlayer.currentTime/state.audioPlayer.duration)*100+'%';
    cur.textContent = formatTime(state.audioPlayer.currentTime);
    dur.textContent = formatTime(state.audioPlayer.duration);
  }

  function seekMusic(event) {
    const bar = document.getElementById('musicProgressBar');
    if (!bar || !state.audioPlayer.duration) return;
    const rect = bar.getBoundingClientRect();
    state.audioPlayer.currentTime = ((event.clientX-rect.left)/rect.width)*state.audioPlayer.duration;
  }

  function onTrackEnd() { state.isPlaying = false; setPlayPauseIcon(false); updateStandbyMusic(); }
  function musicPrev() { if (state.audioPlayer.currentTime > 3) state.audioPlayer.currentTime = 0; }
  function musicNext() { onTrackEnd(); }

  function setVolume(v) {
    state.volume = parseFloat(v); state.audioPlayer.volume = state.volume;
    localStorage.setItem('volume', state.volume);
    const icon = document.getElementById('volumeIcon');
    if (icon) icon.className = `fas fa-volume-${v < 0.01 ? 'xmark' : v < 0.5 ? 'low' : 'high'}`;
  }

  function toggleMute() {
    const slider = document.getElementById('volumeSlider');
    if (state.audioPlayer.volume > 0) { state.audioPlayer.volume = 0; if (slider) slider.value = 0; }
    else { state.audioPlayer.volume = state.volume || 0.8; if (slider) slider.value = state.audioPlayer.volume; }
    const icon = document.getElementById('volumeIcon');
    if (icon) icon.className = `fas fa-volume-${state.audioPlayer.volume < 0.01 ? 'xmark' : 'high'}`;
  }

  function updateStandbyMusic() {
    const el = document.getElementById('standbyMusic');
    const title = document.getElementById('standbyMusicTitle');
    if (!el) return;
    if (state.currentTrack && state.isPlaying) {
      el.classList.add('visible');
      if (title) title.textContent = state.currentTrack.title;
    } else {
      el.classList.remove('visible');
    }
  }

  // ============ GEMINI AI ============
  async function handleGeminiRequest(message) {
    try {
      const now = new Date();
      const timeContext = `[Current time: ${now.toLocaleString()}. User location: ${state.locationName || 'unknown'}]`;
      const resp = await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: state.apiKey, message: timeContext + ' ' + message, history: state.geminiHistory.slice(-10) })
      });
      let data;
      try { data = await resp.json(); } catch { throw new Error('Failed to parse server response'); }
      removeTypingIndicator();
      if (data.error) { addChatMessage('assistant', '⚠️ ' + data.error); return; }
      if (!data.response) { addChatMessage('assistant', 'No response. Please try again.'); return; }

      state.geminiHistory.push({ role: 'user', parts: [{ text: message }] });
      state.geminiHistory.push({ role: 'model', parts: [{ text: data.response }] });

      const formatted = formatMarkdown(data.response);
      addChatMessage('assistant', formatted, true); // typewriter
      speak(data.response.replace(/[*#`_]/g, '').replace(/\[.*?\]/g, ''));
    } catch(err) { removeTypingIndicator(); addChatMessage('assistant', 'Error: ' + err.message + ' <button class="quick-action" style="margin-top:8px;" onclick="window.app.retryLast()"><i class="fas fa-rotate-right"></i> Retry</button>'); }
  }

  function handleTimeRequest() {
    removeSkeleton();
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const date = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    addChatMessage('assistant', `🕐 <strong>${time}</strong><br>📅 ${date}`);
    speak(`The time is ${time}. Today is ${date}.`);
  }

  function retryLast() {
    const msgs = state.chatHistory;
    for (let i = msgs.length-1; i >= 0; i--) {
      if (msgs[i].role === 'user') { document.getElementById('chatInput').value = msgs[i].content.replace(/<[^>]+>/g, ''); sendMessage(); break; }
    }
  }

  // ============ QUICK ACTIONS ============
  function quickAction(type) {
    const actions = { weather:"What's the weather like?", news:'Tell me the latest news', music:'Play some relaxing lo-fi music', time:'What time is it?', joke:'Tell me a funny joke' };
    document.getElementById('chatInput').value = actions[type] || '';
    sendMessage();
  }

  // ============ CHAT UI ============
  function addChatMessage(role, content, typewriter = false) {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role}`;

    const bubbleContent = typewriter ? '' : content;
    const copyBtn = role === 'assistant' ? `<button class="copy-btn" onclick="window.app.copyMsg(this)" title="Copy"><i class="fas fa-copy"></i></button>` : '';

    msgDiv.innerHTML = `
      <div class="avatar">${role === 'assistant' ? '🎙️' : '<i class="fas fa-user" style="font-size:12px;"></i>'}</div>
      <div>
        <div class="bubble">${copyBtn}${bubbleContent}</div>
        <div class="msg-time">${timeStr()}</div>
      </div>
    `;
    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
    state.chatHistory.push({ role, content });

    if (typewriter && role === 'assistant') {
      const bubble = msgDiv.querySelector('.bubble');
      typewriterEffect(bubble, content, copyBtn);
    }
  }

  function typewriterEffect(bubble, html, copyBtn) {
    // For HTML content, we insert it in chunks for a smooth reveal
    bubble.innerHTML = copyBtn;
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || '';
    const el = document.createElement('span');
    bubble.appendChild(el);

    let i = 0;
    const speed = Math.max(8, Math.min(25, 800 / text.length));

    function type() {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
        const chatArea = document.getElementById('chatArea');
        if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
        setTimeout(type, speed);
      } else {
        // Replace with full HTML
        bubble.innerHTML = copyBtn + html;
      }
    }
    type();
  }

  function addTypingIndicator() {
    removeTypingIndicator();
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;
    const div = document.createElement('div');
    div.className = 'chat-msg assistant'; div.id = 'typingIndicator';
    div.innerHTML = `<div class="avatar">🎙️</div><div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function removeTypingIndicator() { document.getElementById('typingIndicator')?.remove(); }

  function addSkeleton() {
    removeSkeleton();
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;
    const div = document.createElement('div');
    div.className = 'chat-msg assistant'; div.id = 'skeletonLoader';
    div.innerHTML = `<div class="avatar">🎙️</div><div class="bubble" style="min-width:200px;"><div class="skeleton skeleton-line" style="width:80%"></div><div class="skeleton skeleton-line" style="width:60%"></div><div class="skeleton skeleton-line" style="width:90%"></div></div>`;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function removeSkeleton() { document.getElementById('skeletonLoader')?.remove(); }

  function clearChat() {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;
    chatArea.innerHTML = '';
    state.chatHistory = [];
    state.geminiHistory = [];
    showToast('Chat cleared', 'success');
  }

  function copyMsg(btn) {
    const bubble = btn.closest('.bubble');
    if (!bubble) return;
    const text = bubble.textContent.replace('Copy', '').trim();
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      btn.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
    });
  }

  // ============ TTS ============
  function speak(text) {
    if (!state.ttsEnabled || !state.synth) return;
    state.synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1; u.volume = 1;
    const voices = state.synth.getVoices();
    if (state.ttsVoice !== 'default') {
      const v = voices.find(v => v.name === state.ttsVoice);
      if (v) u.voice = v;
    } else {
      const pref = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en') && v.localService) || voices.find(v => v.lang.startsWith('en'));
      if (pref) u.voice = pref;
    }
    u.onstart = () => { state.isSpeaking = true; setStatus('speaking', 'Speaking...'); };
    u.onend = () => { state.isSpeaking = false; setStatus('ready', 'Ready'); if (state.continuousListening && state.isSetup) startListening(); };
    state.synth.speak(u);
  }

  // ============ LOCATION ============
  function fetchLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => { state.location = { lat: pos.coords.latitude, lon: pos.coords.longitude }; fetchWeatherForStandby(); }, () => {}, { enableHighAccuracy: false, timeout: 10000 });
    }
  }

  async function fetchWeatherForStandby() {
    if (!state.location) return;
    try {
      const resp = await fetch(`/api/weather?lat=${state.location.lat}&lon=${state.location.lon}`);
      const data = await resp.json();
      if (!data.error) { state.weather = data.weather; state.locationName = data.locationName; updateStandbyWeather(); }
    } catch(e) {}
  }

  function updateStandbyWeather() {
    const c = document.getElementById('standbyWeather');
    if (!c || !state.weather) return;
    const cur = state.weather.current, code = cur.weather_code;
    const w = weatherCodes[code] || { icon:'🌡️', desc:'Unknown' };
    c.style.display = 'flex';
    c.innerHTML = `<div class="standby-weather-icon">${w.icon}</div><div><div class="standby-weather-temp">${Math.round(cur.temperature_2m)}°</div><div class="standby-weather-desc">${w.desc}</div><div class="standby-weather-loc">📍 ${state.locationName}</div></div>`;
  }

  // ============ STANDBY ============
  function toggleStandby() {
    state.isStandby = !state.isStandby;
    const screen = document.getElementById('standbyScreen');
    if (!screen) return;
    if (state.isStandby) {
      screen.classList.add('active'); updateStandbyWeather(); updateStandbyClock();
      state.standbyTimer = setInterval(updateStandbyClock, 1000);
      updateStandbyMusic();
      if (state.wakeWordEnabled) startWakeWordListening();
    } else {
      screen.classList.remove('active');
      if (state.standbyTimer) { clearInterval(state.standbyTimer); state.standbyTimer = null; }
    }
  }

  function handleStandbyClick(event) {
    if (event.target.closest('.standby-controls') || event.target.closest('.standby-ctrl-btn') || event.target.closest('.standby-music')) return;
  }

  function updateFusionClock() {
    const container = document.querySelector('.fusion-clock-container');
    if (!container) return;
    const date = new Date(),
      second = date.getSeconds(),
      minute = date.getMinutes(),
      hour = date.getHours(),
      time = date.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }),
      day = date.getDay(),
      month = date.getMonth(),
      dateStr = date.getDate() + ' . ' + fusionClockData.months[month];
    const ds = second * -6, dm = minute * -6, dh = (hour % 12 + minute / 60) * -30;
    const secEl = container.querySelector('.second');
    const minEl = container.querySelector('.minute');
    const hourEl = container.querySelector('.hour');
    const timeEl = container.querySelector('.clock-digital .time');
    const dayEl = container.querySelector('.clock-digital .day');
    const dateEl = container.querySelector('.clock-digital .date');
    if (secEl) secEl.style.transform = `rotate(${ds}deg)`;
    if (minEl) minEl.style.transform = `rotate(${dm}deg)`;
    if (hourEl) hourEl.style.transform = `rotate(${dh}deg)`;
    if (timeEl) timeEl.textContent = time;
    if (dayEl) dayEl.textContent = fusionClockData.days[day];
    if (dateEl) dateEl.textContent = dateStr;
  }

  function initFusionClock() {
    const container = document.querySelector('.fusion-clock-container');
    if (!container) return;
    const dailer = (selector, size) => {
      const el = container.querySelector(selector);
      if (!el) return;
      let html = '';
      for (let s = 0; s < 60; s++) {
        html += `<span style="transform: rotate(${6 * s}deg) translateX(${size}px)">${s}</span>`;
      }
      el.innerHTML = html;
    };
    dailer('.second', 195);
    dailer('.minute', 145);
    dailer('.dail', 230);
    const hourEl = container.querySelector('.hour');
    if (hourEl) {
      let html = '';
      for (let s = 1; s < 13; s++) {
        html += `<span style="transform: rotate(${30 * s}deg) translateX(100px)">${s}</span>`;
      }
      hourEl.innerHTML = html;
    }
  }

  function updateStandbyClock() {
    const container = document.getElementById('standbyClockContainer');
    if (!container) return;
    const now = new Date(), h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    const timeS = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    const secS = String(s).padStart(2,'0');
    const dateS = now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

    switch(state.clockStyle) {
      case 'digital':
        container.innerHTML = `<div class="standby-clock clock-digital"><div class="clock-time">${timeS}</div><div class="clock-seconds">:${secS}</div><div class="clock-date">${dateS}</div></div>`;
        break;
      case 'minimal':
        container.innerHTML = `<div class="standby-clock clock-minimal"><div class="clock-time">${timeS}</div><div class="clock-date">${dateS}</div></div>`;
        break;
      case 'neon':
        container.innerHTML = `<div class="standby-clock clock-neon"><div class="clock-time">${timeS}:${secS}</div><div class="clock-date">${dateS}</div></div>`;
        break;
      case 'analog': {
        const hDeg = (h%12)*30+m*0.5, mDeg = m*6+s*0.1, sDeg = s*6;
        let markers = '';
        for (let i=0;i<12;i++) markers += `<div class="marker ${i%3===0?'major':''}" style="transform:translateX(-50%) rotate(${i*30}deg);"></div>`;
        container.innerHTML = `<div class="clock-analog-container"><div class="analog-clock">${markers}<div class="hand hour-hand" style="transform:rotate(${hDeg}deg);"></div><div class="hand minute-hand" style="transform:rotate(${mDeg}deg);"></div><div class="hand second-hand" style="transform:rotate(${sDeg}deg);"></div><div class="center-dot"></div></div><div class="analog-date">${dateS}</div></div>`;
        break;
      }
      case 'fusion':
        if (!container.querySelector('.fusion-clock-container')) {
          container.innerHTML = `
            <div class="fusion-clock-container">
              <div class="clock-digital"><div class="date"></div><div class="time"></div><div class="day"></div></div>
              <div class="clock-analog"><div class="spear"></div><div class="hour"></div><div class="minute"></div><div class="second"></div><div class="dail"></div></div>
            </div>`;
          initFusionClock();
        }
        updateFusionClock();
        break;
      case 'aurora':
        container.innerHTML = `<div class="standby-clock clock-aurora"><div class="clock-time">${timeS}</div><div class="clock-date">${dateS}</div><div class="clock-greeting">${getGreeting()}</div></div>`;
        break;
    }
  }

  function cycleClockStyle() {
    const styles = ['digital','minimal','neon','analog','fusion','aurora'];
    state.clockStyle = styles[(styles.indexOf(state.clockStyle)+1)%styles.length];
    localStorage.setItem('clock_style', state.clockStyle);
    updateStandbyClock();
    const sel = document.getElementById('clockStyleSelect');
    if (sel) sel.value = state.clockStyle;
    showToast(`Clock: ${state.clockStyle}`, 'success');
  }

  function setClockStyle(style) { state.clockStyle = style; localStorage.setItem('clock_style', style); if (state.isStandby) updateStandbyClock(); }

  // ============ SETTINGS ============
  function toggleSettings() {
    state.settingsOpen = !state.settingsOpen;
    document.getElementById('settingsPanel')?.classList.toggle('open', state.settingsOpen);
    document.getElementById('settingsOverlay')?.classList.toggle('open', state.settingsOpen);
    // Refresh voice list when opening
    if (state.settingsOpen) refreshVoiceList();
  }

  function refreshVoiceList() {
    const sel = document.getElementById('voiceSelect');
    if (!sel || !state.synth) return;
    const voices = state.synth.getVoices().filter(v => v.lang.startsWith('en'));
    sel.innerHTML = '<option value="default">System Default</option>' + voices.map(v => `<option value="${v.name}" ${state.ttsVoice===v.name?'selected':''}>${v.name.substring(0,35)}</option>`).join('');
  }

  function updateApiKey(key) { state.apiKey = key.trim(); localStorage.setItem('gemini_api_key', state.apiKey); showToast('API key updated', 'success'); }
  function updateWakeWord(word) { state.wakeWord = word.trim().toLowerCase(); const el = document.getElementById('standbyWakeWord'); if (el) el.textContent = state.wakeWord; showToast(`Wake word: "${state.wakeWord}"`, 'success'); }
  function toggleTTS() { state.ttsEnabled = !state.ttsEnabled; localStorage.setItem('tts_enabled', state.ttsEnabled); document.getElementById('ttsToggle')?.classList.toggle('active', state.ttsEnabled); }
  function setVoice(name) { state.ttsVoice = name; localStorage.setItem('tts_voice', name); showToast('Voice updated', 'success'); }
  function toggleWakeWord() { state.wakeWordEnabled = !state.wakeWordEnabled; document.getElementById('wakeToggle')?.classList.toggle('active', state.wakeWordEnabled); if (state.wakeWordEnabled) startWakeWordListening(); else { try { state.recognition?.stop(); } catch(e) {} } }
  function toggleContinuousListening() { state.continuousListening = !state.continuousListening; document.getElementById('contListenToggle')?.classList.toggle('active', state.continuousListening); }
  function toggleMotion() {
    state.reducedMotion = !state.reducedMotion; localStorage.setItem('reduced_motion', state.reducedMotion);
    document.getElementById('motionToggle')?.classList.toggle('active', state.reducedMotion);
    const pc = document.getElementById('particles');
    if (pc) pc.innerHTML = '';
    if (!state.reducedMotion) createParticles();
  }
  function logout() { localStorage.removeItem('gemini_api_key'); state.apiKey=''; state.isSetup=false; location.reload(); }

  function toggleDebugMode() {
    const isDebug = localStorage.getItem('debug_mode') === 'true';
    localStorage.setItem('debug_mode', !isDebug);
    document.getElementById('debugConsole')?.classList.toggle('visible', !isDebug);
    showToast(`Debug mode ${!isDebug ? 'enabled' : 'disabled'}`, 'info');
  }

  // ============ UTILITY ============
  function setStatus(type, text) {
    const dot = document.getElementById('statusDot'), label = document.getElementById('statusText');
    if (dot) { dot.className = 'status-dot'; if (type !== 'ready') dot.classList.add(type); }
    if (label) label.textContent = text;
  }

  function formatTime(s) { if (isNaN(s)) return '0:00'; return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
  function formatDuration(s) { if (!s) return ''; return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

  function formatMarkdown(text) {
    return text
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^[-•]\s+(.+)/gm, '<li style="margin-left:16px;list-style:disc;">$1</li>')
      .replace(/^\d+\.\s+(.+)/gm, '<li style="margin-left:16px;list-style:decimal;">$1</li>')
      .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border-color);margin:12px 0;">')
      .replace(/\n/g, '<br>');
  }

  function showToast(message, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas fa-${type==='error'?'circle-exclamation':type==='success'?'circle-check':'circle-info'}"></i> ${message}`;
    c.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastOut 0.3s ease-out forwards'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ============ EXPOSE API ============
  window.app = {
    startSetup, sendMessage, toggleMic, toggleStandby, handleStandbyClick,
    toggleSettings, togglePlayPause, stopMusic, seekMusic, musicPrev, musicNext,
    playTrack, quickAction, cycleClockStyle, setClockStyle, updateApiKey,
    updateWakeWord, toggleTTS, toggleWakeWord, toggleContinuousListening,
    logout, clearChat, copyMsg, setVolume, toggleMute, setVoice, toggleMotion, retryLast,
    toggleDebugMode
  };

  // ============ START ============
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
})();
