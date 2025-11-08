/*
  README: Deaf Mode (Live)
  - Web Speech API live recognition (continuous, interim results)
  - Fuzzy match finalized text to 10 preset phrases (≥ 0.8 similarity)
  - Play corresponding sign-language avatar via Lottie; video fallback; text fallback
  - UI: status pill, controls (Start/Resume, Pause, Clear), interim/final transcript, history, toast
*/

(function () {
  const PHRASES = [
    "how are you?",
    "what are you doing?",
    "what is your name?",
    "my name is om.",
    "nice to meet you.",
    "please wait a moment.",
    "can you help me?",
    "i don’t understand.",
    "thank you very much.",
    "see you tomorrow."
  ];

  const ASSETS = {
    "how are you?": "/assets/avatar/how_are_you.json",
    "what are you doing?": "/assets/avatar/what_are_you_doing.json",
    "what is your name?": "/assets/avatar/what_is_your_name.json",
    "my name is om.": "/assets/avatar/my_name_is_om.json",
    "nice to meet you.": "/assets/avatar/nice_to_meet_you.json",
    "please wait a moment.": "/assets/avatar/please_wait_a_moment.json",
    "can you help me?": "/assets/avatar/can_you_help_me.json",
    "i don’t understand.": "/assets/avatar/i_dont_understand.json",
    "thank you very much.": "/assets/avatar/thank_you_very_much.json",
    "see you tomorrow.": "/assets/avatar/see_you_tomorrow.json"
  };

  const VARIANT_MAP = new Map([
    [/\bwhat are doing\b/gi, "what are you doing"],
    [/\bdon[’']t\b/gi, "don’t"],
  ]);

  const SIMILARITY_THRESHOLD = 0.8;

  // Elements
  const elInterim = document.getElementById('interim');
  const elFinal = document.getElementById('final');
  const elBadge = document.getElementById('matchBadge');
  const elStatus = document.getElementById('micStatus');
  const elPermNotice = document.getElementById('permNotice');
  const elHistory = document.getElementById('historyList');
  const elAvatar = document.getElementById('avatar');
  const elAvatarFallback = document.getElementById('avatarFallback');
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnClear = document.getElementById('btnClear');
  const elToast = document.getElementById('toast');

  // Recognition state
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let requestingPermission = false;
  let lottieInstance = null;
  let history = [];
  let ttsManifest = [];
  let audioPlayer = null;

  // Fallback for unsupported browsers
  if (!SpeechRecognition) {
    setStatus('Web Speech not supported');
    if (btnStart) btnStart.disabled = true;
    if (btnPause) btnPause.disabled = true;
    showToast('Your browser does not support live speech recognition.');
    return;
  }

  // Reflect current microphone permission state, if supported
  updatePermissionState();

  // Initialize recognition
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    listening = true;
    setStatus('Listening');
    updateControls();
  };

  recognition.onend = () => {
    listening = false;
    setStatus('Paused');
    updateControls();
  };

  recognition.onerror = (e) => {
    console.error('Recognition error:', e);
    setStatus('Error');
    showToast('Mic error: ' + (e?.error || 'unknown'));
  };

  recognition.onresult = (event) => {
    let interimText = '';
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        finalText += res[0].transcript;
      } else {
        interimText += res[0].transcript;
      }
    }
    if (elInterim) elInterim.textContent = interimText;
    if (finalText) handleFinalized(finalText);
  };

  // Controls
  btnStart?.addEventListener('click', () => {
    startListening();
  });

  btnPause?.addEventListener('click', () => {
    pauseListening();
  });

  btnClear?.addEventListener('click', () => {
    clearAll();
  });

  // Functions
  async function startListening() {
    try {
      // Inform user before permission prompt
      setStatus('Requesting permission…');
      setNotice('Requesting microphone permission…');
      showToast('Requesting microphone permission…');

      // Ask for mic permission explicitly via getUserMedia first for clearer status
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus('Listening');
      setNotice('Microphone permission granted. Listening…');
      showToast('Microphone permission granted');
      recognition.start();
      updateControls();
    } catch (err) {
      console.error('Mic permission denied:', err);
      setStatus('Permission needed');
      setNotice('Microphone permission denied. Please allow access to start listening.');
      showToast('Microphone permission denied');
      updateControls();
    }
  }

  async function autoRequestMicOnLoad() {
    if (requestingPermission || listening) return;
    requestingPermission = true;
    try {
      setStatus('Requesting permission…');
      setNotice('Requesting microphone permission…');
      // Trigger permission prompt on page load
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus('Listening');
      setNotice('Microphone permission granted. Listening…');
      showToast('Microphone permission granted');
      recognition.start();
    } catch (err) {
      // Do not block; user can use Start button later
      setStatus('Permission needed');
      setNotice('Microphone permission denied. Click Start Listening to try again.');
    } finally {
      requestingPermission = false;
      updateControls();
    }
  }

  function pauseListening() {
    try { recognition.stop(); } catch (_) {}
  }

  function clearAll() {
    if (elInterim) elInterim.textContent = '';
    if (elFinal) elFinal.textContent = '';
    if (elBadge) { elBadge.hidden = true; elBadge.textContent = ''; }
    history = [];
    renderHistory();
    stopAvatar();
    updateControls();
  }

  function setStatus(text) {
    if (elStatus) elStatus.textContent = text;
  }

  function setNotice(text) {
    if (elPermNotice) elPermNotice.textContent = text || '';
  }

  function updateControls() {
    if (!btnStart || !btnPause) return;
    if (listening) {
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnStart.textContent = 'Start Listening';
      btnStart.setAttribute('aria-label', 'Start or resume listening');
    } else {
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnStart.textContent = 'Resume';
      btnStart.setAttribute('aria-label', 'Resume listening');
    }
  }

  function handleFinalized(rawText) {
    const cleaned = normalizeText(rawText);
    if (elFinal) elFinal.textContent = rawText.trim();

    const { match, score } = findBestMatch(cleaned, PHRASES);
    const isMatched = match && score >= SIMILARITY_THRESHOLD;

    if (elBadge) {
      elBadge.hidden = false;
      elBadge.textContent = isMatched ? 'matched' : 'no match';
      elBadge.classList.toggle('matched', !!isMatched);
      elBadge.classList.toggle('nomatch', !isMatched);
    }

    // Update history (keep last 10)
    pushHistory({ text: rawText.trim(), matched: isMatched, phrase: match || null });

    if (isMatched && match) {
      const asset = ASSETS[match];
      playAvatar(asset);
      showToast(`Showing sign for: "${match}"`);
    } else {
      showToast('No preset sign for this sentence yet');
      // Try audio fallback from TTS manifest
      maybePlayClosestAudio(cleaned);
    }
  }

  function pushHistory(item) {
    history.unshift(item);
    if (history.length > 10) history.pop();
    renderHistory();
  }

  function renderHistory() {
    if (!elHistory) return;
    elHistory.innerHTML = '';
    for (const item of history) {
      const li = document.createElement('li');
      li.textContent = item.text + (item.matched && item.phrase ? `  —  ${item.phrase}` : '');
      elHistory.appendChild(li);
    }
  }

  function normalizeText(text) {
    let t = (text || '')
      .toLowerCase()
      .trim()
      .replace(/[\p{P}\p{S}]+/gu, ' ') // remove punctuation/symbols
      .replace(/\s+/g, ' ');
    for (const [pattern, replacement] of VARIANT_MAP) {
      t = t.replace(pattern, replacement);
    }
    return t;
  }

  function similarity(a, b) {
    // Levenshtein similarity = 1 - (distance / maxLen)
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length) || 1;
    return 1 - dist / maxLen;
  }

  function findBestMatch(input, candidates) {
    let best = null; let bestScore = -1;
    for (const c of candidates) {
      const score = similarity(input, normalizeText(c));
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return { match: best, score: bestScore };
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = i - 1; // dp[i-1][j-1]
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const temp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(
          dp[j] + 1,      // deletion
          dp[j - 1] + 1,  // insertion
          prev + cost     // substitution
        );
        prev = temp;
      }
    }
    return dp[n];
  }

  function stopAvatar() {
    if (lottieInstance) {
      try { lottieInstance.destroy(); } catch (_) {}
      lottieInstance = null;
    }
    if (elAvatar) elAvatar.innerHTML = '';
    if (elAvatarFallback) elAvatarFallback.hidden = true;
  }

  function playAvatar(assetPath) {
    stopAvatar();
    if (!assetPath) {
      showFallback();
      return;
    }
    const isLottie = assetPath.endsWith('.json');
    if (isLottie && window.lottie && elAvatar) {
      lottieInstance = window.lottie.loadAnimation({
        container: elAvatar,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: assetPath
      });
      lottieInstance.setSpeed(1.0);
      // Autodestroy after finish to be ready for next clip
      lottieInstance.addEventListener('complete', () => {
        // keep final frame visible; do not destroy immediately
      });
      return;
    }

    // Try video fallback
    const videoExt = assetPath.replace(/\.json$/, '.mp4');
    const video = document.createElement('video');
    video.controls = false;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // allow autoplay without gesture
    video.style.width = '100%';
    video.style.height = '100%';
    const source = document.createElement('source');
    source.src = videoExt;
    source.type = 'video/mp4';
    video.appendChild(source);
    video.onerror = () => showFallback();
    elAvatar?.appendChild(video);
  }

function showFallback() {
  if (elAvatar) {
    elAvatar.innerHTML = `
      <div class="avatar-placeholder" role="img" aria-label="Placeholder for Indian Sign Language woman avatar">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#2a2a2a"/>
              <stop offset="100%" stop-color="#0f0f0f"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="200" height="200" fill="url(#g)" rx="12"/>
          <circle cx="100" cy="58" r="22" fill="#ffffff" fill-opacity="0.9"/>
          <path d="M60 100 Q100 85 140 100 L140 132 Q122 144 100 144 Q78 144 60 132 Z" fill="#ffffff" fill-opacity="0.9"/>
          <path d="M80 144 L120 144 L128 168 L72 168 Z" fill="#ffffff" fill-opacity="0.9"/>
          <rect x="56" y="168" width="88" height="10" rx="5" fill="#ffffff" fill-opacity="0.7"/>
        </svg>
        <div class="avatar-caption">ISL avatar (woman) — add real assets to replace this</div>
      </div>
    `;
  }
  if (elAvatarFallback) elAvatarFallback.hidden = false;
}

  let toastTimer = null;
  function showToast(message) {
    if (!elToast) return;
    elToast.textContent = message;
    elToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elToast.classList.remove('show');
    }, 1800);
  }

  async function updatePermissionState() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) {
        setNotice('Click Start Listening to grant microphone permission.');
        return;
      }
      const status = await navigator.permissions.query({ name: 'microphone' });
      applyPermStatus(status.state);
      status.onchange = () => applyPermStatus(status.state);
    } catch (_) {
      setNotice('Click Start Listening to grant microphone permission.');
    }
  }

  function applyPermStatus(state) {
    if (state === 'granted') {
      setNotice('Microphone permission granted. You can start listening.');
    } else if (state === 'denied') {
      setNotice('Microphone permission denied. Change site permissions to enable listening.');
    } else {
      setNotice('Click Start Listening to grant microphone permission.');
    }
  }

  // Auto prompt on load
  window.addEventListener('DOMContentLoaded', () => {
    // Prepare audio player and load optional TTS manifest
    setupAudioFallback();
    loadTtsManifest();
    // Try to show an idle ISL avatar animation if available
    tryIdleAvatar();
    // If permission is already granted, start immediately; else prompt once
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then((p) => {
        if (p.state === 'granted') {
          // Start without prompting again
          try { recognition.start(); setStatus('Listening'); setNotice('Listening…'); } catch (_) {}
        } else {
          // Prompt once on load
          autoRequestMicOnLoad();
        }
      }).catch(() => autoRequestMicOnLoad());
    } else {
      autoRequestMicOnLoad();
    }
  });

function tryIdleAvatar() {
  const candidates = [
    '/assets/avatar/idle_woman.json',
    '/assets/avatar/idle.json',
    '/assets/avatar/idle_woman.mp4',
    '/assets/avatar/idle.mp4'
  ];
  (async () => {
    for (const path of candidates) {
      try {
        const res = await fetch(path, { method: 'HEAD' });
        if (res.ok) { playAvatar(path); return; }
      } catch (_) { /* continue */ }
    }
    showFallback();
  })();
}

  function setupAudioFallback() {
    audioPlayer = document.createElement('audio');
    audioPlayer.preload = 'metadata';
    audioPlayer.controls = false;
    audioPlayer.hidden = true;
    document.body.appendChild(audioPlayer);
  }

  async function loadTtsManifest() {
    try {
      const res = await fetch('/assets/tts/manifest.json', { cache: 'no-store' });
      if (!res.ok) return;
      ttsManifest = await res.json();
    } catch (_) {
      // ignore if unavailable
    }
  }

  function maybePlayClosestAudio(inputNormalized) {
    if (!Array.isArray(ttsManifest) || ttsManifest.length === 0 || !audioPlayer) return;
    let best = null; let bestScore = -1;
    for (const item of ttsManifest) {
      const txt = normalizeText(item.text || '');
      const s = similarity(inputNormalized, txt);
      if (s > bestScore) { bestScore = s; best = item; }
    }
    if (best && bestScore >= 0.8 && best.audio) {
      playAudio(best.audio);
      showToast('Playing closest audio sample');
    }
  }

  function playAudio(src) {
    try {
      audioPlayer.src = src;
      audioPlayer.currentTime = 0;
      audioPlayer.play().catch(() => {/* ignored */});
    } catch (_) {}
  }
})();


