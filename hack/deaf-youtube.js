/* Deaf Mode (YouTube avatar): STT + fuzzy match + YouTube IFrame playback */

(function(){
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

  // Fill these with your actual video IDs and segment times
  const YT_MAP = {
    "how are you?": { videoId: "dQw4w9WgXcQ", startSeconds: 5, endSeconds: 11 },
    "what are you doing?": { videoId: "dQw4w9WgXcQ", startSeconds: 12, endSeconds: 18 },
    "what is your name?": { videoId: "dQw4w9WgXcQ", startSeconds: 19, endSeconds: 25 },
    "my name is om.": { videoId: "dQw4w9WgXcQ", startSeconds: 26, endSeconds: 32 },
    "nice to meet you.": { videoId: "dQw4w9WgXcQ", startSeconds: 33, endSeconds: 39 },
    "please wait a moment.": { videoId: "dQw4w9WgXcQ", startSeconds: 40, endSeconds: 46 },
    "can you help me?": { videoId: "dQw4w9WgXcQ", startSeconds: 47, endSeconds: 53 },
    "i don’t understand.": { videoId: "dQw4w9WgXcQ", startSeconds: 54, endSeconds: 60 },
    "thank you very much.": { videoId: "dQw4w9WgXcQ", startSeconds: 61, endSeconds: 67 },
    "see you tomorrow.": { videoId: "dQw4w9WgXcQ", startSeconds: 68, endSeconds: 74 }
  };

  const VARIANT_MAP = new Map([
    [/\bwhat are doing\b/gi, "what are you doing"],
    [/\bdon[’']t\b/gi, "don’t"],
  ]);

  const SIMILARITY_THRESHOLD = 0.8;

  let player = null;
  let firstGesture = false;

  const elInterim = document.getElementById('interim');
  const elFinal = document.getElementById('final');
  const elHistory = document.getElementById('historyList');
  const elStatus = document.getElementById('micStatus');
  const elPermNotice = document.getElementById('permNotice');
  const elToast = document.getElementById('toast');
  const elMatchPill = document.getElementById('matchPill');
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnClear = document.getElementById('btnClear');
  const elUnmute = document.getElementById('unmuteBtn');
  const elTapToPlay = document.getElementById('tapToPlay');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let history = [];

  if (!SpeechRecognition) {
    setStatus('Web Speech not supported');
    btnStart && (btnStart.disabled = true);
    btnPause && (btnPause.disabled = true);
    showToast('Your browser does not support live speech recognition.');
  }

  window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('ytPlayer', {
      height: '360', width: '640',
      videoId: 'dQw4w9WgXcQ',
      playerVars: { controls:0, autoplay:0, rel:0, modestbranding:1, playsinline:1, iv_load_policy:3 },
      events: {
        onReady: () => { try { player.mute(); } catch(_) {} },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            elTapToPlay && (elTapToPlay.hidden = true);
          }
        }
      }
    });
  };

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => { listening = true; setStatus('Listening'); updateControls(); };
    recognition.onend = () => { listening = false; setStatus('Paused'); updateControls(); };
    recognition.onerror = (e) => { setStatus('Error'); showToast('Mic error: ' + (e?.error || 'unknown')); };

    recognition.onresult = (event) => {
      let interimText = ''; let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript; else interimText += res[0].transcript;
      }
      elInterim && (elInterim.textContent = interimText);
      if (finalText) handleFinal(finalText);
    };
  }

  btnStart?.addEventListener('click', async () => {
    firstGesture = true;
    await requestMicAndStart();
    if (player) try { player.mute(); } catch(_) {}
  });
  btnPause?.addEventListener('click', () => { try { recognition.stop(); } catch(_) {} });
  btnClear?.addEventListener('click', () => { clearAll(); });
  elUnmute?.addEventListener('click', () => { try { player.unMute(); elUnmute.hidden = true; } catch(_) {} });
  elTapToPlay?.addEventListener('click', () => { try { player.playVideo(); elTapToPlay.hidden = true; } catch(_) {} });

  async function requestMicAndStart(){
    try {
      setStatus('Requesting permission…'); setNotice('Requesting microphone permission…'); showToast('Requesting microphone permission…');
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus('Listening'); setNotice('Microphone permission granted. Listening…'); showToast('Microphone permission granted');
      recognition && recognition.start();
      updateControls();
    } catch (err) {
      setStatus('Permission needed'); setNotice('Microphone permission denied. Please allow access to start listening.'); showToast('Microphone permission denied');
      updateControls();
    }
  }

  function handleFinal(raw) {
    const cleaned = normalize(raw);
    elFinal && (elFinal.textContent = raw.trim());
    const { match, score } = bestMatch(cleaned, PHRASES);
    if (match && score >= SIMILARITY_THRESHOLD) {
      playForPhrase(match);
      setMatchPill(`showing: "${match}"`);
    } else {
      setMatchPill('No preset sign for this sentence yet');
      showToast('No preset sign for this sentence yet');
    }
    pushHistory(raw.trim());
  }

  function playForPhrase(phrase){
    const cfg = YT_MAP[phrase]; if (!cfg || !player || !YT || !YT.PlayerState) return;
    try {
      player.cueVideoById({ videoId: cfg.videoId, startSeconds: cfg.startSeconds, endSeconds: cfg.endSeconds });
      const ok = player.playVideo();
      if (firstGesture) { /* can unmute after gesture if desired */ }
      // If autoplay blocked, show tap overlay
      setTimeout(() => { try { if (player.getPlayerState() !== YT.PlayerState.PLAYING) elTapToPlay && (elTapToPlay.hidden = false); } catch(_) {} }, 300);
      // Show unmute if muted
      setTimeout(() => { try { if (player.isMuted && player.isMuted()) elUnmute && (elUnmute.hidden = false); } catch(_) {} }, 300);
    } catch (_) {}
  }

  function setMatchPill(text){ const el = elMatchPill; if (!el) return; el.textContent = text; }
  function setStatus(text){ if (elStatus) elStatus.textContent = text; }
  function setNotice(text){ if (elPermNotice) elPermNotice.textContent = text || ''; }
  function showToast(message){ if (!elToast) return; elToast.textContent = message; elToast.classList.add('show'); setTimeout(()=> elToast.classList.remove('show'), 1800); }

  function clearAll(){ elInterim && (elInterim.textContent = ''); elFinal && (elFinal.textContent = ''); history=[]; renderHistory(); updateControls(); }
  function pushHistory(text){ history.unshift(text); if (history.length>10) history.pop(); renderHistory(); }
  function renderHistory(){ if (!elHistory) return; elHistory.innerHTML=''; for(const t of history){ const li=document.createElement('li'); li.textContent=t; elHistory.appendChild(li);} }

  function normalize(text){
    let t = (text||'').toLowerCase().trim().replace(/[\p{P}\p{S}]+/gu,' ').replace(/\s+/g,' ');
    for (const [pattern, repl] of VARIANT_MAP) t = t.replace(pattern, repl);
    return t;
  }
  function similarity(a,b){ const d = levenshtein(a,b); const max = Math.max(a.length,b.length)||1; return 1 - d/max; }
  function bestMatch(input, candidates){ let best=null, bestScore=-1; for(const c of candidates){ const s=similarity(input, normalize(c)); if(s>bestScore){bestScore=s; best=c;} } return {match:best, score:bestScore}; }
  function levenshtein(a,b){ const m=a.length,n=b.length; if(!m) return n; if(!n) return m; const dp=new Array(n+1); for(let j=0;j<=n;j++) dp[j]=j; for(let i=1;i<=m;i++){ let prev=i-1; dp[0]=i; for(let j=1;j<=n;j++){ const tmp=dp[j]; const cost=a[i-1]===b[j-1]?0:1; dp[j]=Math.min(dp[j]+1, dp[j-1]+1, prev+cost); prev=tmp; } } return dp[n]; }

  function updateControls(){ if(!btnStart||!btnPause) return; if(listening){ btnStart.disabled=true; btnPause.disabled=false; btnStart.textContent='Start Listening'; btnStart.setAttribute('aria-label','Start or resume listening'); } else { btnStart.disabled=false; btnPause.disabled=true; btnStart.textContent='Resume'; btnStart.setAttribute('aria-label','Resume listening'); } }
})();


