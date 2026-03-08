(async () => {

  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'grid';

  // ── State ──────────────────────────────────────────────────────
  let audioCtx = null, analyser = null, visualizer = null;
  let animId = null, currentPresetName = '';
  let allPresets = {}, filteredNames = [];
  let fpsFrames = 0, fpsLast = performance.now();
  let sourceNode = null;

  const canvas    = document.getElementById('main-canvas');
  const wrap      = document.getElementById('canvas-wrap');
  const statusEl  = document.getElementById('status');
  const overlayP  = document.getElementById('overlay-preset');
  const overlayR  = document.getElementById('overlay-res');
  const footerP   = document.getElementById('preset-name-footer');
  const blendSlider = document.getElementById('blend-slider');
  const blendVal  = document.getElementById('blend-val');
  const metersEl  = document.getElementById('meters');

  // ── Meters UI ─────────────────────────────────────────────────
  const NUM_BARS = 16;
  for (let i = 0; i < NUM_BARS; i++) {
    const b = document.createElement('div');
    b.className = 'meter-bar';
    b.style.height = '2px';
    metersEl.appendChild(b);
  }
  const meterBars = [...metersEl.querySelectorAll('.meter-bar')];

  function updateMeters(freqData) {
    const step = Math.floor(freqData.length / NUM_BARS);
    meterBars.forEach((b, i) => {
      const val = freqData[i * step] / 255;
      b.style.height = (4 + val * 48) + 'px';
      b.style.opacity = 0.3 + val * 0.7;
    });
  }

  // ── Audio setup ───────────────────────────────────────────────
  async function initAudio() {
    if (audioCtx) return; // already inited
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
  }

  async function startMic() {
    await initAudio();
    if (sourceNode) sourceNode.disconnect();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    sourceNode = audioCtx.createMediaStreamSource(stream);
    initVisualizer();
    rebuildAudioGraph();
    setStatus('MIC LIVE');
  }

  async function loadFile(file) {
    await initAudio();
    if (sourceNode) sourceNode.disconnect();
    const buf = await file.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(buf);
    const bufSrc = audioCtx.createBufferSource();
    bufSrc.buffer = decoded;
    bufSrc.loop = true;
    bufSrc.connect(audioCtx.destination);
    bufSrc.start();
    sourceNode = bufSrc;
    initVisualizer();
    rebuildAudioGraph();
    setStatus('FILE: ' + file.name.slice(0, 20));
  }

  // ── Visualizer ────────────────────────────────────────────────
  function initVisualizer() {
    document.getElementById('start-screen').style.display = 'none';
    const W = wrap.clientWidth, H = wrap.clientHeight;
    canvas.width = W; canvas.height = H;

    if (visualizer) {
      visualizer.setRendererSize(W, H);
    } else {
      visualizer = butterchurn.default.createVisualizer(audioCtx, canvas, { width: W, height: H });
      visualizer.connectAudio(analyser);
      // Load first preset
      const firstName = Object.keys(allPresets)[0];
      if (firstName) loadPreset(firstName, 0);
    }

    if (!animId) animate();
  }

  function resizeVisualizer() {
    if (!visualizer) return;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    canvas.width = W; canvas.height = H;
    visualizer.setRendererSize(W, H);
    overlayR.textContent = W + '×' + H;
  }

  new ResizeObserver(resizeVisualizer).observe(wrap);

  // ── Animation loop ────────────────────────────────────────────
  const freqData = new Uint8Array(1024);
  function animate() {
    animId = requestAnimationFrame(animate);
    if (!visualizer || !analyser) return;
    analyser.getByteFrequencyData(freqData);
    updateMeters(freqData);
    visualizer.render();

    fpsFrames++;
    const now = performance.now();
    if (now - fpsLast > 1000) {
      document.getElementById('fps-counter').textContent = fpsFrames + ' fps';
      fpsFrames = 0;
      fpsLast = now;
    }
  }

  // ── Presets ───────────────────────────────────────────────────
  // In browser UMD: window.butterchurnPresets = factory result = object with getPresets()
  allPresets = butterchurnPresets.getPresets();
  filteredNames = Object.keys(allPresets).sort();

  function renderPresetList(names) {
    const list = document.getElementById('preset-list');
    list.innerHTML = '';
    names.forEach(name => {
      const el = document.createElement('div');
      el.className = 'preset-item' + (name === currentPresetName ? ' selected' : '');
      el.textContent = name;
      el.title = name;
      el.onclick = () => loadPreset(name, parseFloat(blendSlider.value));
      list.appendChild(el);
    });
  }

  function loadPreset(name, blendSeconds = 2) {
    if (!visualizer) return;
    const preset = allPresets[name];
    visualizer.loadPreset(preset, blendSeconds);
    currentPresetName = name;
    overlayP.textContent = name.slice(0, 40) + (name.length > 40 ? '…' : '');
    footerP.textContent = name;
    // Update list selection
    document.querySelectorAll('.preset-item').forEach(el => {
      el.classList.toggle('selected', el.textContent === name);
    });
    // Scroll selected into view
    const sel = document.querySelector('.preset-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  // Search filter
  document.getElementById('preset-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    filteredNames = Object.keys(allPresets).sort().filter(n => n.toLowerCase().includes(q));
    renderPresetList(filteredNames);
  });

  renderPresetList(filteredNames);

  // Blend slider
  blendSlider.addEventListener('input', () => {
    blendVal.textContent = parseFloat(blendSlider.value).toFixed(1) + 's';
  });

  // ── Button handlers ───────────────────────────────────────────
  function setStatus(txt) {
    statusEl.textContent = txt;
    statusEl.className = 'active';
  }

  document.getElementById('btn-mic').onclick = startMic;
  document.getElementById('start-mic-big').onclick = startMic;
  document.getElementById('start-file-big').onclick = () => document.getElementById('file-input').click();
  document.getElementById('btn-file').onclick = () => document.getElementById('file-input').click();
  document.getElementById('file-input').onchange = e => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  };

// ── Modulation controls ───────────────────────────────────────
// Глобальный GainNode — вставляется между sourceNode и analyser
let masterGain = null;
let eqBass = null, eqMid = null, eqTreble = null;

// Вызывается после каждого initAudio() — перестраивает граф
function rebuildAudioGraph() {
  if (!audioCtx || !analyser) return;

  // Создаём ноды если ещё нет
  if (!masterGain) {
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;

    eqBass = audioCtx.createBiquadFilter();
    eqBass.type = 'lowshelf';
    eqBass.frequency.value = 200;
    eqBass.gain.value = 0;

    eqMid = audioCtx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    eqMid.gain.value = 0;

    eqTreble = audioCtx.createBiquadFilter();
    eqTreble.type = 'highshelf';
    eqTreble.frequency.value = 4000;
    eqTreble.gain.value = 0;

    // Применяем текущие значения ползунков (если уже двигали)
    eqBass.gain.value   = (parseFloat(document.getElementById('mod-bass').value) - 1) * 12;
    eqMid.gain.value    = (parseFloat(document.getElementById('mod-mid').value) - 1) * 12;
    eqTreble.gain.value = (parseFloat(document.getElementById('mod-treble').value) - 1) * 12;
    masterGain.gain.value = parseFloat(document.getElementById('mod-gain').value);
  }

  // Соединяем: sourceNode → masterGain → bass → mid → treble → analyser
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch(e) {}
    sourceNode.connect(masterGain);
  }
  masterGain.connect(eqBass);
  eqBass.connect(eqMid);
  eqMid.connect(eqTreble);
  eqTreble.connect(analyser);
  eqTreble.connect(audioCtx.destination);
}

  // Патчим все функции, которые меняют sourceNode, чтобы они перестраивали граф
  const _origStartMic  = startMic;
  const _origLoadFile  = loadFile;

  // ── Preset parameter patch ────────────────────────────────────
  // Butterchurn хранит параметры пресета в visualizer.preset (внутренний объект)
  // Ключи совпадают с JSON пресетов: zoom, warpScale, decay, gammaAdj и т.д.
  function patchPreset(key, value) {
    if (!visualizer) return;
    // Внутренний объект называется по-разному в разных сборках
    const p = visualizer.preset || visualizer.activePreset;
    if (p) {
      p[key] = value;
    }
  }

  // ── Слайдеры ─────────────────────────────────────────────────
  function makeSlider(id, valId, fmt, onInput) {
    const sl = document.getElementById(id);
    const vl = document.getElementById(valId);
    if (!sl) return;
    sl.addEventListener('input', () => {
      const v = parseFloat(sl.value);
      vl.textContent = fmt(v);
      onInput(v);
    });
  }

  makeSlider('mod-gain', 'mod-gain-val',
    v => v.toFixed(2),
    v => { if (masterGain) masterGain.gain.value = v; }
  );

  makeSlider('mod-bass', 'mod-bass-val',
    v => (v >= 1 ? '+' : '') + ((v - 1) * 12).toFixed(0) + 'dB',
    v => { if (eqBass) eqBass.gain.value = (v - 1) * 12; }
  );

  makeSlider('mod-mid', 'mod-mid-val',
    v => (v >= 1 ? '+' : '') + ((v - 1) * 12).toFixed(0) + 'dB',
    v => { if (eqMid) eqMid.gain.value = (v - 1) * 12; }
  );

  makeSlider('mod-treble', 'mod-treble-val',
    v => (v >= 1 ? '+' : '') + ((v - 1) * 12).toFixed(0) + 'dB',
    v => { if (eqTreble) eqTreble.gain.value = (v - 1) * 12; }
  );

  makeSlider('mod-zoom', 'mod-zoom-val',
    v => v.toFixed(3),
    v => patchPreset('zoom', v)
  );

  makeSlider('mod-warp', 'mod-warp-val',
    v => v.toFixed(2),
    v => patchPreset('warpScale', v)
  );

  makeSlider('mod-decay', 'mod-decay-val',
    v => v.toFixed(3),
    v => patchPreset('decay', v)
  );

  makeSlider('mod-speed', 'mod-speed-val',
    v => v.toFixed(2),
    v => patchPreset('videoEchoAlpha', v) // нет timeSpeed в 2.6.7 — используем echo
  );

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    // Не перехватываем если фокус в поле поиска
    if (e.target.id === 'preset-search') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'ArrowRight': {
        e.preventDefault();
        const idx = filteredNames.indexOf(currentPresetName);
        loadPreset(filteredNames[(idx + 1) % filteredNames.length], parseFloat(blendSlider.value));
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const idx = filteredNames.indexOf(currentPresetName);
        loadPreset(filteredNames[(idx - 1 + filteredNames.length) % filteredNames.length], parseFloat(blendSlider.value));
        break;
      }
      case 'KeyR':
        e.preventDefault();
        loadPreset(filteredNames[Math.floor(Math.random() * filteredNames.length)], parseFloat(blendSlider.value));
        break;
    }
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      // Входим в fullscreen — показываем только canvas-wrap
      document.getElementById('canvas-wrap').requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  overlayR.textContent = wrap.clientWidth + '×' + wrap.clientHeight;

})();