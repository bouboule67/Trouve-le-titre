import { h, toast } from '../dom.js';

let apiPromise;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ||= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = resolve;
    document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
  });
  return apiPromise;
}

/**
 * Extrait de N secondes de la vidéo, en indice supplémentaire.
 * Le cadre est rogné pour masquer la barre de titre du lecteur YouTube.
 */
export function clipPlayer({ videoId, frac, seconds }) {
  const mount = h('div');
  const frame = h('div', { class: 'clip-frame' }, mount);
  const progress = h('i');
  const button = h('button', { class: 'btn btn-cyan', type: 'button' }, `▶ Écouter un extrait de ${seconds}s`);
  const el = h('div', { class: 'clip' }, frame, h('div', { class: 'clip-side' }, button, h('div', { class: 'clip-bar' }, progress)));

  let player = null;
  let target = null;
  let stopTimer = null;
  let destroyed = false;

  const stop = () => {
    clearTimeout(stopTimer);
    try { player?.pauseVideo(); } catch {}
    frame.classList.remove('live');
    progress.style.transition = 'none';
    progress.style.width = '0%';
    button.disabled = false;
    button.textContent = `↻ Réécouter (${seconds}s)`;
  };

  const run = () => {
    frame.classList.add('live');
    progress.style.transition = 'none';
    progress.style.width = '0%';
    void progress.offsetWidth;
    progress.style.transition = `width ${seconds}s linear`;
    progress.style.width = '100%';
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stop, seconds * 1000);
  };

  const onState = (event) => {
    if (event.data !== 1 /* PLAYING */ || target !== null) return;
    // Premier lancement : on saute à un passage choisi par le serveur (identique pour tout le monde).
    const duration = player.getDuration();
    target = duration > seconds + 10 ? Math.floor(duration * frac) : 0;
    if (target > 0) player.seekTo(target, true);
    player.unMute();
    run();
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Chargement…';
    if (!player) {
      await loadYouTubeApi();
      if (destroyed) return;
      player = await new Promise((resolve) => {
        const p = new YT.Player(mount, {
          videoId,
          playerVars: { controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, origin: location.origin },
          events: {
            onReady: () => resolve(p),
            onStateChange: onState,
            onError: () => {
              toast('Cet extrait n’est pas disponible pour cette vidéo.', 'error');
              button.textContent = 'Extrait indisponible';
            },
          },
        });
      });
      player.mute();
      player.playVideo();
    } else {
      player.seekTo(target ?? 0, true);
      player.unMute();
      player.playVideo();
      run();
    }
    button.textContent = '🔊 Lecture…';
  });

  return {
    el,
    destroy() {
      destroyed = true;
      clearTimeout(stopTimer);
      try { player?.destroy(); } catch {}
    },
  };
}
