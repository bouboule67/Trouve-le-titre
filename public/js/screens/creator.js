import { avatar, h, thumb } from '../dom.js';
import { act } from '../net.js';
import { faceBlurThumb, warmUpFaceDetector } from '../components/faceblur.js';
import { timerBar } from '../components/timer.js';
import { podium } from '../components/widgets.js';
import { store } from '../store.js';
import { celebrate, endActions, introScreen, roundPill } from './shared.js';

const FACE_BLUR = { medium: [26, 14], strong: [38, 22], max: [56, 34] };
const BLUR = { medium: [8, 3], strong: [14, 6], max: [24, 12] };

export function createCreator(s) {
  switch (s.game.phase) {
    case 'intro': return intro(s);
    case 'play': return play(s);
    case 'reveal': return reveal(s);
    default: return final(s);
  }
}

function intro(s) {
  const g = s.game;
  if (g.blurArea === 'face') warmUpFaceDetector();
  return introScreen({
    emoji: '🕵️',
    kicker: 'Qui a sorti ça ?',
    title: `Vidéo ${g.round + 1} / ${g.total}`,
    text: 'Le visage est flouté. Retrouve la chaîne YouTube, plus vite que les autres.',
    endsAt: g.endsAt,
    accent: 'var(--red)',
  });
}

function scoreList(s, solvedIds = []) {
  const g = s.game;
  const rows = [...g.participants].sort((a, b) => (g.scores[b] || 0) - (g.scores[a] || 0));
  return h('ul', { class: 'score-list' },
    rows.map((id) => {
      const p = store.player(id);
      return h('li', { class: solvedIds.includes(id) ? 'solved' : '' },
        avatar(p, 30), h('span', { class: 'rank-name' }, p?.name), solvedIds.includes(id) && h('i', {}, '✓'), h('b', {}, g.scores[id] || 0));
    }),
  );
}

function play(s) {
  const g = s.game;
  const [from, to] = BLUR[g.blur] || BLUR.strong;
  const total = g.endsAt - g.startedAt;
  const timer = timerBar(g.endsAt, total);

  const frame = faceBlurThumb(g.video.id, {
    full: BLUR[g.blur] || BLUR.strong,
    face: FACE_BLUR[g.blur] || FACE_BLUR.strong,
    total,
    startedAt: g.startedAt,
    area: g.blurArea,
  });

  const input = h('input', {
    class: 'input input-xl',
    placeholder: 'Nom de la chaîne…',
    maxLength: 60,
    autocomplete: 'off',
    onKeydown: (e) => e.key === 'Enter' && guess(),
  });
  const button = h('button', { class: 'btn btn-primary btn-lg', onClick: () => guess() }, 'Proposer');
  const feedback = h('p', { class: 'feedback' });
  const hint = h('div', { class: 'letters' });
  const scores = h('div', {});

  function guess() {
    const text = input.value.trim();
    if (!text || input.disabled) return;
    act('guess', { text });
    input.select();
  }

  const el = h('div', { class: 'play' },
    h('div', { class: 'play-head' }, roundPill(`Vidéo ${g.round + 1} / ${g.total}`), timer.el),
    h('div', { class: 'play-grid' },
      h('div', { class: 'stage' },
        frame.el,
        h('div', { class: 'real-title' }, h('span', { class: 'hidden-label' }, 'Titre'), h('b', {}, g.video.title)),
      ),
      h('div', { class: 'answer-card card' },
        h('label', { class: 'label' }, 'Qui a publié cette vidéo ?'),
        hint,
        input,
        button,
        feedback,
        h('div', { class: 'label' }, 'Scores'),
        scores,
      ),
    ),
  );

  let lastAttempts = g.my?.attempts || 0;
  function update(next) {
    const game = next.game;
    const my = game.my;
    const solved = !!my?.correct;
    input.disabled = solved;
    button.disabled = solved;
    hint.textContent = game.hint || '';
    hint.classList.toggle('show', !!game.hint);
    if (solved) {
      feedback.className = 'feedback ok';
      feedback.textContent = `✓ Bien vu ! +${my.points} pts`;
    } else if (my?.lastWrong) {
      feedback.className = 'feedback bad';
      feedback.textContent = `✗ « ${my.lastWrong} » n’est pas la bonne chaîne`;
      if ((my.attempts || 0) > lastAttempts) {
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 500);
      }
    } else {
      feedback.className = 'feedback';
      feedback.textContent = '';
    }
    lastAttempts = my?.attempts || 0;
    scores.replaceChildren(scoreList(next, game.solvedIds));
  }
  update(s);
  if (!g.my?.correct) setTimeout(() => input.focus(), 60);

  return { el, update, destroy() { timer.destroy(); frame.destroy(); } };
}

function reveal(s) {
  const g = s.game;
  const timer = timerBar(g.endsAt, g.endsAt - store.now(), { compact: true });
  const results = [...g.results].sort((a, b) => (b.correct - a.correct) || (b.points - a.points));
  const winners = results.filter((r) => r.correct).length;

  const el = h('div', { class: 'reveal' },
    h('div', { class: 'play-head' }, roundPill(`Vidéo ${g.round + 1} / ${g.total}`), timer.el),
    h('div', { class: 'play-grid' },
      h('div', { class: 'stage' },
        thumb(g.video.id, { cls: 'thumb-xl unveil' }),
        h('div', { class: 'real-title big' },
          h('span', { class: 'hidden-label' }, 'La chaîne'),
          h('b', { class: 'author-name' }, g.video.author),
          h('small', {}, g.video.title),
        ),
      ),
      h('div', { class: 'card' },
        h('div', { class: 'label' }, winners ? `${winners} joueur${winners > 1 ? 's' : ''} ${winners > 1 ? 'ont' : 'a'} trouvé` : 'Personne n’a trouvé 😬'),
        h('ul', { class: 'score-list' },
          results.map((r) => {
            const p = store.player(r.pid);
            return h('li', { class: r.correct ? 'solved' : 'missed' },
              avatar(p, 30), h('span', { class: 'rank-name' }, p?.name),
              r.correct ? h('b', { class: 'gain' }, `+${r.points}`) : h('b', { class: 'muted' }, '—'));
          }),
        ),
        h('div', { class: 'label' }, 'Classement'),
        scoreList(s),
        store.isHost && h('button', { class: 'btn btn-primary', onClick: () => act('skip') }, g.last ? 'Résultats finaux 🏆' : 'Suivant ›'),
      ),
    ),
  );
  return { el, update() {}, destroy: timer.destroy };
}

function final(s) {
  celebrate();
  const el = h('div', { class: 'final' },
    h('div', { class: 'kicker' }, 'Qui a sorti ça ?'),
    h('h1', { class: 'final-title' }, '🏆 Résultats'),
    podium(s.game.final.ranking, { unit: 'pts' }),
    endActions(),
  );
  return { el, update() {} };
}
