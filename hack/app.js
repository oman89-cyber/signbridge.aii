/*
  README: Client-side behavior for SignBridge.ai Mode Selector.
  - Adds click handlers for Deaf and Hearing buttons.
  - navigateTo(mode): stores selection and (for now) logs; shows a toast.
  TODO routes:
    - Deaf mode → /deaf.html (mic access, avatar + text)
    - Hearing mode → /hearing.html (camera access, ISL recognition)
*/

(function init() {
  const btnDeaf = document.getElementById('btn-deaf');
  const btnHearing = document.getElementById('btn-hearing');

  if (btnDeaf) {
    btnDeaf.addEventListener('click', () => navigateTo('deaf'));
  }
  if (btnHearing) {
    btnHearing.addEventListener('click', () => navigateTo('hearing'));
  }

  // Initialize cracked glass effect
  createCrackedGlass();
})();

/**
 * Store selected mode and perform next-step navigation (placeholder for now).
 * @param {('deaf'|'hearing')} mode
 */
function navigateTo(mode) {
  try {
    localStorage.setItem('userMode', mode);
  } catch (e) {
    // Storage may be unavailable (private mode); continue without blocking
  }

  // Placeholder: log the intended route
  // TODO: Replace with actual navigation when routes exist
  // deaf   → /deaf.html (mic access, avatar + text)
  // hearing→ /hearing.html (camera access, ISL recognition)
  console.log('[SignBridge] navigateTo →', mode);

  if (mode === 'deaf') {
    // Navigate immediately to Deaf Mode page (YouTube avatar variant)
    window.location.href = 'deaf-youtube.html';
    return;
  }

  // Keep toast for hearing until its page exists
  if (mode === 'hearing') {
    window.location.href = 'hearing.html';
    return;
  }

  showToast('Mode selected');
}

let toastTimerId = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimerId) {
    clearTimeout(toastTimerId);
  }
  toastTimerId = setTimeout(() => {
    toast.classList.remove('show');
    toastTimerId = null;
  }, 2000);
}

// Expose navigateTo for potential programmatic use/testing
window.navigateTo = navigateTo;

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


