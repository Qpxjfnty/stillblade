import './enemy-arrows.css';
import { same, type GameState, type Pos, type Resolution } from './model';

const center = (p: Pos): Pos => ({ x: (p.x - .5) * 100, y: (p.y - .5) * 100 });
const point = (p: Pos) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
const attribute = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Published attacks and command-dependent movement remain separate forecasts. */
export function renderEnemyArrows(state: GameState, movement: Resolution | null, inspected: Pos): string {
  if (state.phase !== 'defense') return '';
  const watched = state.enemies.find(e => same(e, inspected));
  const arrows: string[] = [];
  const arrow = (id: string, from: Pos, to: Pos, kind: 'attack' | 'movement') => {
    const a = center(from), b = center(to), dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const direction = { x: dx / length, y: dy / length };
    const side = { x: -direction.y, y: direction.x };
    const offset = kind === 'movement' ? 10 : 0;
    const start = { x: a.x + direction.x * 28 + side.x * offset, y: a.y + direction.y * 28 + side.y * offset };
    const tip = { x: b.x - direction.x * 19 + side.x * offset, y: b.y - direction.y * 19 + side.y * offset };
    const base = { x: tip.x - direction.x * 14, y: tip.y - direction.y * 14 };
    const left = { x: base.x + side.x * 8, y: base.y + side.y * 8 };
    const right = { x: base.x - side.x * 8, y: base.y - side.y * 8 };
    const focused = watched ? watched.id === id ? ' focused' : ' subdued' : '';
    arrows.push(`<g class="enemy-arrow ${kind}${focused}" data-enemy="${attribute(id)}" data-from="${from.x},${from.y}" data-to="${to.x},${to.y}"><path class="arrow-backing" d="M${point(start)} L${point(base)}"/><path class="arrow-shaft" d="M${point(start)} L${point(base)}"/><path class="arrow-head" d="M${point(left)} L${point(tip)} L${point(right)}"/></g>`);
  };
  for (const enemy of state.enemies) {
    if (enemy.intent) {
      const targets = enemy.kind === 'gunner' || enemy.kind === 'charger'
        ? enemy.intent.cells.slice(-1) : enemy.intent.cells;
      for (const target of targets) arrow(enemy.id, enemy, target, 'attack');
    }
    const next = movement?.ok ? movement.state.enemies.find(e => e.id === enemy.id) : null;
    if (next && !same(enemy, next)) arrow(enemy.id, enemy, next, 'movement');
  }
  return `<svg class="enemy-arrows" viewBox="0 0 ${state.width * 100} ${state.height * 100}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${arrows.join('')}</svg>`;
}
