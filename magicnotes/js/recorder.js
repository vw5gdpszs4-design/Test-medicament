// Enregistreur vocal : onde en temps réel, pause / reprise, transcription (si le navigateur la propose).
import { icon } from './icons.js';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function pickMime() {
  const c = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac', 'audio/ogg'];
  if (!window.MediaRecorder) return null;
  return c.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function openRecorder() {
  return new Promise(async (resolve) => {
    const root = document.createElement('div');
    root.className = 'rec';
    root.innerHTML = `
      <div class="rec-backdrop"></div>
      <div class="rec-card">
        <div class="rec-head"><span class="rec-live"><i></i>Enregistrement</span>
          ${SR ? `<button class="chip rec-tr" data-r="tr">${icon('text')}Transcrire</button>` : ''}</div>
        <div class="rec-time">00:00</div>
        <canvas class="rec-wave"></canvas>
        <div class="rec-transcript" hidden></div>
        <div class="rec-ctrls">
          <button class="rec-btn ghost" data-r="cancel" aria-label="Annuler">${icon('x')}</button>
          <button class="rec-main" data-r="stop" aria-label="Terminer"><span></span></button>
          <button class="rec-btn ghost" data-r="pause" aria-label="Pause">${icon('pause')}</button>
        </div>
        <p class="rec-hint">Touchez le bouton central pour terminer</p>
      </div>`;
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('open'));

    const timeEl = root.querySelector('.rec-time');
    const cv = root.querySelector('.rec-wave');
    const ctx2 = cv.getContext('2d');
    let stream, mr, actx, analyser, raf, chunks = [], levels = [], hist = [];
    let elapsed = 0, lastTs = 0, paused = false, done = false;
    let rec = null, transcript = '', interim = '';

    const finish = (result) => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      try { rec?.stop(); } catch {}
      stream?.getTracks().forEach((t) => t.stop());
      actx?.close?.();
      root.classList.remove('open');
      setTimeout(() => root.remove(), 320);
      resolve(result);
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      finish({ error: 'Accès au micro refusé. Autorisez le micro dans les réglages.' });
      return;
    }
    const mime = pickMime();
    try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch { mr = new MediaRecorder(stream); }
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.start(250);

    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      await actx.resume?.();
      const src = actx.createMediaStreamSource(stream);
      analyser = actx.createAnalyser(); analyser.fftSize = 1024;
      src.connect(analyser);
    } catch {}
    const buf = new Float32Array(1024);

    function draw(ts) {
      raf = requestAnimationFrame(draw);
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000; lastTs = ts;
      if (!paused) elapsed += dt;
      timeEl.textContent = fmt(elapsed);
      let lv = 0;
      if (analyser && !paused) {
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        lv = Math.min(1, Math.sqrt(s / buf.length) * 5.5);
        levels.push(lv);
      }
      if (!paused) { hist.push(lv); if (hist.length > 400) hist.shift(); }
      const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2.clearRect(0, 0, w, h);
      const bw = 3, gap = 2.5, n = Math.floor(w / (bw + gap));
      const st = getComputedStyle(root);
      ctx2.fillStyle = st.getPropertyValue('--rec-wave') || '#E5484D';
      for (let i = 0; i < n; i++) {
        const v = hist[hist.length - n + i] ?? 0;
        const bh = Math.max(3, v * h * 0.9);
        const x = i * (bw + gap);
        ctx2.globalAlpha = 0.35 + (i / n) * 0.65;
        ctx2.beginPath(); ctx2.roundRect ? ctx2.roundRect(x, (h - bh) / 2, bw, bh, 1.5) : ctx2.rect(x, (h - bh) / 2, bw, bh); ctx2.fill();
      }
    }
    raf = requestAnimationFrame(draw);

    function startTranscription() {
      if (!SR || rec) return;
      rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
      const box = root.querySelector('.rec-transcript'); box.hidden = false;
      box.textContent = 'À l’écoute…';
      rec.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) transcript += r[0].transcript + ' '; else interim += r[0].transcript;
        }
        box.textContent = (transcript + interim).trim() || 'À l’écoute…';
        box.scrollTop = box.scrollHeight;
      };
      rec.onend = () => { if (!done && !paused && rec) try { rec.start(); } catch {} };
      try { rec.start(); } catch {}
      root.querySelector('.rec-tr')?.classList.add('on');
    }

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const a = b.dataset.r;
      if (a === 'cancel') {
        if (elapsed > 3 && !confirm('Supprimer cet enregistrement ?')) return;
        try { mr.stop(); } catch {}
        finish(null);
      } else if (a === 'pause') {
        if (!paused) { mr.pause?.(); paused = true; b.innerHTML = icon('mic'); root.classList.add('paused'); try { rec?.stop(); } catch {} }
        else { mr.resume?.(); paused = false; b.innerHTML = icon('pause'); root.classList.remove('paused'); try { rec?.start(); } catch {} }
      } else if (a === 'tr') {
        startTranscription();
      } else if (a === 'stop') {
        mr.onstop = () => {
          const type = mr.mimeType || mime || 'audio/mp4';
          const blob = new Blob(chunks, { type });
          const bars = 48, peaks = [];
          const step = Math.max(1, levels.length / bars);
          for (let i = 0; i < bars; i++) {
            const sl = levels.slice(Math.floor(i * step), Math.floor((i + 1) * step));
            peaks.push(sl.length ? Math.max(...sl) : 0);
          }
          const mx = Math.max(0.05, ...peaks);
          finish({ blob, mime: type, dur: elapsed, peaks: peaks.map((p) => +(p / mx).toFixed(2)), transcript: transcript.trim() });
        };
        try { mr.requestData?.(); } catch {}
        mr.stop();
      }
    });
  });
}
