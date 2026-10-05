import './ui/styles.css';
import { Game } from './game/Game';
import { Assets } from './assets/Assets';
import { STORY } from './data/missions';
import { applyStatic, onLangChange, t, tr } from './i18n/i18n';

const $ = (id: string) => document.getElementById(id)!;

function renderIntro() {
  $('intro').innerHTML = STORY.intro.map((l, i) => `<p style="animation-delay:${0.3 + i * 0.9}s">${tr(l)}</p>`).join('');
  document.title = tr(STORY.title) + ' 2026';
}
applyStatic();
renderIntro();
onLangChange(renderIntro);

let game: Game;
try {
  try {
    await Assets.load((p) => ($('loading').textContent = `${t('title.loading')} ${Math.round(p * 100)}%`));
  } catch (e) { console.warn('Model assets failed to load; using procedural fallbacks', e); }
  game = new Game($('scene') as HTMLCanvasElement);
  (window as unknown as { __game: Game }).__game = game;
  $('loading').classList.add('hidden');
  if (Game.hasSave()) $('btn-load').classList.remove('hidden');
} catch (e) {
  console.error(e);
  $('loading').textContent = t('title.loading') + ' ✗ WebGL';
}

const start = (load: boolean) => {
  $('fade').classList.add('on');
  setTimeout(() => {
    $('title').classList.add('hidden');
    game.begin(load);
    $('fade').classList.remove('on');
  }, 700);
};
$('btn-start').onclick = () => start(false);
$('btn-load').onclick = () => start(true);
