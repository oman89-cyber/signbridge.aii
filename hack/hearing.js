/*
  README: Hearing Mode camera controller.
  - Start camera with getUserMedia, show live preview.
  - Pause stops stream and cycles phrases on the side panel.
*/

(function () {
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const listenBtn = document.getElementById('listenBtn');
  const video = document.getElementById('cameraFeed');
  const placeholder = document.getElementById('videoPlaceholder');
  const statusEl = document.getElementById('camStatus');
  const currentLineEl = document.getElementById('currentLine');
  const hindiMeaningEl = document.getElementById('hindiMeaning');
  const historyList = document.getElementById('lineHistory');
  const langEnBtn = document.getElementById('langEn');
  const langHiBtn = document.getElementById('langHi');

  // Initialize cracked glass effect
  createCrackedGlass();

  const PHRASES_EN = [
    'how are you?',
    'what are you doing?',
    'what is your name?',
    'please wait a moment.',
    'can i help you?',
    'can i help you?'  // keep duplicate as requested for cycling
  ];

  // Reserved for future normalization logic
  const ALIASES = {
    'how are you': 'how are you?',
    'what are you doing': 'what are you doing?',
    'what is your name': 'what is your name?',
    'please wait a moment': 'please wait a moment.',
    'can you help me?': 'can i help you?',
    'can you help me': 'can i help you?'
  };

  const TRANSLATIONS_HI = {
    'how are you?': 'आप कैसे हैं?',
    'what are you doing?': 'आप क्या कर रहे हैं?',
    'what is your name?': 'आपका नाम क्या है?',
    'please wait a moment.': 'कृपया एक पल प्रतीक्षा करें।',
    'can i help you?': 'क्या मैं आपकी मदद कर सकता हूँ?'
  };

  let stream = null;
  let phraseIndex = 0;
  let currentLang = 'en';
  let currentUtterance = null;
  let isSpeakingSequence = false;
  let gestureSimulationInterval = null;
  let motionDetectionCanvas = null;
  let motionDetectionContext = null;
  let previousFrame = null;

  startBtn?.addEventListener('click', startCamera);
  pauseBtn?.addEventListener('click', pauseCamera);
  listenBtn?.addEventListener('click', speakCurrentPhraseSequence);
  langEnBtn?.addEventListener('click', () => setLanguage('en'));
  langHiBtn?.addEventListener('click', () => setLanguage('hi'));

  async function startCamera() {
    await stopStream();
    updateStatus('Camera: Requesting permission…');

    try {
      const constraints = { video: { facingMode: 'user' } };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await video.play();
      video.hidden = false;
      placeholder.hidden = true;

      startBtn.disabled = true;
      pauseBtn.disabled = false;
      updateStatus('Camera: Running');
      
      // Start gesture simulation
      startGestureSimulation();
    } catch (error) {
      stream = null;
      video.srcObject = null;
      video.hidden = true;
      placeholder.hidden = false;
      startBtn.disabled = false;
      pauseBtn.disabled = false;

      if (error.name === 'NotAllowedError') {
        updateStatus('Camera: Permission denied');
      } else if (error.name === 'NotFoundError') {
        updateStatus('Camera: No camera detected');
      } else {
        updateStatus('Camera: Unable to start');
      }
    }
  }

  async function pauseCamera() {
    await stopStream();
    startBtn.disabled = false;
    pauseBtn.disabled = false;
    updateStatus('Camera: Paused');
    showNextPhrase();
    
    // Stop gesture simulation
    stopGestureSimulation();
    
    // Enable listen button when a phrase is shown
    if (listenBtn) {
      listenBtn.disabled = false;
    }
  }

  async function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (video.srcObject) {
      try { video.srcObject = null; } catch (_) {}
    }
    video.pause?.();
    video.hidden = true;
    placeholder.hidden = false;
  }

  function showNextPhrase() {
    const phrase = PHRASES_EN[phraseIndex];
    
    // Render sentence in selected language
    if (currentLang === 'en') {
      currentLineEl.textContent = phrase;
    } else {
      currentLineEl.textContent = TRANSLATIONS_HI[phrase] || '—';
    }
    
    // Always show Hindi meaning
    hindiMeaningEl.textContent = TRANSLATIONS_HI[phrase] || '—';
    
    // Prepend English phrase to history
    if (historyList) {
      const li = document.createElement('li');
      li.textContent = phrase;
      historyList.prepend(li);
    }
    
    phraseIndex = (phraseIndex + 1) % PHRASES_EN.length;
  }

  function setLanguage(lang) {
    currentLang = lang;
    
    // Update active tab styles
    if (lang === 'en') {
      langEnBtn.classList.add('lang-tab-active');
      langEnBtn.setAttribute('aria-selected', 'true');
      langHiBtn.classList.remove('lang-tab-active');
      langHiBtn.setAttribute('aria-selected', 'false');
    } else {
      langHiBtn.classList.add('lang-tab-active');
      langHiBtn.setAttribute('aria-selected', 'true');
      langEnBtn.classList.remove('lang-tab-active');
      langEnBtn.setAttribute('aria-selected', 'false');
    }
    
    // Re-render current line if we have a phrase
    if (phraseIndex > 0 || currentLineEl.textContent !== 'Pause the camera to show the first line.') {
      const currentPhrase = PHRASES_EN[(phraseIndex - 1 + PHRASES_EN.length) % PHRASES_EN.length];
      if (currentLang === 'en') {
        currentLineEl.textContent = currentPhrase;
      } else {
        currentLineEl.textContent = TRANSLATIONS_HI[currentPhrase] || '—';
      }
    }
  }

  function speakCurrentPhraseSequence() {
    // Stop any ongoing speech
    if (currentUtterance) {
      speechSynthesis.cancel();
    }
    
    // Get the current English phrase
    const currentPhraseIndex = (phraseIndex - 1 + PHRASES_EN.length) % PHRASES_EN.length;
    const englishPhrase = PHRASES_EN[currentPhraseIndex];
    const hindiPhrase = TRANSLATIONS_HI[englishPhrase];
    
    if (englishPhrase && hindiPhrase) {
      isSpeakingSequence = true;
      
      // First, speak the English phrase
      speakSinglePhrase(englishPhrase, 'en-US', () => {
        // After English phrase completes, speak the Hindi phrase
        speakSinglePhrase(hindiPhrase, 'hi-IN', () => {
          // Both phrases completed
          if (listenBtn) {
            listenBtn.textContent = '🔊 Listen';
            listenBtn.disabled = false;
          }
          isSpeakingSequence = false;
        });
      });
    }
  }

  function speakSinglePhrase(text, lang, onEndCallback) {
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = lang;
    
    // Set speech properties
    currentUtterance.rate = 1;
    currentUtterance.pitch = 1;
    currentUtterance.volume = 1;
    
    // Try to get a voice for the selected language
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Look for a voice that matches the language
      const voice = voices.find(v => v.lang.includes(lang.substring(0, 2))) || 
                    voices.find(v => v.lang.includes(lang.split('-')[1])) ||
                    voices.find(v => v.lang.includes(lang));
      
      if (voice) {
        currentUtterance.voice = voice;
      }
    }
    
    // Event handlers
    currentUtterance.onstart = function() {
      if (listenBtn && !isSpeakingSequence) {
        listenBtn.textContent = '🔊 Speaking...';
        listenBtn.disabled = true;
      }
    };
    
    currentUtterance.onend = function() {
      currentUtterance = null;
      if (onEndCallback) {
        onEndCallback();
      }
    };
    
    currentUtterance.onerror = function() {
      currentUtterance = null;
      if (onEndCallback) {
        onEndCallback();
      }
      if (listenBtn && !isSpeakingSequence) {
        listenBtn.textContent = '🔊 Listen';
        listenBtn.disabled = false;
      }
    };
    
    // Speak the text
    speechSynthesis.speak(currentUtterance);
  }

  // Load voices when they become available
  speechSynthesis.onvoiceschanged = function() {
    // Voices are now loaded, but we don't need to do anything specific here
    // The speakSinglePhrase function will use them when called
  };

  function updateStatus(text) {
    if (statusEl) {
      statusEl.textContent = text;
    }
  }
  
  /**
   * Create cracked glass effect with random RGB glowing lines
   */
  function createCrackedGlass() {
    const crackLayer = document.getElementById('crackLayer');
    if (!crackLayer) return;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Create crack origin points (like impact points) - spread across screen
    const crackOrigins = [
      // Left side
      { x: screenWidth * 0.15, y: screenHeight * 0.3 },
      { x: screenWidth * 0.25, y: screenHeight * 0.7 },
      // Center
      { x: screenWidth * 0.5, y: screenHeight * 0.5 },
      // Right side
      { x: screenWidth * 0.75, y: screenHeight * 0.4 },
      { x: screenWidth * 0.85, y: screenHeight * 0.65 }
    ];

    // Create cracks from each origin
    crackOrigins.forEach((origin, originIndex) => {
      const numCracks = 8 + Math.floor(Math.random() * 7); // 8-15 cracks per origin
      
      for (let i = 0; i < numCracks; i++) {
        const crack = document.createElement('div');
        crack.className = 'crack-line';
        
        // Random angle for crack direction
        const angle = (360 / numCracks) * i + (Math.random() - 0.5) * 45;
        
        // Random length for crack
        const length = 100 + Math.random() * 300; // 100-400px
        const width = 1 + Math.random() * 2; // 1-3px
        
        // Set crack properties
        crack.style.left = origin.x + 'px';
        crack.style.top = origin.y + 'px';
        crack.style.width = length + 'px';
        crack.style.height = width + 'px';
        crack.style.transform = `rotate(${angle}deg)`;
        
        // Random animation delay for staggered glow effect
        crack.style.animationDelay = (Math.random() * 2) + 's';
        
        crackLayer.appendChild(crack);
      }
      
      // Add smaller branching cracks
      const branchCracks = 5 + Math.floor(Math.random() * 5); // 5-10 branch cracks
      for (let i = 0; i < branchCracks; i++) {
        const crack = document.createElement('div');
        crack.className = 'crack-line';
        
        // Offset from origin
        const offsetAngle = Math.random() * 360;
        const offsetDistance = 50 + Math.random() * 150;
        const branchX = origin.x + Math.cos(offsetAngle * Math.PI / 180) * offsetDistance;
        const branchY = origin.y + Math.sin(offsetAngle * Math.PI / 180) * offsetDistance;
        
        // Random angle for branch
        const angle = Math.random() * 360;
        const length = 50 + Math.random() * 150; // Smaller branches
        const width = 0.5 + Math.random(); // Thinner branches
        
        crack.style.left = branchX + 'px';
        crack.style.top = branchY + 'px';
        crack.style.width = length + 'px';
        crack.style.height = width + 'px';
        crack.style.transform = `rotate(${angle}deg)`;
        crack.style.animationDelay = (Math.random() * 2) + 's';
        crack.style.opacity = 0.6; // Make branches slightly less visible
        
        crackLayer.appendChild(crack);
      }
    });
  }
  
  /**
   * Start gesture detection simulation with motion tracking
   */
  function startGestureSimulation() {
    const overlay = document.getElementById('gestureOverlay');
    const confidenceFill = document.getElementById('confidenceFill');
    const confidenceText = document.getElementById('confidenceText');
    
    if (!overlay) return;
    
    overlay.style.display = 'block';
    
    // Create hidden canvas for motion detection
    if (!motionDetectionCanvas) {
      motionDetectionCanvas = document.createElement('canvas');
      motionDetectionContext = motionDetectionCanvas.getContext('2d', { willReadFrequently: true });
    }
    
    // Gesture types to simulate
    const gestures = [
      'Hello',
      'Thank You',
      'Yes',
      'No',
      'Please',
      'Sorry',
      'Help',
      'Good'
    ];
    
    let currentGestureIndex = 0;
    let detectedHands = [];
    
    // Function to detect motion/hands in video
    function detectMotionRegions() {
      if (!video || video.videoWidth === 0) return [];
      
      // Set canvas size to match video
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      motionDetectionCanvas.width = Math.min(videoWidth, 320); // Smaller for performance
      motionDetectionCanvas.height = Math.min(videoHeight, 240);
      
      const scaleX = motionDetectionCanvas.width / videoWidth;
      const scaleY = motionDetectionCanvas.height / videoHeight;
      
      // Draw current frame
      motionDetectionContext.drawImage(video, 0, 0, motionDetectionCanvas.width, motionDetectionCanvas.height);
      const currentImageData = motionDetectionContext.getImageData(0, 0, motionDetectionCanvas.width, motionDetectionCanvas.height);
      
      if (!previousFrame) {
        previousFrame = currentImageData;
        return [];
      }
      
      // Detect motion areas
      const motionRegions = [];
      const blockSize = 20; // Divide into blocks
      const threshold = 25; // Motion sensitivity
      
      for (let y = 0; y < motionDetectionCanvas.height; y += blockSize) {
        for (let x = 0; x < motionDetectionCanvas.width; x += blockSize) {
          let motionPixels = 0;
          
          // Check pixels in this block
          for (let by = 0; by < blockSize && y + by < motionDetectionCanvas.height; by++) {
            for (let bx = 0; bx < blockSize && x + bx < motionDetectionCanvas.width; bx++) {
              const idx = ((y + by) * motionDetectionCanvas.width + (x + bx)) * 4;
              
              const diffR = Math.abs(currentImageData.data[idx] - previousFrame.data[idx]);
              const diffG = Math.abs(currentImageData.data[idx + 1] - previousFrame.data[idx + 1]);
              const diffB = Math.abs(currentImageData.data[idx + 2] - previousFrame.data[idx + 2]);
              const diff = (diffR + diffG + diffB) / 3;
              
              if (diff > threshold) {
                motionPixels++;
              }
            }
          }
          
          // If significant motion detected in this block
          if (motionPixels > (blockSize * blockSize * 0.3)) {
            motionRegions.push({ 
              x: (x / motionDetectionCanvas.width) * 100, 
              y: (y / motionDetectionCanvas.height) * 100,
              intensity: motionPixels
            });
          }
        }
      }
      
      previousFrame = currentImageData;
      
      // Cluster motion regions into hand positions (find 2 largest clusters)
      if (motionRegions.length > 0) {
        // Sort by intensity and group nearby regions
        motionRegions.sort((a, b) => b.intensity - a.intensity);
        
        const hands = [];
        const minDistance = 20; // Minimum distance between hands
        
        for (const region of motionRegions) {
          if (hands.length >= 2) break;
          
          // Check if this region is far enough from existing hands
          const isFarEnough = hands.every(hand => {
            const dx = hand.x - region.x;
            const dy = hand.y - region.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance > minDistance;
          });
          
          if (isFarEnough) {
            hands.push(region);
          }
        }
        
        return hands;
      }
      
      return [];
    }
    
    // Function to create hand bounding boxes based on detected motion
    function createHandBoxes() {
      // Detect hands from video motion
      const newHands = detectMotionRegions();
      
      // If hands detected, update positions smoothly
      if (newHands.length > 0) {
        detectedHands = newHands.map((hand, index) => {
          const existing = detectedHands[index];
          if (existing) {
            // Smooth interpolation
            return {
              x: existing.x + (hand.x - existing.x) * 0.3,
              y: existing.y + (hand.y - existing.y) * 0.3
            };
          }
          return { x: hand.x, y: hand.y };
        });
      }
      
      // If no hands detected, keep previous positions or use defaults
      if (detectedHands.length === 0) {
        detectedHands = [
          { x: 30, y: 40 },
          { x: 60, y: 50 }
        ];
      }
      
      // Ensure we always have 2 hands for display
      while (detectedHands.length < 2) {
        detectedHands.push({ 
          x: 30 + Math.random() * 40, 
          y: 30 + Math.random() * 40 
        });
      }
      
      // Remove old boxes and keypoints
      document.querySelectorAll('.hand-box').forEach(box => box.remove());
      document.querySelectorAll('.keypoint').forEach(kp => kp.remove());
      
      // Create boxes for detected hands
      detectedHands.slice(0, 2).forEach((hand, index) => {
        const box = document.createElement('div');
        box.className = 'hand-box';
        
        const size = { w: 12, h: 18 };
        
        box.style.left = hand.x + '%';
        box.style.top = hand.y + '%';
        box.style.width = size.w + '%';
        box.style.height = size.h + '%';
        box.setAttribute('data-gesture', gestures[currentGestureIndex]);
        box.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
        
        overlay.appendChild(box);
        
        // Create exactly 5 keypoints per hand (finger tips simulation)
        const keypointPositions = [
          { x: 0.2, y: 0.1 },  // Thumb
          { x: 0.4, y: 0.05 }, // Index
          { x: 0.6, y: 0.08 }, // Middle
          { x: 0.75, y: 0.15 },// Ring
          { x: 0.85, y: 0.25 } // Pinky
        ];
        
        keypointPositions.forEach((kpPos, i) => {
          const keypoint = document.createElement('div');
          keypoint.className = 'keypoint';
          
          // Position relative to hand box
          const kpLeft = hand.x + (kpPos.x * size.w);
          const kpTop = hand.y + (kpPos.y * size.h);
          
          keypoint.style.left = kpLeft + '%';
          keypoint.style.top = kpTop + '%';
          keypoint.style.animationDelay = (i * 0.1) + 's';
          keypoint.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
          
          overlay.appendChild(keypoint);
        });
      });
    }
    
    // Function to update confidence
    function updateConfidence() {
      const confidence = 75 + Math.floor(Math.random() * 20); // 75-95%
      confidenceFill.style.width = confidence + '%';
      confidenceText.textContent = `Confidence: ${confidence}%`;
    }
    
    // Initial setup
    updateConfidence();
    
    // Fast update loop for real-time tracking (30fps)
    const animationInterval = setInterval(() => {
      createHandBoxes();
    }, 33); // ~30fps
    
    // Update gesture every 3-4 seconds
    const gestureInterval = setInterval(() => {
      currentGestureIndex = (currentGestureIndex + 1) % gestures.length;
      updateConfidence();
    }, 3000 + Math.random() * 1000);
    
    // Store intervals for cleanup
    gestureSimulationInterval = {
      animation: animationInterval,
      gesture: gestureInterval
    };
  }
  
  /**
   * Stop gesture detection simulation
   */
  function stopGestureSimulation() {
    const overlay = document.getElementById('gestureOverlay');
    
    if (gestureSimulationInterval) {
      // Clear all intervals
      if (gestureSimulationInterval.animation) {
        clearInterval(gestureSimulationInterval.animation);
      }
      if (gestureSimulationInterval.movement) {
        clearInterval(gestureSimulationInterval.movement);
      }
      if (gestureSimulationInterval.gesture) {
        clearInterval(gestureSimulationInterval.gesture);
      }
      gestureSimulationInterval = null;
    }
    
    // Reset motion detection
    previousFrame = null;
    
    if (overlay) {
      overlay.style.display = 'none';
      // Clean up overlays
      document.querySelectorAll('.hand-box').forEach(box => box.remove());
      document.querySelectorAll('.keypoint').forEach(kp => kp.remove());
    }
  }
})();