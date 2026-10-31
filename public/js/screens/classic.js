import { avatar, h, thumb } from '../dom.js';
import { act } from '../net.js';
import { clipPlayer } from '../components/clip.js';
import { timerBar } from '../components/timer.js';
import { playerStrip, podium, stars } from '../components/widgets.js';
import { store } from '../store.js';
import { celebrate, endActions, introScreen, roundPill } from './shared.js';

export function createClassic(s) {
  switch (s.game.phase) {
    case 'intro': return intro(s);
    case 'play':
    case 'collect': return play(s);
    case 'review': return review(s);
    default: return final(s);
  }
}

const isFun = (s) => s.game.mode === 'invent';

function intro(s) {
  const g = s.game;
  return introScreen({
    emoji: isFun(s) ? '🤣' : '✍️',
    kicker: isFun(s) ? 'Invente' : 'Petit bac',
    title: `Miniature ${g.round + 1} / ${g.total}`,
    text: isFun(s) ? 'Invente le titre le plus drôle pour cette miniature. Les autres voteront.' : 'Trouve le titre de la vidéo. Sois précis, drôle ou complètement à côté.',
    endsAt: g.endsAt,
  });
}

function play(s) {
  const g = s.game;
  const timer = timerBar(g.endsAt, g.timeSec * 1000);
  const input = h('input', {
    class: 'input input-xl',
    placeholder: isFun(s) ? 'Ton titre le plus drôle…' : 'Écris le titre de la vidéo…',
    maxLength: 120,
    autocomplete: 'off',
    value: g.my?.text || '',
    onKeydown: (e) => e.key === 'Enter' && toggle(),
  });
  const button = h('button', { class: 'btn btn-primary btn-lg', onClick: () => toggle() }, 'Valider');
  const status = h('p', { class: 'answer-status' });
  const strip = h('div', {});
  let done = !!g.my?.done;
  let sent = false;

  let collecting = false;
  function toggle() {
    if (collecting) return;
    if (done) return act('answer', { text: input.value, done: false });
    if (!input.value.trim()) {
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 500);
      return;
    }
    act('answer', { text: input.value, done: true });
  }

  const clip = g.clipSec
    ? clipPlayer({ videoId: g.video.id, frac: g.video.frac, seconds: g.clipSec })
    : null;

  const el = h('div', { class: 'play' },
    h('div', { class: 'play-head' }, roundPill(`Miniature ${g.round + 1} / ${g.total}`), timer.el),
    h('div', { class: 'play-grid' },
      h('div', { class: 'stage' },
        thumb(g.video.id, { cls: 'thumb-xl' }),
        !isFun(s) && h('div', { class: 'hidden-title' }, h('span', { class: 'hidden-label' }, 'Titre'), h('i'), h('i'), h('i')),
        clip?.el,
      ),
      h('div', { class: 'answer-card card' },
        h('label', { class: 'label' }, 'Ton titre'),
        input,
        button,
        status,
        h('div', { class: 'label' }, 'Ils ont répondu'),
        strip,
      ),
    ),
  );

  function update(next) {
    const game = next.game;
    done = !!game.my?.done;
    collecting = game.collecting;
    input.disabled = done || game.collecting;
    button.textContent = done ? '✎ Modifier' : 'Valider';
    button.classList.toggle('btn-primary', !done);
    button.classList.toggle('btn-ghost', done);
    button.disabled = game.collecting;
    status.textContent = game.collecting
      ? '⏱ Temps écoulé ! On récupère les réponses…'
      : done ? '✓ Réponse envoyée. On attend les autres…' : '';
    status.classList.toggle('ok', done);
    strip.replaceChildren(playerStrip(game.participants, game.doneIds));
    if (game.collecting && !sent) {
      sent = true;
      act('answer', { text: input.value });
    }
  }
  update(s);
  if (!done) setTimeout(() => input.focus(), 60);

  return { el, update, destroy() { timer.destroy(); clip?.destroy(); } };
}

function review(s) {
  const g = s.game;
  const me = s.me;
  const isAuthor = g.author === me;
  const author = g.author && store.player(g.author);
  const starEl = stars({
    value: g.myVote,
    disabled: !g.author || isAuthor,
    onPick: (n) => act('vote', { n }),
  });
  const progress = h('div', { class: 'vote-progress' });
  const avgBadge = h('div', { class: 'avg-badge' });
  const next = h('button', { class: 'btn btn-primary btn-lg', onClick: () => act('next') }, g.last ? 'Voir le classement 🏆' : 'Suivant ›');

  const answerBlock = author
    ? h('div', { class: 'answer-bubble' },
        h('div', { class: 'bubble-who' }, avatar(author, 44), h('b', {}, author.name), isAuthor && h('em', {}, ' (toi)')),
        h('p', { class: 'bubble-text' }, `« ${g.text} »`),
      )
    : h('div', { class: 'answer-bubble none' }, h('p', { class: 'bubble-text' }, 'Personne n’a répondu à cette miniature 😴'));

  const el = h('div', { class: 'review' },
    h('div', { class: 'play-head' },
      roundPill(`Vidéo ${g.v + 1} / ${g.total}`),
      h('span', { class: 'muted' }, `Réponse ${g.step + 1} / ${g.steps}`),
    ),
    h('div', { class: 'play-grid' },
      h('div', { class: 'stage' },
        thumb(g.video.id, { cls: 'thumb-xl' }),
        !isFun(s) && h('div', { class: 'real-title' },
          h('span', { class: 'hidden-label' }, 'Vrai titre'),
          h('b', {}, g.video.title),
          g.video.author && h('small', {}, g.video.author),
        ),
      ),
      h('div', { class: 'vote-card card' },
        answerBlock,
        g.author && h('div', { class: 'vote-zone' },
          h('div', { class: 'label' }, isAuthor ? 'Les autres te notent…' : isFun(s) ? 'C’est drôle ?' : 'Ta note'),
          starEl,
          avgBadge,
          progress,
        ),
        store.isHost
          ? next
          : h('p', { class: 'hint center' }, `${store.player(s.hostId)?.name ?? 'Le chef'} fait défiler les réponses`),
      ),
    ),
  );

  function update(nextState) {
    const game = nextState.game;
    starEl.set(game.myVote);
    progress.textContent = game.author ? `${game.voted} / ${game.eligible} ont voté` : '';
    avgBadge.classList.toggle('show', !!game.allVoted);
    avgBadge.textContent = game.allVoted ? `⭐ ${game.avg.toFixed(1)} / 5` : '';
  }
  update(s);
  return { el, update };
}

function final(s) {
  const f = s.game.final;
  const best = f.best && store.player(f.best.pid);
  celebrate();
  const el = h('div', { class: 'final' },
    h('div', { class: 'kicker' }, isFun(s) ? 'Invente' : 'Classement final'),
    h('h1', { class: 'final-title' }, isFun(s) ? '🤣 Le roi de la blague' : '🏆 Résultats'),
    podium(f.ranking, { unit: 'pts' }),
    best && h('div', { class: 'card best-card' },
      h('div', { class: 'label' }, isFun(s) ? '😂 Titre le plus drôle' : '✨ Meilleure réponse'),
      h('div', { class: 'bubble-who' }, avatar(best, 40), h('b', {}, best.name), h('span', { class: 'muted' }, `· ${f.best.avg.toFixed(1)} / 5`)),
      h('p', { class: 'bubble-text' }, `« ${f.best.text} »`),
      !isFun(s) && h('small', { class: 'muted' }, `pour : ${f.best.title}`),
    ),
    h('section', { class: 'recap' },
      h('h2', {}, 'Toutes les réponses'),
      f.recap.map((r) =>
        h('details', { class: 'card recap-item' },
          h('summary', {}, thumb(r.video.id), h('b', {}, r.video.title || 'Toutes les réponses')),
          h('ul', {},
            r.answers.length
              ? r.answers.map((a) => {
                  const p = store.player(a.pid);
                  return h('li', {}, avatar(p, 28), h('span', { class: 'recap-name' }, p?.name), h('span', { class: 'recap-text' }, a.text), h('b', {}, a.avg == null ? '–' : `${a.avg.toFixed(1)} ★`));
                })
              : h('li', { class: 'muted' }, 'Aucune réponse'),
          ),
        ),
      ),
    ),
    endActions(),
  );
  return { el, update() {} };
}
