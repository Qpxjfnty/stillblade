import './style.css';
import { setupTooltips } from './tooltips';
import { renderEnemyArrows } from './enemy-arrows';
import { applyCommand, createGame, legalCommands, preview, commandLabel } from './engine';
import { SCENARIOS, RULES, same, type ActionKind, type Command, type Enemy, type GameState, type Pos, type Resolution, type ScenarioId } from './model';

const app = document.querySelector<HTMLDivElement>('#app')!;
const tooltips = setupTooltips(app);
const SAVE_KEY = 'stillblade.combat.v1';
const META: Record<ActionKind, { name: string; glyph: string; cost: string; hint: string }> = {
  slip: { name: 'Move', glyph: '↗', cost: '1 beat', hint: 'Choose a clear destination 1–2 cells away. Evading a committed attack chips its Guard and earns charge.' },
  parry: { name: 'Turn Aside', glyph: '⌁', cost: '1 beat', hint: 'Choose your stance, then the adjacent attacker to parry. You may stay or step one cell. Other attacks still resolve.' },
  vault: { name: 'Vault', glyph: '⤴', cost: '1 beat', hint: 'Choose a landing cell beyond an adjacent enemy. Vaulting can evade committed attacks.' },
  harrier: { name: 'Harrier Shot', glyph: '╳', cost: '1 beat', hint: 'Select an enemy on a clear straight ray within 4 cells. Deal 3 Guard; this earns no charge.' },
  light: { name: 'Light Attack', glyph: '╱', cost: '1 beat', hint: 'Strike an adjacent guarded enemy for 4 Guard. Breaching interrupts and stuns it; other attacks still resolve. This earns no charge.' },
  wait: { name: 'Wait', glyph: '·', cost: '1 beat', hint: 'Stay in place and let the published attacks resolve.' },
  activate: { name: 'Freeze time', glyph: '✦', cost: 'All charge', hint: 'Cash in all charge. Interrupt every enemy and deal 2 Guard to each. Normal time stops.' },
  lunge: { name: 'Lunge', glyph: '↣', cost: '3 budget', hint: 'Select an exposed enemy within 3 cells on a clear straight ray. Wound it, refund 1 budget, and enter its cell if it dies.' },
  shot: { name: 'Execution Shot', glyph: '⌖', cost: '3 budget', hint: 'Select an exposed enemy on a clear ray within 5 cells. Wound it without moving; refund 1 budget.' },
  sweep: { name: 'Sweep', glyph: '◜', cost: '5 budget', hint: 'Choose your stance, then select up to 3 adjacent exposed enemies. Each wound refunds 1 budget.' },
  break: { name: 'Break', glyph: '⋈', cost: '2 budget', hint: 'Select an adjacent guarded enemy. Deal 4 Guard. Reaching zero interrupts and stuns it.' },
  traverse: { name: 'Traverse', glyph: '↝', cost: '1 budget', hint: 'Choose a clear destination 1–2 cells away, or vault over an adjacent enemy.' },
  bell: { name: 'Bell', glyph: '♧', cost: '1 soul', hint: 'Choose a visible center within 4 cells. Deal 3 Guard to eligible enemies in its surrounding 3×3 area.' },
  thread: { name: 'Thread', glyph: '◇', cost: '1 soul', hint: 'Choose an empty visible cell within 4 cells. Teleport through bodies; walls block sight.' },
  lance: { name: 'Soul Lance', glyph: '⟡', cost: '2 souls', hint: 'Select an exposed enemy on a clear ray within 5 cells. Deal 1 HP and refund 1 budget.' },
  end: { name: 'End attack turn', glyph: '◷', cost: 'Discard budget', hint: 'Return to defensive time. Unspent fresh souls become stale pickups. Enemies show new tells before acting.' },
};
const KINDS: Record<Enemy['kind'], { glyph: string; name: string }> = {
  swordsman: { glyph: '†', name: 'Swordsman' }, charger: { glyph: '↟', name: 'Charger' }, gunner: { glyph: '⌖', name: 'Gunner' }, warden: { glyph: '♜', name: 'Warden' },
};
const DEFENSE: ActionKind[] = ['slip', 'parry', 'vault', 'light', 'harrier', 'bell', 'thread', 'wait'];
const ATTACK: ActionKind[] = ['lunge', 'shot', 'sweep', 'break', 'traverse', 'bell', 'thread', 'lance'];
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const posText = (p: Pos) => `${p.x},${p.y}`;
const isSpell = (a: ActionKind | null) => a === 'bell' || a === 'thread' || a === 'lance';
const terminal = () => state.phase === 'victory' || state.phase === 'defeat';
let state = restore() ?? createGame('arena');
let selected: ActionKind | null = null;
let anchor: Pos | null = null;
let selectedTargets: string[] = [];
let pending: Command | null = null;
let inspected: Pos = { x: state.player.x, y: state.player.y };
let cursor: Pos = { ...inspected };
let notice = '';
let paymentFresh: string[] = [];
let paymentReserve = 0;
let modal: 'help' | 'scenarios' | 'restart' | 'result' | null = terminal() ? 'result' : null;
let returnFocus: string | null = null;
let blood: { at: Pos; text: string; kind: string }[] = [];
let bloodTimer: ReturnType<typeof setTimeout> | undefined;
let commands: Command[] = [];
let forecast: Resolution | null = null;

function restore(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw || raw.length > 100_000) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const s = value as GameState;
    const integer = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
    const point = (p: unknown): p is Pos => !!p && typeof p === 'object' && Number.isInteger((p as Pos).x) && Number.isInteger((p as Pos).y) && (p as Pos).x >= 1 && (p as Pos).x <= 9 && (p as Pos).y >= 1 && (p as Pos).y <= 7;
    if (s.version !== 1 || !SCENARIOS.some(c => c.id === s.scenario) || s.width !== 9 || s.height !== 7 || !['defense','attack','victory','defeat'].includes(s.phase)) return null;
    if (!point(s.player) || s.player.maxHp !== 4 || !Number.isInteger(s.player.hp) || s.player.hp < 0 || s.player.hp > 4) return null;
    if (!Array.isArray(s.enemies) || s.enemies.length > 6 || !Array.isArray(s.walls) || s.walls.length > 63 || !s.walls.every(point) || !Array.isArray(s.fresh) || !Array.isArray(s.stale) || !Array.isArray(s.log) || s.log.length > 100 || !s.log.every(x => typeof x === 'string' && x.length <= 2000)) return null;
    if (!s.enemies.every(e => {
      if (!point(e) || typeof e.id !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(e.id) || !Object.hasOwn(KINDS,e.kind)) return false;
      const maxHp = e.kind === 'warden' ? 2 : 1, maxGuard = e.kind === 'warden' ? 15 : 10;
      if (e.maxHp !== maxHp || e.maxGuard !== maxGuard || !integer(e.hp,1,maxHp) || !integer(e.guard,0,maxGuard) || !integer(e.exposure,0,2) || typeof e.protected !== 'boolean') return false;
      if ((e.guard === 0) !== (e.exposure > 0) || (e.protected && (s.phase !== 'attack' || e.guard !== maxGuard || e.intent !== null))) return false;
      if (e.intent === null) return true;
      return s.phase !== 'attack' && !e.exposure && Array.isArray(e.intent.cells) && e.intent.cells.length > 0 && e.intent.cells.length <= 5 && e.intent.cells.every(point)
        && e.intent.damage === (e.kind === 'warden' ? 2 : 1) && e.intent.parryable === (e.kind === 'swordsman' || e.kind === 'charger')
        && integer(e.intent.direction?.x,-1,1) && integer(e.intent.direction?.y,-1,1) && (e.intent.direction.x !== 0 || e.intent.direction.y !== 0);
    })) return null;
    const positions = [s.player,...s.enemies,...s.walls].map(posText);
    if (new Set(positions).size !== positions.length || new Set(s.enemies.map(e=>e.id)).size !== s.enemies.length) return null;
    const souls = [...s.fresh,...s.stale];
    if (souls.length > 6 || !souls.every(soul => point(soul) && typeof soul.id === 'string' && /^s[1-9]\d*$/.test(soul.id)) || new Set(souls.map(soul=>soul.id)).size !== souls.length) return null;
    if (![s.beat, s.actions, s.charge, s.budget, s.reserve, s.nextSoulId, s.kills, s.wounds].every(n => integer(n,0,Number.MAX_SAFE_INTEGER)) || s.charge > 12 || s.reserve > 9 || s.budget > 30 || !integer(s.nextSoulId,1,7) || s.kills > 6 || s.wounds > 7) return null;
    if (s.phase === 'attack' ? s.charge !== 0 : s.budget !== 0 || s.fresh.length > 0) return null;
    if ((s.phase === 'defeat') !== (s.player.hp === 0) || (s.phase === 'victory') !== (s.enemies.length === 0)) return null;
    return s;
  } catch { return null; }
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* Play remains available without storage. */ } }
function enemyAt(p: Pos, source = state) { return source.enemies.find(e => same(e, p)); }
function order(source = state) {
  const rank = { gunner: 0, charger: 1, swordsman: 2, warden: 3 };
  return [...source.enemies].sort((a,b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
function enemyLabel(e: Enemy) { return `${e.id} · ${KINDS[e.kind].name}`; }
function hearts(hp: number, max: number, cls = '') { return `<span class="hearts ${cls}" aria-label="${hp} of ${max} HP">${Array.from({length:max}, (_,i) => `<span class="${i < hp ? 'full' : 'empty'}" aria-hidden="true">♥</span>`).join('')}</span>`; }
function resetSelection() { selected = null; anchor = null; selectedTargets = []; pending = null; forecast = null; paymentFresh = []; paymentReserve = 0; }
function openModal(value: typeof modal) { returnFocus = (document.activeElement as HTMLElement)?.id || null; modal = value; render(); }
function closeModal() { modal = null; render(); if (returnFocus) document.getElementById(returnFocus)?.focus(); }
function loadScenario(id: ScenarioId) {
  state = createGame(id); resetSelection(); modal = null; inspected = { ...state.player }; cursor = { ...state.player }; notice = SCENARIOS.find(s => s.id === id)!.description; blood = []; save(); render();
}
function spellUnits() { return selected === 'lance' ? 2 : 1; }
function defaultPayment() {
  const cost = spellUnits();
  paymentFresh = state.phase === 'attack' ? state.fresh.slice(0, cost).map(s => s.id) : [];
  paymentReserve = (cost - paymentFresh.length) * 3;
}
function attachPayment(command: Command): Command {
  return isSpell(command.kind) ? { ...command, payment: { fresh: [...paymentFresh], reserve: paymentReserve } } : command;
}
function pickAction(kind: ActionKind) {
  resetSelection(); selected = kind; notice = '';
  if (isSpell(kind)) defaultPayment();
  if (kind === 'wait' || kind === 'activate' || kind === 'end') pending = { kind };
  render();
  if (pending) { document.querySelector<HTMLButtonElement>('#confirm')?.focus({preventScroll:true}); scrollToForecast(); }
  else { focusCursor(); if (matchMedia('(max-width:760px)').matches) document.getElementById('arena')?.scrollIntoView({block:'center'}); }
}
function validForAction() { return commands.filter(c => c.kind === selected); }
function chooseCell(p: Pos) {
  inspected = p; cursor = p; notice = '';
  if (!selected) { render(); focusCursor(); return; }
  const candidates = validForAction();
  if (selected === 'parry' || selected === 'sweep') {
    const enemy = enemyAt(p);
    if (anchor && enemy) {
      if (selected === 'parry') {
        const c = candidates.find(c => c.target === enemy.id && same(c.to ?? state.player, anchor!));
        if (c) pending = attachPayment(c); else notice = 'That enemy cannot be parried from this stance. Choose a highlighted attacker.';
      } else {
        const legal = candidates.some(c => same(c.to ?? state.player, anchor!) && c.targets?.includes(enemy.id));
        if (legal) {
          if (selectedTargets.includes(enemy.id)) selectedTargets = selectedTargets.filter(id => id !== enemy.id);
          else if (selectedTargets.length < 3) selectedTargets.push(enemy.id);
          else notice = 'A Sweep hits at most three enemies. Deselect one to change targets.';
          pending = selectedTargets.length ? { kind: 'sweep', to: { ...anchor }, targets: [...selectedTargets] } : null;
        } else notice = 'Choose an exposed enemy adjacent to your selected stance.';
      }
    } else if (candidates.some(c => same(c.to ?? state.player, p))) {
      anchor = p; selectedTargets = []; pending = null;
    } else notice = anchor ? 'Choose a highlighted target, or a highlighted stance to reposition.' : 'Choose a highlighted stance. You may also stay in your current cell.';
  } else {
    const c = candidates.find(c => c.to ? same(c.to,p) : c.target === enemyAt(p)?.id);
    if (c) pending = attachPayment(c);
    else if (!['activate','end','wait'].includes(selected)) notice = 'No legal target here for this action. Highlighted cells are available.';
  }
  render();
  if (pending && selected!=='sweep') { document.querySelector<HTMLButtonElement>('#confirm')?.focus({preventScroll:true}); scrollToForecast(); }
  else focusCursor();
}
function scrollToForecast() { if (matchMedia('(max-width:760px)').matches) document.querySelector('.forecast')?.scrollIntoView({block:'start'}); }
function commit() {
  if (!pending || modal) return;
  const result = applyCommand(state, pending);
  if (!result.ok) { notice = result.error ?? 'That action is not available.'; render(); return; }
  const action = META[pending.kind].name;
  state = result.state;
  blood = result.events.filter(e => e.at && (e.kind === 'kill' || (e.kind === 'wound' && !result.events.some(k=>k.kind==='kill'&&k.at&&same(k.at,e.at!))))).map(e => ({ at: e.at!, text: e.kind === 'kill' ? '╱✺╲' : '╳', kind: e.kind }));
  if (bloodTimer) clearTimeout(bloodTimer);
  bloodTimer = setTimeout(() => { blood = []; document.querySelectorAll('.blood-burst').forEach(e => e.remove()); }, 1100);
  resetSelection(); inspected = { ...state.player }; cursor = { ...state.player };
  notice = `${action}. ${result.events.filter(e => e.kind === 'hurt' || e.kind === 'kill' || e.kind === 'breach').map(e => e.text).join(' ')}`;
  if (terminal()) modal = 'result';
  save(); render();
}
function cellLegal(p: Pos) {
  if (!selected) return false;
  const cs = validForAction();
  if (selected === 'parry' || selected === 'sweep') {
    const e = enemyAt(p);
    return cs.some(c => same(c.to ?? state.player, p)) || !!(anchor && e && cs.some(c => same(c.to ?? state.player, anchor!) && (c.target === e.id || c.targets?.includes(e.id))));
  }
  return cs.some(c => c.to ? same(c.to,p) : !!c.target && c.target === enemyAt(p)?.id);
}
function cellLabel(p: Pos) {
  const enemy = enemyAt(p);
  const threats = order().filter(e => e.intent?.cells.some(c => same(c,p)));
  const base = same(state.player,p) ? `You, ${state.player.hp} HP` : enemy ? `${enemyLabel(enemy)}, ${enemy.hp} HP, ${enemy.guard} Guard${enemy.exposure ? `, exposed ${enemy.exposure} decisions` : ''}${enemy.protected ? ', protected this attack turn' : ''}${state.phase==='defense'&&!enemy.intent&&!enemy.exposure&&!enemy.protected ? ', no attack this turn' : ''}` : state.walls.some(w=>same(w,p)) ? 'Pillar' : 'Empty';
  return `Cell ${posText(p)}. ${base}.${threats.length ? ` Threatened by ${threats.map(e=>e.id).join(', ')}.` : ''}${cellLegal(p) ? ' Legal choice.' : ''}`;
}
function renderBoard(movement: Resolution | null) {
  const ranked = order();
  const watched = enemyAt(inspected);
  const future = forecast?.ok ? forecast.state.player : null;
  const rayTarget = pending?.target && ['harrier','shot','lance'].includes(pending.kind) ? state.enemies.find(e=>e.id===pending!.target) : null;
  const routeEnd = rayTarget ?? (pending?.kind !== 'thread' ? future : null);
  const route: Pos[] = [];
  if (routeEnd && !same(routeEnd,state.player)) { const dx=routeEnd.x-state.player.x,dy=routeEnd.y-state.player.y; if(dx===0||dy===0||Math.abs(dx)===Math.abs(dy)) for(let n=1;n<=Math.max(Math.abs(dx),Math.abs(dy));n++) route.push({x:state.player.x+Math.sign(dx)*n,y:state.player.y+Math.sign(dy)*n}); }
  let cells = '';
  for (let y = 1; y <= state.height; y++) for (let x = 1; x <= state.width; x++) {
    const p = { x,y }, e = enemyAt(p), player = same(state.player,p), wall = state.walls.some(w=>same(w,p));
    const threats = ranked.filter(e=>e.intent?.cells.some(c=>same(c,p)));
    const legal = cellLegal(p), chosen = (pending?.target === e?.id && !!e) || selectedTargets.includes(e?.id ?? '') || !!(pending?.to && same(pending.to,p));
    const atCursor = same(cursor,p);
    const inBell = pending?.kind==='bell' && pending.to && Math.max(Math.abs(p.x-pending.to.x),Math.abs(p.y-pending.to.y))<=1;
    const bellHit = inBell && forecast?.events.some(event=>event.kind==='guard'&&event.at&&same(event.at,p)&&event.text.includes('(Bell)'));
    const path = route.some(point=>same(point,p));
    const classes = ['cell', path ? 'preview-path' : '', inBell ? 'spell-area' : '', bellHit ? 'spell-hit' : '', player ? 'player' : '', e ? `enemy ${e.kind}` : '', e?.exposure ? 'exposed' : '', e?.protected ? 'protected' : '', wall ? 'wall' : '', threats.length ? 'threatened' : '', legal ? 'legal' : '', chosen ? 'chosen' : '', same(inspected,p) ? 'inspected' : '', anchor && same(anchor,p) ? 'stance' : '', future && same(future,p) && !player ? 'endpoint' : '', watched?.intent?.cells.some(c=>same(c,p)) ? 'watched' : ''].filter(Boolean).join(' ');
    const souls = state.stale.filter(s=>same(s,p)).length;
    const burst = blood.find(b=>same(b.at,p));
    cells += `<button type="button" class="${classes}" role="gridcell" tabindex="${atCursor ? 0 : -1}" data-cell="${x},${y}" aria-label="${esc(cellLabel(p))}" aria-selected="${same(inspected,p)}">${e ? `<span class="cell-id">${esc(e.id)}</span>${e.intent ? `<span class="tell-order" title="Resolution order ${ranked.indexOf(e)+1}">${ranked.indexOf(e)+1}</span>` : state.phase==='defense'&&!e.exposure&&!e.protected ? '<span class="tell-order idle-marker" title="No attack this turn. This enemy may move or prepare its next tell after your action.">–</span>' : ''}<span class="actor-glyph" aria-hidden="true">${e.protected ? '◇' : e.exposure ? '⋇' : KINDS[e.kind].glyph}</span><span class="cell-stats"><b>${e.exposure ? `!${e.exposure}` : e.guard}</b><span class="tiny-hearts">${'♥'.repeat(e.hp)}</span></span><span class="guard-track" aria-hidden="true"><i style="width:${e.guard/e.maxGuard*100}%"></i></span>` : player ? '<span class="actor-glyph" aria-hidden="true">@</span><span class="you-label">YOU</span>' : wall ? '<span class="pillar" aria-hidden="true">▥</span>' : '<span class="floor-dot" aria-hidden="true">·</span>'}${path&&!e&&!player?'<span class="path-mark" aria-hidden="true">•</span>':''}${inBell&&e&&!bellHit?'<span class="excluded-mark" title="Not affected by Bell" aria-label="Not affected by Bell">×</span>':''}${souls ? `<span class="stale-glyph" title="${souls} stale souls">♧${souls > 1 ? souls : ''}</span>` : ''}${threats.length && !e ? `<span class="threat-mark" aria-hidden="true">${threats.length > 1 ? threats.length : '×'}</span>` : ''}${future && same(future,p) && !player ? '<span class="endpoint-mark" aria-hidden="true">◎</span>' : ''}${burst ? `<span class="blood-burst ${burst.kind}" aria-hidden="true">${burst.text}<small>·╱;╲·</small></span>` : ''}</button>`;
  }
  return `<div class="board-frame"><div class="board-coordinates" aria-hidden="true">${Array.from({length:state.width},(_,i)=>`<span>${i+1}</span>`).join('')}</div><div id="arena" class="arena" role="grid" aria-label="Combat arena, 9 columns and 7 rows" style="--columns:${state.width}">${cells}${renderEnemyArrows(state, movement, inspected)}</div></div>`;
}
function describeTell(e: Enemy) {
  if (e.protected) return 'Wounded this attack turn. Untargetable until defensive time resumes.';
  if (e.exposure) return `Breached & stunned · ${e.exposure} defensive decision${e.exposure===1?'':'s'} remain. One HP hit consumes this opening.`;
  if (!e.intent) return state.phase === 'attack' ? 'Time is frozen. This enemy cannot act.' : 'No committed attack. It may move or publish a tell after your next defensive action.';
  return `${e.intent.damage} HP · ${e.intent.parryable ? 'parryable when adjacent' : 'cannot be parried'} · hits ${e.intent.cells.map(posText).join(' / ')}.`;
}
function renderInspector(movement: Resolution | null) {
  const e = enemyAt(inspected);
  const threatened = order().filter(e=>e.intent?.cells.some(p=>same(p,inspected)));
  if (e) {
    const next = movement?.ok ? movement.state.enemies.find(n => n.id === e.id) : null;
    const moveHint = next && !same(e, next) ? ` Dashed arrow: moves to ${posText(next)} ${pending ? 'with this action' : 'if you Wait'}.` : '';
    return `<div class="inspect-heading"><span class="inspect-symbol">${KINDS[e.kind].glyph}</span><div><h3>${esc(enemyLabel(e))}</h3><span class="muted">Cell ${posText(e)}${e.intent ? ` · resolves #${order().indexOf(e)+1}` : ''}</span></div>${hearts(e.hp,e.maxHp,'enemy-hearts')}</div><div class="inspect-guard"><span>${e.exposure ? 'GUARD BREACHED' : e.protected ? 'WOUNDED · PROTECTED' : 'GUARD'}</span><strong>${e.guard}<small> / ${e.maxGuard}</small></strong></div><p>${describeTell(e)}${moveHint}</p>`;
  }
  const player = same(state.player,inspected);
  const stale = state.stale.filter(s=>same(s,inspected)).length;
  return `<div class="inspect-heading"><span class="inspect-symbol">${player ? '@' : stale ? '♧' : state.walls.some(w=>same(w,inspected)) ? '▥' : '·'}</span><div><h3>${player ? 'The Stillblade' : stale ? 'Stale soul' : state.walls.some(w=>same(w,inspected)) ? 'Broken column' : 'Open ground'}</h3><span class="muted">Cell ${posText(inspected)}</span></div>${player ? hearts(state.player.hp,4,'enemy-hearts') : ''}</div><p>${threatened.length ? `${player ? 'Your cell is' : 'This cell is'} threatened by ${threatened.map(e=>`${esc(e.id)} (${e.intent!.damage} HP)`).join(', ')}. The forecast accounts for blocking bodies and interruptions.` : state.walls.some(w=>same(w,inspected)) ? 'Blocks movement and line of sight.' : 'No published attack covers this cell.'}${stale ? ` Collect ${stale} reserve unit${stale===1?'':'s'} by crossing or entering this cell.` : ''}</p>`;
}
function renderPayment() {
  if (!isSpell(selected)) return '';
  const units = spellUnits();
  return `<fieldset class="payment"><legend>Soul payment <span>${units} equivalent${units>1?'s':''} required</span></legend><div class="soul-options">${state.phase==='attack' && state.fresh.length ? state.fresh.map(s=>`<label class="soul-token"><input type="checkbox" data-soul="${esc(s.id)}" ${paymentFresh.includes(s.id)?'checked':''}><span>♧ ${esc(s.id)} <small>at ${posText(s)}</small></span></label>`).join('') : '<span class="muted">No fresh souls</span>'}<label class="reserve-payment">Reserve <select id="reserve-payment" aria-label="Reserve units to spend">${Array.from({length:units+1},(_,i)=>i*3).filter(n=>n<=state.reserve).map(n=>`<option value="${n}" ${paymentReserve===n?'selected':''}>${n}</option>`).join('')}</select><span> / ${state.reserve}</span></label></div><small>1 fresh = 3 reserve. Unused fresh souls stale at their kill cells.</small>${paymentFresh.length+paymentReserve/3!==units ? `<p class="payment-error">Select exactly ${units} soul equivalent${units>1?'s':''}.</p>` : ''}</fieldset>`;
}
function diffRows(next: GameState) {
  const rows: string[] = [];
  if (!same(next.player,state.player)) rows.push(`Move to ${posText(next.player)}`);
  if (state.charge!==next.charge) rows.push(`Charge ${state.charge} → ${next.charge}`);
  if (state.budget!==next.budget) rows.push(`Budget ${state.budget} → ${next.budget}`);
  if (state.fresh.length!==next.fresh.length || state.reserve!==next.reserve) rows.push(`Fresh souls ${state.fresh.length} → ${next.fresh.length} · reserve ${state.reserve} → ${next.reserve}`);
  for (const e of state.enemies) {
    const after=next.enemies.find(n=>n.id===e.id);
    if(!after) { rows.push(`${e.id}: killed · 1 fresh soul`); continue; }
    const changes:string[]=[];
    if(e.hp!==after.hp) changes.push(`HP ${e.hp} → ${after.hp}`);
    if(e.guard!==after.guard) changes.push(`Guard ${e.guard} → ${after.guard}`);
    if(!e.exposure&&after.exposure) changes.push(`breached (${after.exposure})`);
    else if(e.exposure!==after.exposure) changes.push(after.exposure?`exposure ${after.exposure}`:'opening closes');
    if(!e.protected&&after.protected) changes.push('protected this turn');
    if(!same(e,after)) changes.push(`moves to ${posText(after)}`);
    if(changes.length) rows.push(`${e.id}: ${changes.join(' · ')}`);
  }
  return rows;
}
function renderForecast() {
  if (!pending) return `<div class="forecast-empty"><span class="forecast-emblem">${selected ? META[selected].glyph : '⌁'}</span><div><strong>${selected ? (anchor && (selected==='parry'||selected==='sweep') ? 'Choose your target' : 'Choose a highlighted cell') : state.phase==='attack' ? 'Build your killing sequence' : 'Read the tells. Choose your defense.'}</strong><p>${selected ? META[selected].hint : state.phase==='attack' ? 'Enemies and Guard recovery are frozen. Every wound refunds 1 budget; every kill gives a fresh soul.' : 'Select an action, choose its target, then review the exact outcome. Nothing happens until you confirm.'}</p></div></div>`;
  if (!forecast?.ok) return `<div class="forecast-error"><strong>Cannot commit this action</strong><p>${esc(forecast?.error ?? 'Choose a legal target.')}</p></div>`;
  const next = forecast.state, lost = state.player.hp-next.player.hp;
  const nextTells = order(next).filter(e=>e.intent);
  return `<div class="forecast-heading"><div><span class="eyebrow">EXACT FORECAST</span><h3>${esc(commandLabel(pending))}</h3></div><span class="damage-badge ${lost ? 'danger' : ''}">${lost ? `−${lost} HP` : 'No HP lost'}</span></div>${next.phase==='defeat'?'<p class="fatal-warning">This action is fatal.</p>':''}<ul class="forecast-changes">${diffRows(next).map(row=>`<li>${esc(row)}</li>`).join('') || '<li>Resources remain unchanged.</li>'}</ul><details class="resolution-details"><summary>Resolution & next tells</summary><ol>${forecast.events.map(e=>`<li>${esc(e.text)}</li>`).join('')}</ol><p><b>Next tells:</b> ${next.phase==='attack' ? 'None. Time is frozen.' : nextTells.length ? nextTells.map(e=>`${esc(e.id)} → ${e.intent!.cells.map(posText).join(' / ')} (${e.intent!.damage} HP)`).join('; ') : 'None.'}</p></details>`;
}
function renderActions() {
  if (terminal()) return '';
  const kinds=state.phase==='attack'?ATTACK:DEFENSE;
  return `<div class="action-heading"><h2>${state.phase==='attack'?'Spend the moment':'Choose an action'}</h2><span class="muted">${selected ? 'Esc to cancel' : '1–'+kinds.length+' · select'}</span></div><div class="actions">${kinds.map((kind,i)=>{ const m=META[kind], legal=commands.some(c=>c.kind===kind); return `<button id="action-${kind}" class="action ${selected===kind?'active':''}" data-action="${kind}" ${legal?'':'disabled'} title="${esc(m.hint)}"><span class="action-glyph" aria-hidden="true">${m.glyph}</span><span><b>${m.name}</b><small>${m.cost}</small></span><kbd>${i+1}</kbd></button>`; }).join('')}</div>${selected?`<div class="target-instruction"><b>${META[selected].name}</b> · ${META[selected].hint}${selected==='parry'||selected==='sweep'?`<div class="stance-controls"><button id="stay-here" class="quiet" ${validForAction().some(c=>same(c.to??state.player,state.player))?'':'disabled'}>Stand here</button>${anchor?`<span>Stance: ${posText(anchor)}${selected==='sweep'?` · ${selectedTargets.length}/3 targets`:''}</span><button id="reset-stance" class="text-button">Change stance</button>`:''}</div>`:''}</div>`:''}${renderPayment()}`;
}
function renderModal() {
  if (!modal) return '';
  let content='';
  if(modal==='help') content=`<span class="eyebrow">FIELD GUIDE</span><h2>Defend. Breach. Unleash.</h2><p>You are powerful, but only four wounds from death. Read every enemy’s next attack before choosing a defense.</p><div class="guide-steps"><section><span>01</span><h3>Prepare the crowd</h3><p>Move or Vault out of red attack cells to earn <b>1 charge</b> and deal <b>2 Guard</b> to each evaded attacker. Turn Aside parries one adjacent melee attack for <b>2 charge and 4 Guard</b>. Light Attack deals <b>4 Guard</b> to an adjacent enemy; Harrier Shot deals <b>3 Guard</b> at range. Neither earns charge.</p></section><section><span>02</span><h3>Take your moment</h3><p>At <b>4+ charge</b>, Freeze time interrupts every enemy and deals <b>2 Guard</b> to each. All charge becomes attack budget. You can save more, up to 12, or activate early to escape danger.</p></section><section><span>03</span><h3>Cut through the openings</h3><p>At <b>0 Guard</b>, an enemy is breached and stunned. Hit its exposed HP with Lunge, Shot or Sweep. Each wound refunds <b>1 budget</b>. A surviving enemy restores Guard and is protected for the rest of that attack turn.</p></section><section><span>04</span><h3>Spend the dead</h3><p>Kills create fresh souls, spendable immediately from anywhere. Bell breaks Guard; Thread teleports; Soul Lance wounds. Unused souls become stale pickups when you end the turn. <b>3 reserve = 1 fresh soul.</b></p></section></div><details open><summary>Reading the arena</summary><p><b>@</b> is you. <b>†</b> swordsman · <b>↟</b> charger · <b>⌖</b> gunner · <b>♜</b> warden. Enemy cells show their ID, exact Guard and HP hearts. A corner number is attack resolution order; <b>–</b> means no attack this turn. Solid red arrows show committed attacks. Dashed arrows show movement if you Wait, or the exact movement for your selected action. <b>⋇ !2</b> means breached for two defensive decisions. <b>◇</b> marks a protected survivor.</p><p>Red hatching marks published attacks. Tap any cell to inspect freely. Guard recovers by 1 on beats without Guard damage. Frozen time pauses Guard recovery and breach timers. Blood and body fragments are cosmetic.</p></details><details><summary>Touch, mouse & keyboard</summary><p>Choose an action → choose highlighted targets → read the forecast → Confirm. Parry and Sweep first choose a stance, then targets. All controls work with one tap or click; no timing or hovering is required.</p><p><b>1–8</b> selects actions · <b>F</b> previews Freeze time · <b>E</b> previews End attack turn · <b>Enter</b> confirms a pending action · <b>Esc</b> cancels · <b>?</b> opens this guide. Arrow keys move the arena cursor; Space selects its cell. Tab reaches all controls.</p></details><p class="muted">Combat prototype v0.1. Six handcrafted studies, no run progression yet. Balance is experimental. Your encounter saves automatically on this device when storage is available.</p><button id="modal-close" class="primary">Return to the arena</button>`;
  else if(modal==='scenarios') content=`<span class="eyebrow">THE COMBAT LABORATORY</span><h2>Choose an encounter</h2><p>Each study starts fresh. Your current encounter will be replaced.</p><div class="scenario-list">${SCENARIOS.map((s,i)=>`<button class="scenario-choice ${s.id===state.scenario?'current':''}" data-scenario="${s.id}"><span>0${i+1}</span><div><b>${s.name}</b><small>${s.description}</small></div><span aria-hidden="true">↗</span></button>`).join('')}</div><button id="modal-close" class="quiet">Keep playing</button>`;
  else if(modal==='restart') content=`<span class="eyebrow">BEGIN AGAIN</span><h2>Restart this encounter?</h2><p>Your current position, charge and souls will be reset.</p><div class="modal-buttons"><button id="restart-confirm" class="primary">Restart encounter</button><button id="modal-close" class="quiet">Keep playing</button></div>`;
  else content=`<span class="eyebrow">${state.phase==='victory'?'THE ARENA FALLS SILENT':'THE MOMENT IS LOST'}</span><div class="result-glyph" aria-hidden="true">${state.phase==='victory'?'✦':'†'}</div><h2>${state.phase==='victory'?'Still standing.':'One move too far.'}</h2><p>${state.phase==='victory'?'You prepared your openings and cut through the crowd.':'Every commitment is visible. Take another approach, or use The perfect opening to practice a frozen attack turn.'}</p><div class="result-stats"><span><b>${state.kills}</b>kills</span><span><b>${state.beat}</b>beats</span><span><b>${state.player.hp}</b>HP left</span></div><div class="modal-buttons"><button id="restart-confirm" class="primary">Try again</button><button id="choose-encounter" class="quiet">Choose encounter</button><button id="modal-close" class="text-button">Inspect final arena</button></div>`;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${modal==='help'?'Field guide':modal==='scenarios'?'Choose encounter':modal==='restart'?'Restart encounter':'Encounter result'}">${content}</section></div>`;
}
function render() {
  commands = terminal()?[]:legalCommands(state);
  forecast = pending ? preview(state,attachPayment(pending)) : null;
  if (pending && isSpell(pending.kind)) pending=attachPayment(pending);
  const frozen=state.phase==='attack', scenario=SCENARIOS.find(s=>s.id===state.scenario)!;
  const movement = state.phase === 'defense' ? forecast ?? preview(state, { kind: 'wait' }) : null;
  const arrowLegend = state.phase === 'defense' ? `<span title="Solid red arrows show committed attack lanes. Bodies can block them, and breaching or parrying can interrupt them. Review the exact forecast before confirming."><i class="legend-arrow" aria-hidden="true">→</i>Attack</span><span title="Dashed arrows show enemy movement ${pending ? 'after this selected action' : 'if you choose Wait'}. Select an action and target to see its exact movement forecast."><i class="legend-arrow movement" aria-hidden="true">⇢</i>${pending ? 'Movement forecast' : 'Movement if you Wait'}</span>` : '';
  document.body.dataset.phase=state.phase;
  const occupiedPhase = terminal()?state.phase.toUpperCase():frozen?'ATTACK TURN · TIME FROZEN':'DEFENSIVE TIME';
  const resource=frozen?state.budget:state.charge;
  app.innerHTML=`<main class="game-shell" ${modal?'inert':''}><header class="masthead"><a class="wordmark" href="#" aria-label="Stillblade combat prototype"><span class="brand-mark" aria-hidden="true">†</span><span>STILLBLADE<small>A STUDY IN VIOLENCE</small></span></a><nav aria-label="Game tools"><button id="help" class="text-button">Field guide <span aria-hidden="true">?</span></button><button id="scenarios" class="text-button">Encounters</button><button id="restart" class="icon-button" aria-label="Restart encounter" title="Restart encounter">↺</button></nav></header><section class="combat-hud" aria-label="Player resources"><div class="health-cluster"><span class="eyebrow">VITALITY</span>${hearts(state.player.hp,state.player.maxHp)}<small>${state.player.hp} / ${state.player.maxHp} HP</small></div><div class="charge-cluster"><div class="resource-title"><span class="eyebrow">${frozen?'ATTACK BUDGET':'CHARGE'}</span><strong>${resource}<small>${frozen?' points':' / 12'}</small></strong></div><div class="charge-segments" role="meter" aria-label="${frozen?'Attack budget':'Charge'}" aria-valuenow="${resource}" aria-valuemin="0" aria-valuemax="${Math.max(12,resource)}">${Array.from({length:12},(_,i)=>`<i class="${i<resource?'filled':''} ${i===3?'threshold':''}"></i>`).join('')}</div><small>${frozen?'Each wound refunds 1 budget':state.charge>=4?'Freeze time is ready':'Freeze time unlocks at 4'}</small></div><div class="souls-cluster"><div><span class="soul-icon" aria-hidden="true">♧</span><strong>${state.fresh.length}</strong><span>fresh</span></div><div><strong>${state.reserve}<small>/9</small></strong><span>reserve</span></div></div></section><div class="play-layout"><section class="battlefield" aria-label="Battlefield"><div class="arena-heading"><div><span class="phase-label"><i></i>${occupiedPhase}</span><h1>${scenario.name}</h1></div><div class="beat-counter"><b>${String(state.beat).padStart(2,'0')}</b><span>BEAT</span></div></div>${renderBoard(movement)}<div class="board-legend">${arrowLegend}<span><i class="legend-threat"></i>Attack cells</span><span><i class="legend-legal"></i>Legal choice</span><span>⋇ Exposed</span><span>◇ Protected</span><span title="No attack this turn. This enemy may move or prepare its next tell after your action.">– No attack</span></div>${selected==='sweep'&&selectedTargets.length?`<button id="review-targets" class="quiet selection-review">Review ${selectedTargets.length} target${selectedTargets.length===1?'':'s'} →</button>`:''}<div class="phase-controls">${frozen?`<button id="end-attack" class="phase-button end-button" data-action="end"><span>◷</span><div><b>End attack turn</b><small>Discard ${state.budget} budget · stale ${state.fresh.length} souls</small></div><kbd>E</kbd></button>`:terminal()?`<button id="show-result" class="phase-button"><span>†</span><div><b>${state.phase==='victory'?'Victory':'Defeat'} · view result</b></div></button>`:`<button id="activate" class="phase-button ${state.charge>=4?'ready':''}" data-action="activate" ${state.charge>=4?'':'disabled'}><span>✦</span><div><b>Freeze time</b><small>${state.charge>=4?`Cash in ${state.charge} charge · interrupt all enemies`:`${4-state.charge} more charge needed · interrupt all enemies`}</small></div><kbd>F</kbd></button>`}</div><section class="inspector" aria-label="Cell inspector"><div class="section-label">INSPECT <span>Free · tap any cell</span></div>${renderInspector(movement)}</section><details class="combat-log"><summary>Combat record <span>${state.actions} actions</span></summary><ol>${state.log.slice(-18).reverse().map(l=>`<li>${esc(l)}</li>`).join('')||'<li>The encounter begins.</li>'}</ol></details></section><section class="command-panel" aria-label="Action controls">${renderActions()}<section class="forecast ${pending?'has-preview':''}" aria-label="Action forecast">${renderForecast()}</section><div class="confirm-row"><button id="cancel" class="quiet" ${selected?'':'disabled'}>Cancel</button><button id="confirm" class="primary" ${forecast?.ok?'':'disabled'}>${forecast?.ok&&forecast.state.phase==='defeat'?'Confirm fatal move':pending?'Confirm action':'Choose an action'}<span aria-hidden="true">↵</span></button></div><p id="live-notice" class="notice" aria-live="polite" aria-atomic="true">${esc(notice)}</p><div class="principle"><span>⌁</span><p>${frozen?'A wound opens the way. A soul pays for what comes next.':'A good defense prepares a devastating offense.'}</p></div></section></div><footer class="footer"><span>COMBAT PROTOTYPE · 0.1</span><span>No reflexes. No hidden rolls.</span></footer></main>${renderModal()}`;
  bind();
  tooltips.refresh();
  if(modal) requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.modal button')?.focus());
}
function bind() {
  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>{
    b.dataset.tooltip = META[b.dataset.action as ActionKind].hint;
    b.addEventListener('click',()=>pickAction(b.dataset.action as ActionKind));
  });
  app.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach(b=>b.addEventListener('click',()=>{const [x,y]=b.dataset.cell!.split(',').map(Number);chooseCell({x,y});}));
  app.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach(b=>b.addEventListener('click',()=>loadScenario(b.dataset.scenario as ScenarioId)));
  app.querySelectorAll<HTMLInputElement>('[data-soul]').forEach(b=>b.addEventListener('change',()=>{
    if(b.checked) paymentFresh.push(b.dataset.soul!); else paymentFresh=paymentFresh.filter(id=>id!==b.dataset.soul);
    paymentReserve=Math.max(0,spellUnits()-paymentFresh.length)*3;
    if(paymentReserve>state.reserve) paymentReserve=0;
    render();
  }));
  document.getElementById('reserve-payment')?.addEventListener('change',e=>{ paymentReserve=Number((e.target as HTMLSelectElement).value); if(paymentFresh.length+paymentReserve/3>spellUnits()) paymentFresh=paymentFresh.slice(0,Math.max(0,spellUnits()-paymentReserve/3)); render(); });
  document.getElementById('help')?.addEventListener('click',()=>openModal('help'));
  document.getElementById('scenarios')?.addEventListener('click',()=>openModal('scenarios'));
  document.getElementById('restart')?.addEventListener('click',()=>openModal('restart'));
  document.getElementById('restart-confirm')?.addEventListener('click',()=>loadScenario(state.scenario));
  document.getElementById('choose-encounter')?.addEventListener('click',()=>openModal('scenarios'));
  document.getElementById('show-result')?.addEventListener('click',()=>openModal('result'));
  document.getElementById('modal-close')?.addEventListener('click',closeModal);
  document.getElementById('confirm')?.addEventListener('click',commit);
  document.getElementById('review-targets')?.addEventListener('click',()=>{scrollToForecast();document.querySelector<HTMLButtonElement>('#confirm')?.focus({preventScroll:true});});
  document.getElementById('cancel')?.addEventListener('click',()=>{resetSelection();notice='Action canceled. No time passed.';render();});
  document.getElementById('stay-here')?.addEventListener('click',()=>chooseCell({...state.player}));
  document.getElementById('reset-stance')?.addEventListener('click',()=>{anchor=null;selectedTargets=[];pending=null;render();});
  document.querySelector('.wordmark')?.addEventListener('click',e=>e.preventDefault());
}
function focusCursor() { document.querySelector<HTMLButtonElement>(`[data-cell="${posText(cursor)}"]`)?.focus({preventScroll:true}); }
document.addEventListener('keydown',e=>{
  const target=e.target as HTMLElement;
  if(modal) {
    if(e.key==='Escape') {e.preventDefault();closeModal();return;}
    if(e.key==='Tab') {
      const items=Array.from(document.querySelectorAll<HTMLElement>('.modal button, .modal [href], .modal input, .modal select, .modal summary')).filter(el=>!el.hasAttribute('disabled'));
      const first=items[0], last=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
    return;
  }
  if(target instanceof HTMLSelectElement || target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  if(e.key==='Escape'){e.preventDefault();resetSelection();render();return;}
  if(e.key==='?'){e.preventDefault();openModal('help');return;}
  const index=Number(e.key)-1, kinds=state.phase==='attack'?ATTACK:DEFENSE;
  if(/^[1-8]$/.test(e.key)&&kinds[index]&&commands.some(c=>c.kind===kinds[index])){e.preventDefault();pickAction(kinds[index]);return;}
  if(e.key.toLowerCase()==='f'&&commands.some(c=>c.kind==='activate')){e.preventDefault();pickAction('activate');return;}
  if(e.key.toLowerCase()==='e'&&state.phase==='attack'){e.preventDefault();pickAction('end');return;}
  if(e.key==='Enter' && pending && (target.tagName==='BODY' || target.id==='confirm')){e.preventDefault();commit();return;}
  if(target.closest('.arena')) {
    const offsets:Record<string,Pos>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};
    if(offsets[e.key]) { e.preventDefault(); const d=offsets[e.key]; cursor={x:Math.max(1,Math.min(state.width,cursor.x+d.x)),y:Math.max(1,Math.min(state.height,cursor.y+d.y))}; document.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach(b=>b.tabIndex=b.dataset.cell===posText(cursor)?0:-1);focusCursor(); }
    else if(e.key===' '||e.key==='Enter') { e.preventDefault(); chooseCell(cursor); }
  }
});

Object.assign(window,{__STILLBLADE__:{getState:()=>structuredClone(state),dispatch:(command:Command)=>{const result=applyCommand(state,command);if(result.ok){state=result.state;resetSelection();inspected={...state.player};cursor={...state.player};modal=terminal()?'result':null;save();render();}return structuredClone(result);},loadScenario:(id:ScenarioId)=>{if(SCENARIOS.some(s=>s.id===id))loadScenario(id);},getLegalCommands:()=>structuredClone(legalCommands(state)),preview:(command:Command)=>structuredClone(preview(state,command))}});
render();
