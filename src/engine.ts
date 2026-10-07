import { DIRECTIONS, RULES, distance, key, same } from './model';
import type { Command, CombatEvent, Enemy, EnemyKind, GameState, Intent, Pos, Resolution, ScenarioId } from './model';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const add = (a: Pos, b: Pos, n = 1): Pos => ({ x: a.x + b.x * n, y: a.y + b.y * n });
const pos = (a: Pos): Pos => ({ x: a.x, y: a.y });
const order: Record<EnemyKind, number> = { gunner: 0, charger: 1, swordsman: 2, warden: 3 };
const ordered = (enemies: Enemy[]) => [...enemies].sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id, undefined, { numeric: true }));
const reject = (message: string): never => { throw new Error(message); };
const insist = (condition: unknown, message: string): void => { if (!condition) reject(message); };
const inBounds = (s: GameState, p: Pos) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 1 && p.y >= 1 && p.x <= s.width && p.y <= s.height;
const wallAt = (s: GameState, p: Pos) => !inBounds(s, p) || s.walls.some(w => same(w, p));
export const enemyAt = (s: GameState, p: Pos): Enemy | undefined => s.enemies.find(e => same(e, p));
const blocked = (s: GameState, p: Pos, ignore?: string) => wallAt(s, p) || s.enemies.some(e => e.id !== ignore && same(e, p)) || same(s.player, p);
const empty = (s: GameState, p: Pos) => !blocked(s, p);
const rayDirection = (a: Pos, b: Pos): Pos | null => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return (dx || dy) && (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) ? { x: Math.sign(dx), y: Math.sign(dy) } : null;
};
const cornerClear = (s: GameState, a: Pos, b: Pos, bodies: boolean, ignore?: string): boolean => {
  if (a.x === b.x || a.y === b.y) return true;
  const side1 = { x: b.x, y: a.y }, side2 = { x: a.x, y: b.y };
  const isBlocked = (p: Pos) => bodies ? blocked(s, p, ignore) : wallAt(s, p);
  return !(isBlocked(side1) && isBlocked(side2));
};

/** Center-to-center visibility; a diagonal corner is opaque only if both sides are walls. */
function visible(s: GameState, a: Pos, b: Pos): boolean {
  if (wallAt(s, b)) return false;
  if (same(a, b)) return true;
  const dx = b.x - a.x, dy = b.y - a.y, sx = Math.sign(dx), sy = Math.sign(dy);
  const tx = dx === 0 ? Infinity : 1 / Math.abs(dx), ty = dy === 0 ? Infinity : 1 / Math.abs(dy);
  let mx = tx / 2, my = ty / 2, current = pos(a);
  while (!same(current, b)) {
    const before = pos(current);
    if (Math.abs(mx - my) < 1e-10) { current = { x: current.x + sx, y: current.y + sy }; mx += tx; my += ty; }
    else if (mx < my) { current.x += sx; mx += tx; }
    else { current.y += sy; my += ty; }
    if (wallAt(s, current) || !cornerClear(s, before, current, false)) return false;
  }
  return true;
}

function straightPath(s: GameState, from: Pos, to: Pos, limit: number, allowFinalEnemy?: string): Pos[] | null {
  const direction = rayDirection(from, to);
  if (!direction || distance(from, to) > limit || !inBounds(s, to)) return null;
  const cells: Pos[] = [];
  let previous = from;
  for (let n = 1; n <= distance(from, to); n++) {
    const p = add(from, direction, n), occupant = enemyAt(s, p);
    if (wallAt(s, p) || (occupant && !(same(p, to) && occupant.id === allowFinalEnemy)) || !cornerClear(s, previous, p, true)) return null;
    cells.push(p); previous = p;
  }
  return cells;
}
function vaultPath(s: GameState, to: Pos): Pos[] | null {
  const direction = rayDirection(s.player, to);
  if (!direction || distance(s.player, to) !== 2 || !empty(s, to)) return null;
  const middle = add(s.player, direction);
  if (!enemyAt(s, middle) || !cornerClear(s, s.player, middle, true) || !cornerClear(s, middle, to, true)) return null;
  return [middle, to];
}
function projectileTarget(s: GameState, target: Enemy, limit: number): boolean {
  const direction = rayDirection(s.player, target);
  if (!direction || distance(s.player, target) > limit) return false;
  let previous: Pos = s.player;
  for (let n = 1; n <= distance(s.player, target); n++) {
    const p = add(s.player, direction, n);
    if (wallAt(s, p) || !cornerClear(s, previous, p, false)) return false;
    const body = enemyAt(s, p);
    if (body) return body.id === target.id;
    previous = p;
  }
  return false;
}
function attackIntent(s: GameState, e: Enemy, at: Pos = e): Intent | null {
  if (e.exposure > 0 || e.guard <= 0) return null;
  const d = distance(at, s.player), direction = { x: Math.sign(s.player.x - at.x), y: Math.sign(s.player.y - at.y) };
  if (e.kind === 'swordsman') {
    if (d !== 1 || !visible(s, at, s.player)) return null;
    return { cells: [pos(s.player)], direction, damage: 1, parryable: true };
  }
  if (e.kind === 'warden') {
    if (d !== 1 || !visible(s, at, s.player)) return null;
    const facing = DIRECTIONS.findIndex(p => same(p, direction));
    const cells = [-1, 0, 1].map(offset => add(at, DIRECTIONS[(facing + offset + 8) % 8]!)).filter(p => !wallAt(s, p) && visible(s, at, p));
    return { cells, direction, damage: 2, parryable: false };
  }
  const ray = rayDirection(at, s.player), range = e.kind === 'charger' ? 3 : 5;
  if (!ray || d > range || !visible(s, at, s.player)) return null;
  const cells: Pos[] = [];
  let previous = at;
  for (let n = 1; n <= range; n++) {
    const p = add(at, ray, n);
    if (wallAt(s, p) || !cornerClear(s, previous, p, false)) break;
    cells.push(p); previous = p;
  }
  return { cells, direction: ray, damage: 1, parryable: e.kind === 'charger' };
}
function nextEnemyStep(s: GameState, e: Enemy): Pos | null {
  const queue: { p: Pos; first: Pos | null }[] = [{ p: pos(e), first: null }], seen = new Set([key(e)]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    if (node.first && attackIntent(s, e, node.p)) return node.first;
    for (const direction of DIRECTIONS) {
      const p = add(node.p, direction);
      if (seen.has(key(p)) || blocked(s, p, e.id) || !cornerClear(s, node.p, p, true, e.id)) continue;
      seen.add(key(p)); queue.push({ p, first: node.first ?? p });
    }
  }
  return null;
}

interface Context { s: GameState; events: CombatEvent[]; damaged: Set<string>; }
function emit(c: Context, kind: CombatEvent['kind'], text: string, at?: Pos, from?: Pos) {
  c.events.push({ kind, text, ...(at ? { at: pos(at) } : {}), ...(from ? { from: pos(from) } : {}) });
}
function guardDamage(c: Context, e: Enemy, amount: number, reason: string) {
  if (e.protected || e.guard <= 0 || amount <= 0) return;
  const loss = Math.min(e.guard, amount); e.guard -= loss; c.damaged.add(e.id);
  emit(c, 'guard', `${e.id}: −${loss} Guard (${reason}); ${e.guard}/${e.maxGuard}.`, e);
  if (e.guard === 0) {
    e.exposure = RULES.exposure; e.intent = null;
    emit(c, 'breach', `${e.id} BREACHED — interrupted and exposed for ${RULES.exposure} defensive decisions.`, e);
  }
}
function gainCharge(c: Context, amount: number, reason: string) {
  const gain = Math.min(RULES.chargeCap - c.s.charge, amount); c.s.charge += gain;
  if (gain > 0) emit(c, 'charge', `+${gain} charge (${reason}); ${c.s.charge}/${RULES.chargeCap}.`);
}
function collect(c: Context, cells: Pos[]) {
  const selected = new Set(cells.map(key));
  c.s.stale = c.s.stale.filter(soul => {
    if (!selected.has(key(soul)) || c.s.reserve >= RULES.reserveCap) return true;
    c.s.reserve++; emit(c, 'soul', `Collected ${soul.id}: +1 reserve (${c.s.reserve}/${RULES.reserveCap}).`, soul); return false;
  });
}
function move(c: Context, cells: Pos[], description: string) {
  if (!cells.length) return;
  const from = pos(c.s.player), to = cells[cells.length - 1]!;
  c.s.player.x = to.x; c.s.player.y = to.y; collect(c, cells);
  emit(c, 'move', `${description}: (${from.x},${from.y}) → (${to.x},${to.y}).`, to, from);
}
function hurt(c: Context, amount: number, e: Enemy) {
  c.s.player.hp = Math.max(0, c.s.player.hp - amount);
  emit(c, 'hurt', `${e.id} hits for ${amount} heart${amount === 1 ? '' : 's'}. ${c.s.player.hp}/${c.s.player.maxHp} remain.`, c.s.player);
}
function wound(c: Context, e: Enemy) {
  e.hp--; c.s.wounds++; c.s.budget++;
  emit(c, 'wound', `${e.id}: −1 HP. +1 attack budget.`, e);
  if (e.hp <= 0) {
    c.s.enemies = c.s.enemies.filter(other => other.id !== e.id); c.s.kills++;
    const soul = { id: `s${c.s.nextSoulId++}`, x: e.x, y: e.y }; c.s.fresh.push(soul);
    emit(c, 'kill', `${e.id} is torn apart. Fresh soul ${soul.id} is ready to spend.`, e);
  } else {
    e.guard = e.maxGuard; e.exposure = 0; e.protected = true; e.intent = null;
    emit(c, 'info', `${e.id} survives at ${e.hp} HP; Guard restored, protected until this attack turn ends.`, e);
  }
}
function staleFresh(c: Context) {
  for (const soul of c.s.fresh) {
    c.s.stale.push({ ...soul }); emit(c, 'soul', `${soul.id} becomes stale at (${soul.x},${soul.y}).`, soul);
  }
  c.s.fresh = [];
}
function victory(c: Context) {
  staleFresh(c);
  const available = c.s.stale.length, collected = Math.min(available, RULES.reserveCap - c.s.reserve);
  c.s.reserve += collected; c.s.stale = []; c.s.budget = 0; c.s.phase = 'victory';
  emit(c, 'phase', `VICTORY — ${collected} stale soul${collected === 1 ? '' : 's'} collected${available > collected ? `; ${available - collected} overflow discarded` : ''}.`);
}
function spendBudget(c: Context, cost: number) {
  insist(c.s.budget >= cost, `Needs ${cost} attack budget; you have ${c.s.budget}.`);
  c.s.budget -= cost;
}
function pay(c: Context, command: Command, units: number) {
  const fresh = c.s.phase === 'attack' ? c.s.fresh : [];
  let ids: string[], reserve: number;
  if (command.payment) { ids = command.payment.fresh; reserve = command.payment.reserve; }
  else { ids = fresh.slice(0, units).map(soul => soul.id); reserve = (units - ids.length) * 3; }
  insist(Array.isArray(ids) && new Set(ids).size === ids.length, 'Each fresh soul can be spent only once.');
  insist(Number.isInteger(reserve) && reserve >= 0 && reserve % 3 === 0 && ids.length + reserve / 3 === units, `This spell needs exactly ${units} soul equivalent${units === 1 ? '' : 's'}.`);
  insist(ids.every(id => fresh.some(soul => soul.id === id)), 'Selected fresh soul is unavailable.');
  insist(c.s.reserve >= reserve, `Needs ${reserve} reserve; you have ${c.s.reserve}.`);
  c.s.fresh = c.s.fresh.filter(soul => !ids.includes(soul.id)); c.s.reserve -= reserve;
  emit(c, 'soul', `Paid ${ids.length} fresh soul${ids.length === 1 ? '' : 's'}${ids.length ? ` (${ids.join(', ')})` : ''} and ${reserve} reserve.`);
}
function selectedEnemy(s: GameState, command: Command): Enemy {
  const e = s.enemies.find(enemy => enemy.id === command.target);
  insist(e, 'Choose a living enemy.'); return e!;
}
function destination(command: Command): Pos {
  insist(command.to && Number.isInteger(command.to.x) && Number.isInteger(command.to.y), 'Choose a board cell.'); return command.to!;
}
function exposed(e: Enemy) { insist(!e.protected, `${e.id} is protected for the rest of this attack turn.`); insist(e.guard === 0 && e.exposure > 0, `${e.id} must be breached before taking HP damage.`); }
function spell(c: Context, command: Command) {
  const s = c.s;
  if (command.kind === 'bell') {
    const center = destination(command);
    insist(distance(s.player, center) <= 4 && visible(s, s.player, center), 'Bell needs a visible center within 4 cells.');
    const targets = s.enemies.filter(e => !e.protected && e.guard > 0 && distance(center, e) <= 1 && visible(s, center, e));
    insist(targets.length, 'Bell must affect at least one guarded, unprotected enemy.');
    pay(c, command, 1); targets.forEach(e => guardDamage(c, e, 3, 'Bell'));
  } else if (command.kind === 'thread') {
    const to = destination(command);
    insist(empty(s, to) && distance(s.player, to) <= 4 && visible(s, s.player, to), 'Thread needs an empty visible cell within 4 cells.');
    pay(c, command, 1); move(c, [to], 'Thread');
  } else {
    insist(s.phase === 'attack', 'Soul Lance is available only in frozen time.');
    const e = selectedEnemy(s, command); exposed(e);
    insist(projectileTarget(s, e, 5), 'Soul Lance needs a clear ray within 5 cells.');
    pay(c, command, 2); wound(c, e);
  }
}

/** A lane behind a body is a commitment, but moving out of it is not an evade. */
function attackCanReach(s: GameState, e: Enemy, intent: Intent, target: Pos): boolean {
  if (!intent.cells.some(cell => same(cell, target))) return false;
  if (e.kind !== 'gunner' && e.kind !== 'charger') return true;
  const cells = e.kind === 'charger' ? [1, 2, 3].map(n => add(e, intent.direction, n)) : intent.cells;
  const obstruction = (p: Pos) => wallAt(s, p) || s.enemies.some(body => body.id !== e.id && same(body, p));
  let previous: Pos = e;
  for (const cell of cells) {
    if (wallAt(s, cell)) return false;
    if (e.kind === 'charger' && previous.x !== cell.x && previous.y !== cell.y) {
      if (obstruction({ x: cell.x, y: previous.y }) && obstruction({ x: previous.x, y: cell.y })) return false;
    } else if (!cornerClear(s, previous, cell, false)) return false;
    if (s.enemies.some(body => body.id !== e.id && same(body, cell))) return false;
    if (same(cell, target)) return true;
    previous = cell;
  }
  return false;
}

function resolveDefense(c: Context, command: Command, validateOnly: boolean) {
  const s = c.s, start = pos(s.player), priorExposed = new Set(s.enemies.filter(e => e.exposure > 0).map(e => e.id));
  const committed = new Map(s.enemies.filter(e => e.intent).map(e => [e.id, copy(e.intent!)]));
  if (command.kind === 'slip') {
    const path = straightPath(s, s.player, destination(command), 2); insist(path, 'Move needs a clear straight path of 1 or 2 cells.'); move(c, path!, 'Move');
  } else if (command.kind === 'vault') {
    const path = vaultPath(s, destination(command)); insist(path, 'Vault crosses one adjacent enemy to the empty cell beyond.'); move(c, path!, 'Vault');
  } else if (command.kind === 'parry') {
    const e = selectedEnemy(s, command), to = command.to ?? pos(s.player);
    insist(same(to, s.player) || straightPath(s, s.player, to, 1), 'Turn Aside allows staying or one clear step.');
    insist(e.intent?.parryable && e.intent.cells.some(p => same(p, to)) && distance(e, to) === 1, 'Choose a committed, adjacent melee attack that hits your destination.');
    if (!same(to, s.player)) move(c, [to], 'Turn Aside');
    e.intent = null; emit(c, 'info', `Parried ${e.id}; its committed attack is canceled.`, e); guardDamage(c, e, 4, 'parry'); gainCharge(c, 2, 'parry');
  } else if (command.kind === 'light') {
    const e = selectedEnemy(s, command);
    insist(!e.protected && e.guard > 0 && distance(s.player, e) === 1 && visible(s, s.player, e), 'Light Attack needs an adjacent guarded, unprotected enemy.');
    guardDamage(c, e, 4, 'Light Attack');
  } else if (command.kind === 'harrier') {
    const e = selectedEnemy(s, command); insist(projectileTarget(s, e, 4), 'Harrier Shot needs the first enemy on a clear ray within 4 cells.'); guardDamage(c, e, 3, 'Harrier Shot');
  } else if (command.kind === 'bell' || command.kind === 'thread') spell(c, command);
  else insist(command.kind === 'wait', 'That action is unavailable in defensive time.');
  if (validateOnly) return;

  let rewardedEvade = false;
  for (const e of ordered(s.enemies)) {
    const intent = committed.get(e.id);
    if (!intent || !e.intent || e.exposure > 0) continue;
    // Earlier committed attacks may move bodies into or out of a later lane.
    const threatenedStart = attackCanReach(s, e, intent, start);
    e.intent = null;
    let hitPlayer = false;
    if (e.kind === 'gunner') {
      for (const cell of intent.cells) {
        if (same(s.player, cell)) { hurt(c, intent.damage, e); hitPlayer = true; break; }
        const body = enemyAt(s, cell);
        if (body) { guardDamage(c, body, 4, `${e.id} friendly fire`); break; }
      }
      emit(c, 'info', `${e.id} fires along its committed lane.`, e);
    } else if (e.kind === 'charger') {
      const from = pos(e);
      for (let n = 0; n < 3; n++) {
        const to = add(e, intent.direction);
        if (wallAt(s, to) || !cornerClear(s, e, to, true, e.id)) { guardDamage(c, e, 2, 'wall impact'); break; }
        if (same(s.player, to)) { hurt(c, intent.damage, e); hitPlayer = true; break; }
        const body = enemyAt(s, to);
        if (body) { guardDamage(c, body, 4, `${e.id} collision`); guardDamage(c, e, 2, 'body collision'); break; }
        e.x = to.x; e.y = to.y;
      }
      if (!same(from, e)) emit(c, 'move', `${e.id} charges to (${e.x},${e.y}).`, e, from);
    } else if (intent.cells.some(cell => same(cell, s.player))) { hurt(c, intent.damage, e); hitPlayer = true; }
    else emit(c, 'info', `${e.id}'s committed swing misses.`, e);
    if (s.player.hp === 0) { s.phase = 'defeat'; emit(c, 'phase', 'DEFEAT — your final heart is gone.'); break; }
    const evaded = threatenedStart && !intent.cells.some(cell => same(cell, s.player)) && !hitPlayer;
    if (evaded) {
      guardDamage(c, e, 2, 'evaded attack');
      if (!rewardedEvade) { gainCharge(c, 1, 'evade'); rewardedEvade = true; }
    }
  }
  s.beat++;
  if (s.phase === 'defeat') return;
  const restored = new Set<string>();
  for (const e of s.enemies) {
    if (priorExposed.has(e.id)) {
      e.exposure = Math.max(0, e.exposure - 1);
      if (e.exposure === 0) { e.guard = e.maxGuard; restored.add(e.id); emit(c, 'guard', `${e.id} recovers: Guard restored to ${e.maxGuard}.`, e); }
    } else if (e.guard > 0 && !c.damaged.has(e.id) && e.guard < e.maxGuard) {
      e.guard = Math.min(e.maxGuard, e.guard + RULES.regen); emit(c, 'guard', `${e.id} regenerates 1 Guard (${e.guard}/${e.maxGuard}).`, e);
    }
  }
  for (const e of ordered(s.enemies)) {
    if (e.exposure > 0) { e.intent = null; continue; }
    if (restored.has(e.id)) { e.intent = attackIntent(s, e); continue; }
    if (committed.has(e.id)) continue;
    e.intent = attackIntent(s, e);
    if (!e.intent) {
      const step = nextEnemyStep(s, e);
      if (step) { const from = pos(e); e.x = step.x; e.y = step.y; emit(c, 'move', `${e.id} approaches (${e.x},${e.y}).`, e, from); e.intent = attackIntent(s, e); }
    }
  }
}
function resolveAttack(c: Context, command: Command) {
  const s = c.s;
  if (command.kind === 'end') {
    const discarded = s.budget; s.budget = 0; staleFresh(c); collect(c, [s.player]); s.phase = 'defense';
    for (const e of s.enemies) { e.protected = false; e.intent = e.exposure > 0 ? null : attackIntent(s, e); }
    emit(c, 'phase', `Defensive time resumes. ${discarded} unused budget discarded; fresh enemy tells are visible.`); return;
  }
  if (command.kind === 'bell' || command.kind === 'thread' || command.kind === 'lance') spell(c, command);
  else if (command.kind === 'traverse') {
    const to = destination(command), path = straightPath(s, s.player, to, 2) ?? vaultPath(s, to);
    insist(path, 'Traverse needs a clear 1–2 cell ray or a vault over one adjacent enemy.'); spendBudget(c, 1); move(c, path!, 'Traverse');
  } else if (command.kind === 'break') {
    const e = selectedEnemy(s, command); insist(!e.protected && e.guard > 0 && distance(s.player, e) === 1 && visible(s, s.player, e), 'Break needs an adjacent guarded, unprotected enemy.');
    spendBudget(c, 2); guardDamage(c, e, 4, 'Break');
  } else if (command.kind === 'lunge') {
    const e = selectedEnemy(s, command); exposed(e); const path = straightPath(s, s.player, e, 3, e.id);
    insist(path, 'Lunge needs an exposed enemy on a clear ray within 3 cells.'); spendBudget(c, 3);
    move(c, path!.slice(0, -1), 'Lunge'); wound(c, e); if (e.hp <= 0) move(c, [pos(e)], 'Finish lunge');
  } else if (command.kind === 'shot') {
    const e = selectedEnemy(s, command); exposed(e); insist(projectileTarget(s, e, 5), 'Execution Shot needs the first exposed enemy on a clear ray within 5 cells.'); spendBudget(c, 3); wound(c, e);
  } else if (command.kind === 'sweep') {
    const to = command.to ?? pos(s.player), ids = command.targets ?? (command.target ? [command.target] : []);
    insist(ids.length >= 1 && ids.length <= 3 && new Set(ids).size === ids.length, 'Sweep selects 1 to 3 different exposed enemies.');
    insist(same(to, s.player) || straightPath(s, s.player, to, 1), 'Sweep allows staying or one clear step.');
    const targets = ids.map(id => selectedEnemy(s, { kind: 'sweep', target: id }));
    for (const e of targets) { exposed(e); insist(distance(to, e) === 1 && visible(s, to, e), 'Every Sweep target must be adjacent to the destination.'); }
    spendBudget(c, 5); if (!same(to, s.player)) move(c, [to], 'Sweep step'); targets.forEach(e => wound(c, e));
  } else reject('That action is unavailable during an attack turn.');
  if (s.enemies.length === 0) victory(c);
}
function transition(state: GameState, command: Command, validateOnly = false): Resolution {
  const s = copy(state), c: Context = { s, events: [], damaged: new Set() };
  try {
    insist(s.phase === 'defense' || s.phase === 'attack', 'This encounter has ended. Start another encounter.');
    if (command.kind === 'activate') {
      insist(s.phase === 'defense', 'Already in an attack turn.'); insist(s.charge >= RULES.threshold, `Activation needs ${RULES.threshold} charge.`);
      s.budget = s.charge; s.charge = 0; s.phase = 'attack';
      s.enemies.forEach(e => { e.intent = null; });
      emit(c, 'phase', `TIME FROZEN — all enemy attacks interrupted. ${s.budget} attack budget.`);
      s.enemies.forEach(e => guardDamage(c, e, RULES.pulse, 'activation pulse'));
    } else if (s.phase === 'defense') resolveDefense(c, command, validateOnly);
    else resolveAttack(c, command);
    if (!validateOnly) { s.actions++; s.log = [...s.log, ...c.events.map(event => event.text)].slice(-100); }
    return { ok: true, state: s, events: c.events };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid action.', state: copy(state), events: [] }; }
}
/** Forecast and execution share exactly one pure transition, including enemy movement and regeneration. */
export const preview = (state: GameState, command: Command): Resolution => transition(state, command);
export const applyCommand = (state: GameState, command: Command): Resolution => transition(state, command);
export function threatCells(state: GameState): Pos[] {
  const result = new Map<string, Pos>();
  for (const e of state.enemies) for (const p of e.intent?.cells ?? []) result.set(key(p), pos(p));
  return [...result.values()];
}
export function legalCommands(s: GameState): Command[] {
  if (s.phase !== 'defense' && s.phase !== 'attack') return [];
  const candidates: Command[] = [], neighbors = [pos(s.player), ...DIRECTIONS.map(d => add(s.player, d))];
  if (s.phase === 'defense') {
    candidates.push({ kind: 'wait' }, { kind: 'activate' });
    for (const d of DIRECTIONS) for (const n of [1, 2]) candidates.push({ kind: 'slip', to: add(s.player, d, n) });
    for (const d of DIRECTIONS) candidates.push({ kind: 'vault', to: add(s.player, d, 2) });
    for (const e of s.enemies) {
      candidates.push({ kind: 'light', target: e.id }, { kind: 'harrier', target: e.id });
      for (const to of neighbors) candidates.push({ kind: 'parry', target: e.id, to });
    }
  } else {
    candidates.push({ kind: 'end' });
    for (const d of DIRECTIONS) for (const n of [1, 2]) candidates.push({ kind: 'traverse', to: add(s.player, d, n) });
    for (const e of s.enemies) for (const kind of ['lunge', 'shot', 'break', 'lance'] as const) candidates.push({ kind, target: e.id });
    if (s.budget >= 5) for (const to of neighbors) {
      const targets = s.enemies.filter(e => !e.protected && e.exposure > 0 && distance(to, e) === 1).map(e => e.id);
      const combinations = (chosen: string[], start: number) => {
        if (chosen.length) candidates.push({ kind: 'sweep', to, targets: [...chosen] });
        if (chosen.length === 3) return;
        for (let i = start; i < targets.length; i++) combinations([...chosen, targets[i]!], i + 1);
      };
      combinations([], 0);
    }
  }
  if (s.reserve >= 3 || (s.phase === 'attack' && s.fresh.length)) {
    for (let y = 1; y <= s.height; y++) for (let x = 1; x <= s.width; x++) {
      candidates.push({ kind: 'bell', to: { x, y } }, { kind: 'thread', to: { x, y } });
    }
  }
  return candidates.filter(command => transition(s, command, true).ok);
}
export function commandLabel(command: Command): string {
  const names: Record<Command['kind'], string> = { slip: 'Move', parry: 'Turn Aside', vault: 'Vault', light: 'Light Attack', harrier: 'Harrier Shot', wait: 'Wait', activate: 'Activate Attack Turn', lunge: 'Lunge', shot: 'Execution Shot', sweep: 'Sweep', break: 'Break', traverse: 'Traverse', bell: 'Bell', thread: 'Thread', lance: 'Soul Lance', end: 'End Attack Turn' };
  return `${names[command.kind]}${command.target ? ` ${command.target}` : ''}${command.targets?.length ? ` ${command.targets.join(' + ')}` : ''}${command.to ? ` → (${command.to.x},${command.to.y})` : ''}`;
}
function makeEnemy(id: string, kind: EnemyKind, x: number, y: number, guard?: number): Enemy {
  const maxGuard = kind === 'warden' ? 15 : 10, hp = kind === 'warden' ? 2 : 1;
  return { id, kind, x, y, guard: guard ?? maxGuard, maxGuard, hp, maxHp: hp, exposure: 0, protected: false, intent: null };
}
export function createGame(scenario: ScenarioId = 'arena'): GameState {
  const s: GameState = {
    version: 1, scenario, width: RULES.width, height: RULES.height, walls: [], phase: 'defense', beat: 0, actions: 0,
    player: { x: 5, y: 4, hp: RULES.hp, maxHp: RULES.hp }, enemies: [], charge: 0, budget: 0, fresh: [], stale: [], reserve: 0,
    nextSoulId: 1, kills: 0, wounds: 0, log: ['Defend to erode Guard and build charge. Activate at 4 or more to freeze time.'],
  };
  if (scenario === 'combo') {
    s.player = { x: 3, y: 4, hp: 3, maxHp: RULES.hp }; s.charge = 8;
    s.enemies = [makeEnemy('A', 'swordsman', 5, 4, 2), makeEnemy('B', 'swordsman', 5, 6, 2), makeEnemy('C', 'gunner', 7, 6, 5), makeEnemy('D', 'warden', 7, 4, 9)];
    s.log = ['Coordinated fixture: Activate → Lunge A → Bell at C → Lunge B → Lunge C.'];
    return s;
  }
  if (scenario === 'emergency') {
    s.player = { x: 4, y: 4, hp: 1, maxHp: RULES.hp }; s.charge = 4;
    s.enemies = [makeEnemy('W', 'warden', 5, 4, 2), makeEnemy('G', 'gunner', 4, 1)];
    s.log = ['One heart left. Activate to interrupt the crowd, wound the warden, then Traverse west.'];
  } else if (scenario === 'lone') {
    s.enemies = [makeEnemy('S', 'swordsman', 5, 3)];
    s.log = ['One swordsman. Turn Aside builds charge and removes 4 Guard; the enemy recovers between attacks.'];
  } else if (scenario === 'corner') {
    s.player.x = 1; s.player.y = 1;
    s.enemies = [makeEnemy('E1', 'swordsman', 2, 1), makeEnemy('E2', 'swordsman', 1, 2), makeEnemy('E3', 'charger', 4, 4), makeEnemy('E4', 'charger', 8, 6), makeEnemy('E5', 'gunner', 6, 1), makeEnemy('E6', 'warden', 6, 5)];
    s.log = ['Corner fixture. Vault over an adjacent swordsman to escape the overlapping tells.'];
  } else {
    s.enemies = [makeEnemy('E1', 'swordsman', 3, 3), makeEnemy('E2', 'swordsman', 7, 5), makeEnemy('E3', 'charger', 5, 1), makeEnemy('E4', 'charger', 9, 4), makeEnemy('E5', 'gunner', 1, 4), makeEnemy('E6', 'warden', 6, 6)];
    if (scenario === 'pillars') {
      s.walls = [{ x: 4, y: 3 }, { x: 6, y: 3 }, { x: 4, y: 5 }, { x: 6, y: 5 }];
      s.log = ['Pillar fixture. Walls block firing lanes and spell sight. Diagonal movement cannot squeeze between two blocked cells.'];
    }
  }
  for (const e of s.enemies) e.intent = attackIntent(s, e);
  return s;
}
