/* ============================================================
   VitalSign - Advanced Patient Monitoring System
   Features: Multi-gesture recognition, Face Mesh eye tracking,
   Sleep/Wake detection, Facial expression approx, Emergency alarm,
   Telegram notifications, Two-way TTS communication, History & Stats
   ============================================================ */

// -------------------- Global State --------------------
const state = {
  botToken: localStorage.getItem('cg_botToken') || '',
  chatId: localStorage.getItem('cg_chatId') || '',
  patientName: localStorage.getItem('cg_patientName') || 'Patient #01',
  holdTime: parseInt(localStorage.getItem('cg_holdTime')) || 900,
  cooldown: parseInt(localStorage.getItem('cg_cooldown')) || 4500,
  enableFace: localStorage.getItem('cg_enableFace') !== 'false',
  enableAlarm: localStorage.getItem('cg_enableAlarm') !== 'false',
  showLandmarks: localStorage.getItem('cg_showLandmarks') !== 'false',
  autoSpeak: localStorage.getItem('cg_autoSpeak') !== 'false',
  sleepThreshold: parseInt(localStorage.getItem('cg_sleepThreshold')) || 8,
  speechRate: parseFloat(localStorage.getItem('cg_speechRate')) || 1.0,
  alarmVolume: parseFloat(localStorage.getItem('cg_alarmVolume')) || 0.7,
  soundEnabled: true,
  lastGesture: null,
  gestureStart: 0,
  lastSent: 0,
  isSleeping: false,
  eyesClosedSince: 0,
  sessionStart: Date.now(),
  totalRequests: 0,
  emergencyCount: 0,
  requestHistory: [],
  lastUpdateId: 0,
  emergencyActive: false,
  emergencyStart: 0,
  fps: 0,
  frameCount: 0,
  lastFpsTime: Date.now(),
  currentExpression: 'Neutral',
  currentEAR: 0
};

// Gesture definitions (distance-friendly)
const GESTURES = [
  { id: 'point_up', name: 'Point Up', emoji: '☝️', action: 'Water', message: '💧 Patient needs Water', priority: 'normal' },
  { id: 'fist', name: 'Fist', emoji: '✊', action: 'Washroom', message: '🚻 Patient needs Washroom', priority: 'normal' },
  { id: 'victory', name: 'Victory', emoji: '✌️', action: 'Emergency', message: '🆘 EMERGENCY! Patient needs immediate help', priority: 'emergency' },
  { id: 'thumbs_up', name: 'Thumbs Up', emoji: '👍', action: 'Yes / OK', message: '👍 Patient says Yes / Okay', priority: 'normal' },
  { id: 'thumbs_down', name: 'Thumbs Down', emoji: '👎', action: 'No', message: '👎 Patient says No', priority: 'normal' },
  { id: 'ok_sign', name: 'OK Sign', emoji: '👌', action: 'Medicine', message: '💊 Patient needs Medicine / in Pain', priority: 'high' },
  { id: 'open_help', name: 'Open Hand', emoji: '🖐️', action: 'Call Nurse', message: '📞 Patient is calling for Nurse', priority: 'high' },
  { id: 'three_fingers', name: 'Three Fingers', emoji: '🖖', action: 'Feeling Cold', message: '🥶 Patient is Feeling Cold / needs Cover', priority: 'normal' }
];

// DOM references
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Audio context for alarm
let audioCtx = null;
let alarmOscillator = null;
let alarmGain = null;
let alarmInterval = null;

// -------------------- Initialization --------------------
window.addEventListener('DOMContentLoaded', () => {
  simulateLoading();
  loadConfigToUI();
  renderGestureCards();
  startClock();
  startSessionTimer();
  initVoices();
  initCameraAndVision();
  startTelegramPolling();
});

function simulateLoading() {
  const progress = document.getElementById('loadingProgress');
  let p = 0;
  const interval = setInterval(() => {
    p += Math.random() * 18 + 5;
    if (p >= 100) {
      p = 100;
      clearInterval(interval);
      setTimeout(() => {
        document.getElementById('loadingOverlay').classList.add('hidden');
      }, 400);
    }
    progress.style.width = p + '%';
  }, 180);
}

function loadConfigToUI() {
  document.getElementById('botToken').value = state.botToken;
  document.getElementById('chatId').value = state.chatId;
  document.getElementById('patientNameInput').value = state.patientName;
  document.getElementById('holdTime').value = state.holdTime;
  document.getElementById('cooldown').value = state.cooldown;
  document.getElementById('enableFace').checked = state.enableFace;
  document.getElementById('enableAlarm').checked = state.enableAlarm;
  document.getElementById('patientName').textContent = state.patientName;
}

function renderGestureCards() {
  const grid = document.getElementById('gesturesGrid');
  grid.innerHTML = GESTURES.map(g => `
    <div class="gesture-card" id="gcard-${g.id}">
      <div class="gesture-emoji">${g.emoji}</div>
      <div class="gesture-name">${g.name}</div>
      <div class="gesture-action">${g.action}</div>
    </div>
  `).join('');
}

// -------------------- Clock & Timers --------------------
function startClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById('liveClock').textContent = now.toLocaleTimeString('en-IN', { hour12: false });
  }, 1000);
}

function startSessionTimer() {
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('sessionTime').textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// -------------------- Camera + MediaPipe --------------------
let hands = null;
let faceMesh = null;
let camera = null;

function initCameraAndVision() {
  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65
  });
  hands.onResults(onHandResults);

  if (state.enableFace) {
    faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    faceMesh.onResults(onFaceResults);
  }

  camera = new Camera(video, {
    onFrame: async () => {
      if (hands) await hands.send({ image: video });
      if (faceMesh && state.enableFace) await faceMesh.send({ image: video });
      updateFPS();
    },
    width: 640,
    height: 480
  });

  camera.start()
    .then(() => {
      showToast('Camera ready – Vision systems active', 'success');
      document.getElementById('systemStatus').querySelector('span:last-child').textContent = 'SYSTEM ONLINE';
    })
    .catch(err => {
      showToast('Camera error: ' + err.message, 'error');
      document.getElementById('systemStatus').classList.remove('online');
    });
}

function updateFPS() {
  state.frameCount++;
  const now = Date.now();
  if (now - state.lastFpsTime >= 1000) {
    state.fps = state.frameCount;
    state.frameCount = 0;
    state.lastFpsTime = now;
    document.getElementById('fpsBadge').textContent = state.fps + ' FPS';
  }
}

// -------------------- Hand Results & Gesture Detection --------------------
function onHandResults(results) {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    document.getElementById('handLandmarks').textContent = landmarks.length;
    document.getElementById('handBadge').textContent = 'HAND: DETECTED';
    document.getElementById('handBadge').className = 'badge badge-green';

    if (state.showLandmarks) {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#22d3ee', lineWidth: 2 });
      drawLandmarks(ctx, landmarks, { color: '#22c55e', lineWidth: 1, radius: 3 });
    }

    const gesture = detectGesture(landmarks);
    handleGesture(gesture);
  } else {
    document.getElementById('handLandmarks').textContent = '0';
    document.getElementById('handBadge').textContent = 'HAND: --';
    document.getElementById('handBadge').className = 'badge';
    resetGestureUI();
  }
  ctx.restore();
}

function detectGesture(lm) {
  const tip = (i) => lm[i];
  const pip = (i) => lm[i];

  // Finger extended check (tip higher than PIP for most fingers)
  const indexExt = tip(8).y < pip(6).y - 0.025;
  const middleExt = tip(12).y < pip(10).y - 0.025;
  const ringExt = tip(16).y < pip(14).y - 0.025;
  const pinkyExt = tip(20).y < pip(18).y - 0.025;

  // Thumb: compare x relative to wrist/index for left/right hand robustness
  const thumbExt = Math.abs(tip(4).x - tip(3).x) > 0.04 && tip(4).y < lm[2].y + 0.05;
  const thumbUp = tip(4).y < lm[2].y - 0.06 && !indexExt && !middleExt;
  const thumbDown = tip(4).y > lm[0].y + 0.05 && !indexExt && !middleExt;

  // OK sign: thumb tip close to index tip
  const okDist = Math.hypot(tip(4).x - tip(8).x, tip(4).y - tip(8).y);
  const isOK = okDist < 0.07 && middleExt && ringExt;

  // Three fingers: index + middle + ring extended, pinky folded
  const isThree = indexExt && middleExt && ringExt && !pinkyExt && !isOK;

  // Victory: index + middle extended, ring + pinky folded
  if (indexExt && middleExt && !ringExt && !pinkyExt && !isOK) {
    return GESTURES.find(g => g.id === 'victory');
  }

  // Three Fingers (Feeling Cold)
  if (isThree) {
    return GESTURES.find(g => g.id === 'three_fingers');
  }

  // Point Up: only index extended
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    return GESTURES.find(g => g.id === 'point_up');
  }

  // Fist: all folded
  if (!indexExt && !middleExt && !ringExt && !pinkyExt && !thumbUp && !thumbDown) {
    return GESTURES.find(g => g.id === 'fist');
  }

  // Thumbs Up
  if (thumbUp) {
    return GESTURES.find(g => g.id === 'thumbs_up');
  }

  // Thumbs Down
  if (thumbDown) {
    return GESTURES.find(g => g.id === 'thumbs_down');
  }

  // OK Sign
  if (isOK) {
    return GESTURES.find(g => g.id === 'ok_sign');
  }

  // Open Hand / Help: all extended
  if (indexExt && middleExt && ringExt && pinkyExt) {
    return GESTURES.find(g => g.id === 'open_help');
  }

  return null;
}

function handleGesture(gesture) {
  if (!gesture) {
    resetGestureUI();
    return;
  }

  // Update UI
  document.getElementById('gfName').textContent = `${gesture.emoji} ${gesture.name} → ${gesture.action}`;
  document.getElementById('lastGesture').textContent = gesture.action;
  document.getElementById('gfConf').textContent = 'Confidence: tracking...';

  // Highlight card
  document.querySelectorAll('.gesture-card').forEach(c => c.classList.remove('active'));
  const card = document.getElementById('gcard-' + gesture.id);
  if (card) card.classList.add('active');

  // Hold progress
  if (gesture.id === state.lastGesture) {
    const held = Date.now() - state.gestureStart;
    const progress = Math.min(100, (held / state.holdTime) * 100);
    document.getElementById('gfFill').style.width = progress + '%';

    if (held >= state.holdTime) {
      triggerRequest(gesture);
    }
  } else {
    state.lastGesture = gesture.id;
    state.gestureStart = Date.now();
    document.getElementById('gfFill').style.width = '0%';
  }
}

function resetGestureUI() {
  state.lastGesture = null;
  document.getElementById('gfName').textContent = 'Awaiting Gesture';
  document.getElementById('gfFill').style.width = '0%';
  document.getElementById('gfConf').textContent = 'Confidence: 0%';
  document.querySelectorAll('.gesture-card').forEach(c => c.classList.remove('active'));
}

// -------------------- Face Mesh: Eyes + Expression --------------------
function onFaceResults(results) {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    document.getElementById('faceLandmarks').textContent = '0';
    document.getElementById('faceBadge').textContent = 'FACE: --';
    document.getElementById('faceBadge').className = 'badge';
    document.getElementById('earValue').textContent = '--';
    document.getElementById('eyeStatus').textContent = '--';
    document.getElementById('expressionValue').textContent = '--';
    document.getElementById('faceExpression').textContent = '--';
    document.getElementById('sleepBar').style.width = '0%';
    document.getElementById('sleepDuration').textContent = '0s closed';
    document.getElementById('sleepStatusText').textContent = 'No face detected';
    // Reset sleep tracking when face is lost
    state.eyesClosedSince = 0;
    if (state.isSleeping) {
      state.isSleeping = false;
    }
    setPatientState('not_visible');
    return;
  }

  const face = results.multiFaceLandmarks[0];
  document.getElementById('faceLandmarks').textContent = face.length;
  document.getElementById('faceBadge').textContent = 'FACE: DETECTED';
  document.getElementById('faceBadge').className = 'badge badge-blue';

  if (state.showLandmarks) {
    // Draw a few key points lightly
    ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
    [33, 133, 362, 263, 1, 13, 14, 78, 308].forEach(i => {
      if (face[i]) {
        ctx.beginPath();
        ctx.arc(face[i].x * canvas.width, face[i].y * canvas.height, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Eye Aspect Ratio (EAR)
  const leftEAR = calculateEAR(face, [33, 160, 158, 133, 153, 144]);
  const rightEAR = calculateEAR(face, [362, 385, 387, 263, 373, 380]);
  const ear = (leftEAR + rightEAR) / 2;
  state.currentEAR = ear;
  document.getElementById('earValue').textContent = ear.toFixed(3);

  const eyesClosed = ear < 0.19;
  document.getElementById('eyeStatus').textContent = eyesClosed ? 'Closed' : 'Open';

  // Sleep / Wake logic
  if (eyesClosed) {
    if (state.eyesClosedSince === 0) state.eyesClosedSince = Date.now();
    const closedSec = (Date.now() - state.eyesClosedSince) / 1000;
    const pct = Math.min(100, (closedSec / state.sleepThreshold) * 100);
    document.getElementById('sleepBar').style.width = pct + '%';
    document.getElementById('sleepDuration').textContent = Math.floor(closedSec) + 's closed';
    document.getElementById('sleepStatusText').textContent = closedSec >= state.sleepThreshold
      ? 'Patient appears to be sleeping'
      : 'Eyes closed – monitoring...';

    if (closedSec >= state.sleepThreshold && !state.isSleeping) {
      state.isSleeping = true;
      setPatientState(true);
      addLogEntry({ type: 'sleep', title: 'Patient appears to be sleeping', icon: '😴' });
      sendTelegram('😴 Patient appears to be sleeping (eyes closed > ' + state.sleepThreshold + 's)');
    }
  } else {
    // Eyes open and face is visible → Patient is awake
    if (state.isSleeping) {
      state.isSleeping = false;
      addLogEntry({ type: 'wake', title: 'Patient has woken up', icon: '👁️' });
      sendTelegram('👁️ Patient has woken up – eyes are open');
      showToast('Patient woke up – notification sent', 'info');
    }
    setPatientState(false); // Always mark as AWAKE when face visible + eyes open
    state.eyesClosedSince = 0;
    document.getElementById('sleepBar').style.width = '0%';
    document.getElementById('sleepDuration').textContent = '0s closed';
    document.getElementById('sleepStatusText').textContent = 'Eyes open – Patient alert';
  }

  // Simple expression approximation
  const expression = approxExpression(face);
  state.currentExpression = expression;
  document.getElementById('expressionValue').textContent = expression;
  document.getElementById('faceExpression').textContent = expression;
}

function calculateEAR(face, indices) {
  // EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
  const p = indices.map(i => face[i]);
  if (p.some(pt => !pt)) return 0.3;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vertical1 = dist(p[1], p[5]);
  const vertical2 = dist(p[2], p[4]);
  const horizontal = dist(p[0], p[3]);
  if (horizontal === 0) return 0.3;
  return (vertical1 + vertical2) / (2 * horizontal);
}

function approxExpression(face) {
  // Mouth openness + some landmark ratios
  const upperLip = face[13];
  const lowerLip = face[14];
  const leftMouth = face[78];
  const rightMouth = face[308];
  if (!upperLip || !lowerLip || !leftMouth || !rightMouth) return 'Neutral';

  const mouthOpen = Math.abs(upperLip.y - lowerLip.y);
  const mouthWidth = Math.hypot(leftMouth.x - rightMouth.x, leftMouth.y - rightMouth.y);

  if (mouthOpen > 0.045) return 'Surprised / Open';
  if (mouthWidth > 0.12 && mouthOpen < 0.02) return 'Smiling';
  if (mouthOpen > 0.025) return 'Speaking';
  return 'Neutral';
}

function setPatientState(status) {
  // status: true = sleeping, false = awake, 'not_visible' = face not detected
  const el = document.getElementById('patientState');
  const ring = document.getElementById('avatarRing');
  const text = document.getElementById('stateText');
  const dot = el.querySelector('.state-dot');

  el.classList.remove('sleeping', 'not-visible');
  ring.classList.remove('sleeping', 'not-visible');
  if (dot) dot.classList.remove('awake', 'sleeping', 'not-visible');

  if (status === 'not_visible') {
    el.classList.add('not-visible');
    ring.classList.add('not-visible');
    if (dot) dot.classList.add('not-visible');
    text.textContent = 'NOT VISIBLE';
  } else if (status === true || status === 'sleeping') {
    el.classList.add('sleeping');
    ring.classList.add('sleeping');
    if (dot) dot.classList.add('sleeping');
    text.textContent = 'SLEEPING';
  } else {
    if (dot) dot.classList.add('awake');
    text.textContent = 'AWAKE';
  }
}

// -------------------- Request Triggering --------------------
function triggerRequest(gesture) {
  if (Date.now() - state.lastSent < state.cooldown) return;
  state.lastSent = Date.now();

  // Reset hold so it doesn't spam
  state.gestureStart = Date.now() + 999999;

  if (gesture.priority === 'emergency') {
    triggerEmergency(gesture);
  } else {
    sendTelegram(gesture.message);
    addLogEntry({
      type: gesture.priority,
      title: gesture.message,
      icon: gesture.emoji,
      gesture: gesture.name
    });
    showToast('Request sent: ' + gesture.action, 'success');
    state.totalRequests++;
    updateStats();
  }
}

function sendManualRequest(type) {
  const map = {
    'Water': GESTURES.find(g => g.id === 'point_up'),
    'Washroom': GESTURES.find(g => g.id === 'fist'),
    'Medicine': GESTURES.find(g => g.id === 'ok_sign')
  };
  const g = map[type];
  if (g) triggerRequest(g);
}

function triggerEmergency(gesture) {
  state.emergencyCount++;
  state.totalRequests++;
  updateStats();

  const msg = gesture ? gesture.message : '🆘 EMERGENCY! Patient needs immediate help';
  sendTelegram(msg);
  // Auto-send live photo so attender can see the patient
  sendPhotoToAttender('🆘 EMERGENCY – Live photo from patient camera');
  addLogEntry({ type: 'emergency', title: msg, icon: '🆘', gesture: 'Victory / Manual' });

  // Visual + Sound alarm
  if (state.enableAlarm && state.soundEnabled) {
    startAlarm();
  }
  document.getElementById('emergencyOverlay').classList.remove('hidden');
  state.emergencyActive = true;
  state.emergencyStart = Date.now();
  updateEmergencyTimer();
  showToast('EMERGENCY ALERT TRIGGERED – Photo sent', 'error');
}

function updateEmergencyTimer() {
  if (!state.emergencyActive) return;
  const elapsed = Math.floor((Date.now() - state.emergencyStart) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  document.getElementById('emergencyTimer').textContent = `${m}:${s}`;
  requestAnimationFrame(updateEmergencyTimer);
}

function dismissEmergency() {
  state.emergencyActive = false;
  document.getElementById('emergencyOverlay').classList.add('hidden');
  stopAlarm();
  showToast('Emergency alarm dismissed', 'info');
}

// -------------------- Alarm Sound (Web Audio) --------------------
function startAlarm() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    stopAlarm();

    const playBeep = () => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.value = state.alarmVolume * 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.stop(audioCtx.currentTime + 0.4);
    };

    playBeep();
    alarmInterval = setInterval(playBeep, 700);
  } catch (e) {
    console.warn('Audio alarm failed', e);
  }
}

function stopAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
}

// -------------------- Telegram --------------------
function sendTelegram(text) {
  if (!state.botToken || !state.chatId) {
    showToast('Set Bot Token & Chat ID in configuration', 'warning');
    return;
  }

  const url = `https://api.telegram.org/bot${state.botToken}/sendMessage`;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: state.chatId,
      text: text,
      parse_mode: 'HTML'
    })
  })
  .then(r => r.json())
  .then(data => {
    if (!data.ok) {
      showToast('Telegram error: ' + (data.description || 'failed'), 'error');
    }
  })
  .catch(() => showToast('Network error sending Telegram', 'error'));
}

function testTelegram() {
  sendTelegram('✅ VitalSign – Test message successful!\nSystem is online and ready.');
  showToast('Test message sent', 'info');
}

// Poll for incoming messages (two-way)
function startTelegramPolling() {
  setInterval(pollTelegram, 8000);
}

function pollTelegram() {
  if (!state.botToken || !state.chatId) return;

  const url = `https://api.telegram.org/bot${state.botToken}/getUpdates?offset=${state.lastUpdateId + 1}&limit=5`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.result) return;
      data.result.forEach(update => {
        state.lastUpdateId = Math.max(state.lastUpdateId, update.update_id);
        if (update.message && update.message.chat && String(update.message.chat.id) === String(state.chatId)) {
          const text = update.message.text;
          if (text) {
            handleIncomingMessage(text);
          }
        }
      });
    })
    .catch(() => {});
}

function isPhotoRequest(text) {
  const t = (text || '').trim().toLowerCase();
  // Codes attender can send to request a live photo
  const codes = [
    'photo', '/photo', 'snap', '/snap', 'see', 'see patient',
    'pic', 'picture', 'camera', 'view', 'show', 'look',
    'vs photo', 'vitalsign photo'
  ];
  return codes.some(c => t === c || t === c.replace('/', ''));
}

function handleIncomingMessage(text) {
  // Attender requested a live photo of the patient
  if (isPhotoRequest(text)) {
    showToast('Attender requested live photo…', 'info');
    sendPhotoToAttender('📷 Live photo requested by attender via Telegram');
    addLogEntry({ type: 'info', title: 'Attender requested live photo', icon: '📷' });
    // Acknowledge in chat panel
    const container = document.getElementById('incomingMessages');
    if (container.querySelector('.msg-placeholder')) container.innerHTML = '';
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'msg-item';
    div.innerHTML = `<div><strong>System:</strong> Photo request received — sending live view…</div><div class="msg-time">${time}</div>`;
    container.prepend(div);
    return;
  }

  // Skip bot commands that aren't photo requests
  if (text.trim().startsWith('/') && !isPhotoRequest(text)) return;

  const container = document.getElementById('incomingMessages');
  if (container.querySelector('.msg-placeholder')) container.innerHTML = '';

  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'msg-item';
  div.innerHTML = `<div>${escapeHtml(text)}</div><div class="msg-time">${time}</div>`;
  container.prepend(div);

  if (state.autoSpeak) {
    speakText('Message from attender: ' + text);
  }
  showToast('New message from attender', 'info');
}

// -------------------- TTS (Two-way) --------------------
function initVoices() {
  const select = document.getElementById('voiceSelect');
  const load = () => {
    const voices = speechSynthesis.getVoices();
    select.innerHTML = voices.map((v, i) =>
      `<option value="${i}">${v.name} (${v.lang})</option>`
    ).join('');
  };
  load();
  speechSynthesis.onvoiceschanged = load;
}

function speakText(text) {
  if (!state.soundEnabled) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = state.speechRate;
  const voices = speechSynthesis.getVoices();
  const idx = document.getElementById('voiceSelect')?.value;
  if (voices[idx]) utter.voice = voices[idx];
  speechSynthesis.speak(utter);
}

function sendChatToAttender() {
  const input = document.getElementById('attenderMessage');
  const text = input.value.trim();
  if (!text) return;

  // Show in local chat log
  const container = document.getElementById('incomingMessages');
  if (container.querySelector('.msg-placeholder')) container.innerHTML = '';
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'msg-item';
  div.style.borderLeftColor = 'var(--accent-cyan)';
  div.innerHTML = `<div><strong>Patient:</strong> ${escapeHtml(text)}</div><div class="msg-time">${time}</div>`;
  container.prepend(div);

  // Send to attender via Telegram
  sendTelegram('💬 Patient message:\n' + text);
  input.value = '';
  showToast('Message sent to attender', 'success');
}

function sendPhotoToAttender(caption) {
  if (!state.botToken || !state.chatId) {
    showToast('Set Bot Token & Chat ID first', 'warning');
    return;
  }
  if (!canvas || canvas.width === 0) {
    showToast('Camera not ready', 'warning');
    return;
  }

  showToast('Capturing photo...', 'info');

  canvas.toBlob(async (blob) => {
    if (!blob) {
      showToast('Could not capture photo', 'error');
      return;
    }
    try {
      const form = new FormData();
      form.append('chat_id', state.chatId);
      form.append('caption', caption || '📷 Live view from patient camera – VitalSign');
      form.append('photo', blob, 'patient-live.jpg');

      const res = await fetch(`https://api.telegram.org/bot${state.botToken}/sendPhoto`, {
        method: 'POST',
        body: form
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Photo sent to attender', 'success');
        addLogEntry({ type: 'info', title: 'Live photo sent to attender', icon: '📷' });
      } else {
        showToast('Photo failed: ' + (data.description || 'error'), 'error');
      }
    } catch (e) {
      showToast('Network error sending photo', 'error');
      console.error(e);
    }
  }, 'image/jpeg', 0.72);
}

// -------------------- History & Stats --------------------
function addLogEntry(entry) {
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  state.requestHistory.unshift({ ...entry, time });

  const log = document.getElementById('requestLog');
  if (log.querySelector('.log-empty')) log.innerHTML = '';

  const item = document.createElement('div');
  item.className = `log-item ${entry.type || ''}`;
  item.innerHTML = `
    <div class="log-icon">${entry.icon || '📋'}</div>
    <div class="log-content">
      <div class="log-title">${escapeHtml(entry.title)}</div>
      <div class="log-meta">${time}${entry.gesture ? ' · ' + entry.gesture : ''}</div>
    </div>
  `;
  log.prepend(item);

  // Keep max 50
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

function updateStats() {
  document.getElementById('totalRequests').textContent = state.totalRequests;
  document.getElementById('emergencyCount').textContent = state.emergencyCount;
}

function clearHistory() {
  state.requestHistory = [];
  document.getElementById('requestLog').innerHTML = '<div class="log-empty">No requests yet. Gestures will appear here.</div>';
  showToast('History cleared', 'info');
}

// -------------------- Config & Settings --------------------
function saveConfig() {
  state.botToken = document.getElementById('botToken').value.trim();
  state.chatId = document.getElementById('chatId').value.trim();
  state.patientName = document.getElementById('patientNameInput').value.trim() || 'Patient #01';
  state.holdTime = parseInt(document.getElementById('holdTime').value) || 900;
  state.cooldown = parseInt(document.getElementById('cooldown').value) || 4500;
  state.enableFace = document.getElementById('enableFace').checked;
  state.enableAlarm = document.getElementById('enableAlarm').checked;

  localStorage.setItem('cg_botToken', state.botToken);
  localStorage.setItem('cg_chatId', state.chatId);
  localStorage.setItem('cg_patientName', state.patientName);
  localStorage.setItem('cg_holdTime', state.holdTime);
  localStorage.setItem('cg_cooldown', state.cooldown);
  localStorage.setItem('cg_enableFace', state.enableFace);
  localStorage.setItem('cg_enableAlarm', state.enableAlarm);

  document.getElementById('patientName').textContent = state.patientName;
  showToast('Configuration saved', 'success');
}

function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('speechRate').value = state.speechRate;
  document.getElementById('alarmVolume').value = state.alarmVolume;
  document.getElementById('sleepThreshold').value = state.sleepThreshold;
  document.getElementById('autoSpeak').checked = state.autoSpeak;
  document.getElementById('showLandmarks').checked = state.showLandmarks;
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function saveAdvancedSettings() {
  state.speechRate = parseFloat(document.getElementById('speechRate').value);
  state.alarmVolume = parseFloat(document.getElementById('alarmVolume').value);
  state.sleepThreshold = parseInt(document.getElementById('sleepThreshold').value) || 8;
  state.autoSpeak = document.getElementById('autoSpeak').checked;
  state.showLandmarks = document.getElementById('showLandmarks').checked;

  localStorage.setItem('cg_speechRate', state.speechRate);
  localStorage.setItem('cg_alarmVolume', state.alarmVolume);
  localStorage.setItem('cg_sleepThreshold', state.sleepThreshold);
  localStorage.setItem('cg_autoSpeak', state.autoSpeak);
  localStorage.setItem('cg_showLandmarks', state.showLandmarks);

  closeSettings();
  showToast('Advanced settings applied', 'success');
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  document.getElementById('soundIcon').textContent = state.soundEnabled ? '🔊' : '🔇';
  if (!state.soundEnabled) stopAlarm();
  showToast(state.soundEnabled ? 'Sound enabled' : 'Sound muted', 'info');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

// -------------------- Utilities --------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Keyboard shortcut: Esc dismisses emergency
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.emergencyActive) dismissEmergency();
});
