import { avatar, h, thumb } from '../dom.js';
import { act } from '../net.js';
import { drawPad } from '../components/draw.js';
import { timerBar } from '../components/timer.js';
import { playerStrip } from '../components/widgets.js';
import { store } from '../store.js';
import { endActions, introScreen, roundPill } from './shared.js';

export function createChain(s) {
  switch (s.game.phase) {
    case 'intro': return intro(s);
    case 'play':
    case 'collect': return play(s);
    case 'reveal': return reveal(s);
    default: return final(s);
  }
}

function intro(s) {
  const g = s.game;
  const writing = g.kind === 'title';
  return introScreen({
    emoji: writing ? '✍️' : '🎨',
    kicker: `Étape ${g.round + 1} / ${g.rounds}`,
    title: writing ? 'Écris le titre' : 'Dessine la miniature',
    text: writing
      ? 'Tu vas voir une miniature (ou un dessin). Devine le titre de la vidéo.'
      : 'Tu vas lire un titre. Dessine la miniature de la vidéo comme tu l’imagines.',
    endsAt: g.endsAt,
    accent: writing ? 'var(--yellow)' : 'var(--cyan)',
  });
}

function drawingFrame(src) {
  return h('div', { class: 'thumb drawing' },
    src ? h('img', { src, alt: 'dessin', draggable: false }) : h('div', { class: 'no-drawing' }, '🫥 Pas de dessin'),
  );
}

function play(s) {
  const g = s.game;
  const writing = g.kind === 'title';
  const timer = timerBar(g.endsAt, g.totalSec * 1000);
  const strip = h('div', {});
  const status = h('p', { class: 'answer-status' });
  let sent = false;

  let input = null;
  let pad = null;
  let work;
  if (writing) {
    input = h('input', {
      class: 'input input-xl',
      placeholder: 'Le titre de cette vidéo, c’est…',
      maxLength: 150,
      autocomplete: 'off',
      onKeydown: (e) => e.key === 'Enter' && submit(),
    });
    work = input;
  } else {
    pad = drawPad();
    work = pad.el;
  }
  const button = h('button', { class: 'btn btn-primary btn-lg', onClick: () => submit() }, writing ? 'Valider' : 'J’ai fini !');

  let done = false;
  let collecting = false;
  function submit() {
    if (collecting) return;
    if (done) return act('unsubmit');
    if (writing) {
      if (!input.value.trim()) {
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 500);
        return;
      }
      act('submit', { text: input.value });
    } else {
      act('submit', pad.isBlank() ? {} : { img: pad.toDataURL() });
    }
  }

  const prompt = g.prompt;
  const promptView = writing
    ? prompt.type === 'thumb' ? thumb(prompt.videoId, { cls: 'thumb-xl' }) : drawingFrame(prompt.img)
    : h('blockquote', { class: 'prompt-quote' }, h('span', {}, 'Dessine la miniature de'), h('p', {}, `« ${prompt.text} »`));

  const el = h('div', { class: `play chain-play ${writing ? 'is-write' : 'is-draw'}` },
    h('div', { class: 'play-head' },
      roundPill(`Étape ${g.round + 1} / ${g.rounds}`),
      h('span', { class: 'muted' }, writing ? 'Écris le titre' : 'Dessine la miniature'),
      timer.el,
    ),
    h('div', { class: writing ? 'play-grid' : 'draw-layout' },
      h('div', { class: 'stage' }, promptView),
      h('div', { class: writing ? 'answer-card card' : 'draw-card' },
        work,
        h('div', { class: 'row-wrap between' }, status, button),
        h('div', { class: 'label' }, 'Ils ont fini'),
        strip,
      ),
    ),
  );

  function update(next) {
    const game = next.game;
    done = game.done;
    collecting = game.collecting;
    if (input) input.disabled = done || collecting;
    pad?.lock(done || collecting);
    button.textContent = done ? '✎ Modifier' : writing ? 'Valider' : 'J’ai fini !';
    button.classList.toggle('btn-primary', !done);
    button.classList.toggle('btn-ghost', done);
    button.disabled = collecting;
    status.textContent = collecting ? '⏱ Temps écoulé !' : done ? '✓ Envoyé, on attend les autres…' : '';
    status.classList.toggle('ok', done && !collecting);
    strip.replaceChildren(playerStrip(game.participants, game.doneIds));
    if (collecting && !done && !sent) {
      sent = true;
      if (writing) act('submit', { text: input.value });
      else act('submit', pad.isBlank() ? {} : { img: pad.toDataURL() });
    }
  }
  update(s);
  if (input) setTimeout(() => input.focus(), 60);

  return { el, update, destroy: timer.destroy };
}

// ---------- reveal ----------

const STEP_LABEL = { title: 'a écrit', draw: 'a dessiné' };

function stepCard(step, owner, fresh) {
  const who = store.player(step.pid);
  const head = step.type === 'thumb'
    ? h('div', { class: 'step-head' }, avatar(who, 36), h('span', {}, 'Vidéo originale de ', h('b', {}, who?.name)))
    : h('div', { class: 'step-head' }, avatar(who, 36), h('span', {}, h('b', {}, who?.name), ` ${STEP_LABEL[step.type]}`));
  let body;
  if (step.type === 'thumb') {
    body = [
      thumb(step.video.id),
      h('div', { class: 'real-title' },
        h('span', { class: 'hidden-label' }, 'Vrai titre'),
        h('b', {}, step.video.title || 'Titre inconnu'),
        step.video.author && h('small', {}, step.video.author)),
    ];
  } else if (step.type === 'title') {
    body = h('p', { class: 'bubble-text' }, `« ${step.text} »`);
  } else {
    body = drawingFrame(step.img);
  }
  return h('article', { class: `step-card ${step.type} ${fresh ? 'pop' : ''}` }, head, body);
}

function reveal(s) {
  const timeline = h('div', { class: 'timeline' });
  const head = h('div', { class: 'play-head' });
  const actions = h('div', { class: 'reveal-actions' });

  function update(next) {
    const g = next.game;
    const { ci, si } = g.pointer;
    const chain = g.chains[ci];
    const owner = store.player(chain.owner);
    const lastStep = si === chain.steps.length - 1;
    const lastChain = ci === g.chains.length - 1;

    head.replaceChildren(
      roundPill(`Chaîne ${ci + 1} / ${g.chains.length}`),
      h('span', { class: 'muted' }, `La vidéo de ${owner?.name ?? '?'}`),
    );
    timeline.replaceChildren(...chain.steps.slice(0, si + 1).map((step, i) => stepCard(step, owner, i === si)));
    actions.replaceChildren(
      store.isHost
        ? h('button', { class: 'btn btn-primary btn-lg', onClick: () => act('next') },
            !lastStep ? 'Révéler la suite ›' : lastChain ? 'Terminer 🎉' : 'Chaîne suivante ›')
        : h('p', { class: 'hint center' }, `${store.player(next.hostId)?.name ?? 'Le chef'} dévoile les étapes`),
    );
    const newest = timeline.lastElementChild;
    if (newest && si > 0) setTimeout(() => newest.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }
  update(s);

  return { el: h('div', { class: 'reveal chain-reveal' }, head, timeline, actions), update };
}

function final(s) {
  const el = h('div', { class: 'final' },
    h('div', { class: 'kicker' }, 'Téléphone arabe'),
    h('h1', { class: 'final-title' }, 'C’était beau 🎨'),
    h('p', { class: 'intro-text' }, 'Toutes les chaînes ont été dévoilées. On remet ça avec d’autres vidéos ?'),
    endActions(),
  );
  return { el, update() {} };
}
