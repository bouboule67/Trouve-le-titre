import { AVATARS, h, toast } from '../dom.js';
import { send } from '../net.js';
import { store } from '../store.js';

const PREFS_KEY = 'tlt.prefs';
const loadPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
};
const savePrefs = (prefs) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignoré */ }
};

const MODES = [
  { emoji: '📝', title: 'Petit bac', text: 'La miniature s’affiche, le titre est caché. Retrouve-le, puis notez-vous entre vous.', c1: '#ff4fa3', c2: '#e0207e' },
  { emoji: '🎨', title: 'Téléphone arabe', text: 'Titre, dessin, titre, dessin… Chaque vidéo passe de main en main façon Gartic Phone.', c1: '#38c6ff', c2: '#1f6bff' },
  { emoji: '💡', title: 'Invente', text: 'Invente le titre le plus drôle possible. Les potes votent pour le meilleur.', c1: '#4be37a', c2: '#14b24b' },
  { emoji: '📺', title: 'Qui a sorti ça ?', text: 'Miniature floutée, titre visible : retrouve le créateur le plus vite possible.', c1: '#a86bff', c2: '#6d2fe0' },
];

export function createHome() {
  const prefs = loadPrefs();
  let avatarChoice = prefs.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)];

  const nameInput = h('input', {
    class: 'input',
    placeholder: 'Ton pseudo',
    maxLength: 16,
    value: prefs.name || '',
    autocomplete: 'off',
    onInput: () => savePrefs({ name: nameInput.value, avatar: avatarChoice }),
  });

  const urlCode = (new URLSearchParams(location.search).get('c') || '').toUpperCase().slice(0, 4);
  const codeInput = h('input', {
    class: 'input code-input',
    placeholder: 'CODE',
    maxLength: 4,
    value: urlCode,
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: false,
    onInput: () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, ''); },
    onKeydown: (e) => e.key === 'Enter' && join(),
  });

  const avatarButtons = AVATARS.map((a) =>
    h('button', {
      type: 'button',
      class: `avatar-pick ${a === avatarChoice ? 'on' : ''}`,
      onClick: () => {
        avatarChoice = a;
        avatarButtons.forEach((b) => b.classList.toggle('on', b.textContent === a));
        savePrefs({ name: nameInput.value, avatar: a });
      },
    }, a),
  );

  const identity = () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.classList.add('shake');
      setTimeout(() => nameInput.classList.remove('shake'), 500);
      toast('Choisis un pseudo d’abord !', 'error');
      return null;
    }
    savePrefs({ name, avatar: avatarChoice });
    return { name, avatar: avatarChoice };
  };

  const create = () => {
    const me = identity();
    if (me) send({ t: 'create', ...me });
  };
  const join = () => {
    const me = identity();
    if (!me) return;
    if (codeInput.value.length !== 4) {
      codeInput.focus();
      return toast('Le code fait 4 lettres.', 'error');
    }
    send({ t: 'join', code: codeInput.value, ...me });
  };

  const offline = h('div', { class: 'conn-warning' }, 'Connexion au serveur…');
  const updateConn = () => offline.classList.toggle('show', store.status !== 'online');
  updateConn();

  const ticker = ['Trouve le titre', 'Dessine la miniature', 'Invente un titre drôle', 'Qui a sorti ça ?', 'Entre potes'];
  const marquee = h('div', { class: 'marquee', 'aria-hidden': 'true' },
    h('div', { class: 'marquee-track' },
      [0, 1].map(() => h('div', { class: 'marquee-set' }, ticker.map((t) => h('span', {}, t, h('i', {}, '✦'))))),
    ),
  );

  const el = h('div', { class: 'home' },
    marquee,
    h('section', { class: 'hero' },
      h('div', { class: 'hero-badge' }, '🎬 Jeu entre potes'),
      h('h1', { class: 'hero-title' }, h('span', { class: 't1' }, 'Trouve'), h('span', { class: 't2' }, 'le titre'), h('span', { class: 'sticker' }, 'sans prise de tête')),
      h('p', { class: 'hero-sub' }, 'Des miniatures YouTube, des titres cachés, des dessins foireux. Crée un lobby, envoie le code, c’est parti.'),
      h('div', { class: 'mode-teasers' },
        MODES.map((m, i) =>
          h('article', { class: 'teaser', style: { '--c1': m.c1, '--c2': m.c2, '--i': i }, onClick: () => nameInput.focus() },
            h('div', { class: 'teaser-emoji' }, m.emoji),
            h('h3', {}, m.title),
            h('p', {}, m.text),
          ),
        ),
      ),
    ),
    h('section', { class: 'card join-card' },
      offline,
      h('label', { class: 'label' }, 'Ton pseudo'),
      nameInput,
      h('label', { class: 'label' }, 'Ton avatar'),
      h('div', { class: 'avatar-grid' }, avatarButtons),
      h('button', { class: 'btn btn-primary btn-lg', onClick: create }, 'Créer un lobby'),
      h('div', { class: 'or' }, h('span', {}, 'ou rejoins un pote')),
      h('div', { class: 'join-row' },
        codeInput,
        h('button', { class: 'btn btn-cyan', onClick: join }, 'Rejoindre'),
      ),
    ),
  );

  if (urlCode.length === 4) setTimeout(() => (nameInput.value ? codeInput : nameInput).focus(), 50);

  return { el, update: updateConn };
}
