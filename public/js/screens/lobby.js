import { avatar, copyText, h, replace, thumb } from '../dom.js';
import { warmUpFaceDetector } from '../components/faceblur.js';
import { send } from '../net.js';
import { store } from '../store.js';

const MODES = {
  classic: { emoji: '📝', title: 'Petit bac', text: 'Retrouve le titre caché de chaque miniature, puis notez-vous entre vous.', min: 1, c1: '#ff4fa3', c2: '#e0207e' },
  invent: { emoji: '💡', title: 'Invente', text: 'Invente le titre le plus drôle. Les votes désignent le roi de la blague.', min: 1, c1: '#4be37a', c2: '#14b24b' },
  chain: { emoji: '🎨', title: 'Téléphone arabe', text: 'Titre → dessin → titre… façon Gartic Phone, avec la vidéo de chacun.', min: 3, c1: '#38c6ff', c2: '#1f6bff' },
  creator: { emoji: '📺', title: 'Qui a sorti ça ?', text: 'Miniature floutée, titre visible : retrouve la chaîne YouTube.', min: 1, c1: '#a86bff', c2: '#6d2fe0' },
};

// ---------- contrôles de réglages ----------

function segmented({ label, key, options, hint }) {
  const buttons = options.map((o) =>
    h('button', { type: 'button', class: 'seg-btn', onClick: () => send({ t: 'settings', [key]: o.v }) }, o.label),
  );
  const el = h('div', { class: 'setting' },
    h('div', { class: 'setting-head' }, h('span', {}, label)),
    h('div', { class: 'seg' }, buttons),
    hint && h('p', { class: 'hint' }, hint),
  );
  return {
    el,
    sync(s) {
      buttons.forEach((b, i) => {
        b.classList.toggle('on', String(options[i].v) === String(s.settings[key]));
        b.disabled = !store.isHost;
      });
    },
  };
}

function slider({ label, key, min, max, step = 1, fmt = (v) => v, hint }) {
  const value = h('b', {});
  let lastSent = 0;
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    onInput: () => {
      value.textContent = fmt(Number(input.value));
      const now = Date.now();
      if (now - lastSent > 120) {
        lastSent = now;
        send({ t: 'settings', [key]: Number(input.value) });
      }
    },
    onChange: () => send({ t: 'settings', [key]: Number(input.value) }),
  });
  const el = h('div', { class: 'setting' },
    h('div', { class: 'setting-head' }, h('span', {}, label), value),
    input,
    hint && h('p', { class: 'hint' }, hint),
  );
  return {
    el,
    sync(s) {
      input.disabled = !store.isHost;
      if (document.activeElement !== input) input.value = s.settings[key];
      value.textContent = fmt(Number(s.settings[key]));
      input.style.setProperty('--pct', ((s.settings[key] - min) / (max - min)) * 100 + '%');
    },
  };
}

const seconds = (v) => `${v}s`;
const roundsAndTime = (maxTime = 120) => [
  slider({ label: 'Nombre de miniatures', key: 'rounds', min: 1, max: 30 }),
  slider({ label: 'Temps par miniature', key: 'timeSec', min: 10, max: maxTime, step: 5, fmt: seconds }),
];

function buildSettings(mode) {
  if (mode === 'invent') return roundsAndTime();
  if (mode === 'classic') {
    return [
      ...roundsAndTime(),
      segmented({
        label: 'Extrait vidéo',
        key: 'clipSec',
        options: [{ v: 0, label: 'Aucun' }, { v: 5, label: '5 s' }, { v: 10, label: '10 s' }, { v: 15, label: '15 s' }],
        hint: 'Un bouton permet d’écouter un passage de la vidéo pour aider à trouver le titre.',
      }),
    ];
  }
  if (mode === 'creator') {
    return [
      ...roundsAndTime(60),
      segmented({
        label: 'Zone floutée',
        key: 'blurArea',
        options: [{ v: 'face', label: '🙂 Visages seulement' }, { v: 'full', label: '🌫️ Toute l’image' }],
        hint: 'Les visages sont repérés automatiquement. Sans visage détecté, la miniature reste nette.',
      }),
      segmented({
        label: 'Intensité du flou',
        key: 'blur',
        options: [{ v: 'medium', label: 'Moyen' }, { v: 'strong', label: 'Fort' }, { v: 'max', label: 'Illisible' }],
        hint: 'Le flou diminue petit à petit pendant la manche.',
      }),
    ];
  }
  return [
    slider({ label: 'Temps pour écrire un titre', key: 'writeSec', min: 15, max: 120, step: 5, fmt: seconds }),
    slider({ label: 'Temps pour dessiner', key: 'drawSec', min: 30, max: 180, step: 5, fmt: seconds }),
    slider({
      label: 'Longueur des chaînes',
      key: 'chainRounds',
      min: 0,
      max: 11,
      fmt: (v) => (v === 0 ? 'Auto' : `${v} étapes`),
      hint: 'Auto = chaque vidéo passe par tous les joueurs.',
    }),
  ];
}

// ---------- écran ----------

export function createLobby(initial) {
  const code = initial.code;
  const link = `${location.origin}/?c=${code}`;
  let settingsMode = null;
  let settingsControls = [];
  const sigs = {};
  const once = (name, sig, fn) => {
    if (sigs[name] === sig) return;
    sigs[name] = sig;
    fn();
  };

  const codeCard = h('section', { class: 'card code-card' },
    h('div', {},
      h('div', { class: 'label' }, 'Code du lobby'),
      h('div', { class: 'code-tiles' }, [...code].map((c, i) => h('span', { style: { '--i': i } }, c))),
    ),
    h('div', { class: 'code-actions' },
      h('button', { class: 'btn btn-ghost', onClick: () => copyText(code) }, 'Copier le code'),
      h('button', { class: 'btn btn-cyan', onClick: () => copyText(link) }, '🔗 Copier le lien'),
    ),
  );

  const modeButtons = Object.entries(MODES).map(([key, m], i) =>
    h('button', { type: 'button', class: 'mode-card', dataset: { mode: key }, style: { '--c1': m.c1, '--c2': m.c2, '--i': i }, onClick: () => send({ t: 'settings', mode: key }) },
      h('span', { class: 'mode-emoji' }, m.emoji),
      h('span', { class: 'mode-title' }, m.title),
      h('span', { class: 'mode-text' }, m.text),
      h('span', { class: 'mode-min' }, m.min > 1 ? `${m.min} joueurs min.` : 'Dès 1 joueur'),
    ),
  );
  const modeTitle = h('h2', {}, 'Mode de jeu');
  const modeCard = h('section', { class: 'card' }, modeTitle, h('div', { class: 'mode-grid' }, modeButtons));

  const playersList = h('div', { class: 'players-grid' });
  const playersTitle = h('h2', {}, 'Joueurs');
  const playersCard = h('section', { class: 'card' }, playersTitle, playersList);

  const settingsBody = h('div', { class: 'settings' });
  const settingsTitle = h('h2', {}, 'Réglages');
  const settingsCard = h('section', { class: 'card' }, settingsTitle, settingsBody);

  const mineBody = h('div', {});
  const mineCard = h('section', { class: 'card' }, h('h2', {}, 'Ta vidéo'), mineBody);

  const startBar = h('section', { class: 'card start-panel' });
  const el = h('div', { class: 'lobby' },
    codeCard,
    modeCard,
    h('div', { class: 'lobby-cols' }, playersCard, h('div', { class: 'col' }, settingsCard, mineCard, startBar)),
  );

  function renderPlayers(s) {
    const host = store.isHost;
    playersTitle.textContent = `Joueurs (${s.players.filter((p) => p.connected).length})`;
    replace(playersList,
      s.players.map((p) =>
        h('div', { class: `player-tile ${p.connected ? '' : 'away'} ${p.id === s.me ? 'me' : ''}` },
          avatar(p, 52),
          h('div', { class: 'player-info' },
            h('b', {}, p.name, p.id === s.me && h('em', {}, ' (toi)')),
            h('small', {},
              p.id === s.hostId ? '👑 Chef du lobby' : p.connected ? 'Prêt' : 'Déconnecté',
              s.settings.mode === 'chain' && (p.hasVideo ? ' · 🎬 vidéo ok' : ' · attend sa vidéo'),
            ),
          ),
          host && p.id !== s.me && h('button', { class: 'icon-btn', title: 'Exclure', onClick: () => send({ t: 'kick', pid: p.id }) }, '✕'),
        ),
      ),
    );
  }

  function renderModes(s) {
    modeTitle.textContent = store.isHost ? 'Choisis le mode de jeu' : 'Mode de jeu (choisi par le chef)';
    modeButtons.forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === s.settings.mode);
      b.disabled = !store.isHost;
    });
  }

  function renderSettings(s) {
    if (settingsMode !== s.settings.mode) {
      settingsMode = s.settings.mode;
      settingsControls = buildSettings(settingsMode);
      replace(settingsBody, settingsControls.map((c) => c.el));
    }
    settingsControls.forEach((c) => c.sync(s));
    if (settingsMode === 'creator' && s.settings.blurArea === 'face') warmUpFaceDetector();
    settingsTitle.textContent = `Réglages · ${MODES[settingsMode].title}`;
  }

  // --- vidéo perso (téléphone arabe uniquement) ---
  const myInput = h('input', {
    class: 'input',
    placeholder: 'Lien de ta vidéo YouTube…',
    onKeydown: (e) => e.key === 'Enter' && submitMine(),
  });
  const submitMine = () => {
    if (!myInput.value.trim()) return;
    send({ t: 'setMyVideo', url: myInput.value });
    myInput.value = '';
  };

  function renderMine(s) {
    const chain = s.settings.mode === 'chain';
    mineCard.classList.toggle('hidden', !chain);
    if (!chain) return;
    once('mine', JSON.stringify(s.myVideo), () => {
      const mine = s.myVideo;
      replace(mineBody,
        h('p', { class: 'hint' }, 'Choisis la vidéo que tes potes devront deviner puis dessiner. Personne ne verra son titre avant la fin.'),
        mine
          ? h('div', { class: 'video-row mine' },
              thumb(mine.id),
              h('div', { class: 'video-meta' }, h('b', {}, mine.title || 'Vidéo choisie'), h('small', {}, mine.author || '')),
              h('div', { class: 'video-actions' }, h('button', { class: 'icon-btn', title: 'Changer', onClick: () => send({ t: 'clearMyVideo' }) }, '↺')),
            )
          : h('div', { class: 'row-wrap grow' }, myInput, h('button', { class: 'btn btn-primary', onClick: submitMine }, 'Valider')),
      );
    });
  }

  function renderStart(s) {
    const mode = s.settings.mode;
    const online = s.players.filter((p) => p.connected);
    let problem = '';
    if (mode === 'chain') {
      if (online.length < 3) problem = `Il faut au moins 3 joueurs (${online.length}/3).`;
      else {
        const lazy = online.filter((p) => !p.hasVideo);
        if (lazy.length) problem = `En attente d’une vidéo de ${lazy.map((p) => p.name).join(', ')}.`;
      }
    } else if (!s.videoCount) {
      problem = 'Chargement des vidéos…';
    }
    const host = store.isHost;
    once('start', JSON.stringify([host, problem, mode, online.length, s.hostId]), () => {
      replace(startBar,
        host
          ? [
              h('button', { class: 'btn btn-primary btn-xl', disabled: !!problem, onClick: () => send({ t: 'start' }) }, '🚀 Lancer la partie'),
              problem ? h('span', { class: 'start-hint warn' }, problem) : h('span', { class: 'start-hint' }, `${MODES[mode].title} · ${online.length} joueur${online.length > 1 ? 's' : ''}`),
            ]
          : h('div', { class: 'waiting' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), `Le chef (${store.player(s.hostId)?.name ?? '…'}) lance la partie`),
      );
    });
  }

  function update(s) {
    renderPlayers(s);
    renderModes(s);
    renderSettings(s);
    renderMine(s);
    renderStart(s);
  }
  update(initial);

  return { el, update };
}
