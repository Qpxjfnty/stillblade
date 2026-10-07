import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyCommand, preview, legalCommands } from '../src/engine';
import type { Command, Enemy, GameState, Intent, Pos } from '../src/model';

const p = (x: number, y: number): Pos => ({ x, y });
const intent = (cells: Pos[], parryable = true, damage = 1, direction = p(1, 0)): Intent => ({ cells, parryable, damage, direction });
const enemy = (id: string, x: number, y: number, extra: Partial<Enemy> = {}): Enemy => ({
  id, x, y, kind: 'swordsman', hp: 1, maxHp: 1, guard: 10, maxGuard: 10, exposure: 0, protected: false, intent: null, ...extra,
});
function fixture(enemies: Enemy[], extra: Partial<GameState> = {}): GameState {
  return { ...createGame(), player: { ...p(4, 4), hp: 4, maxHp: 4 }, enemies, charge: 0, budget: 0, fresh: [], stale: [], reserve: 0, walls: [], ...extra };
}
function act(state: GameState, command: Command): GameState {
  const result = applyCommand(state, command);
  assert.equal(result.ok, true, `${JSON.stringify(command)}: ${result.error}`);
  return result.state;
}
function reject(state: GameState, command: Command): void {
  const before = structuredClone(state);
  const result = applyCommand(state, command);
  assert.equal(result.ok, false, `Unexpected legal command: ${JSON.stringify(command)}`);
  assert.deepEqual(state, before, 'Rejected command mutated its input');
  assert.deepEqual(result.state, before, 'Rejected command changed state');
}
const at = (state: GameState, id: string) => { const found = state.enemies.find(e => e.id === id); assert.ok(found, `Missing ${id}`); return found; };

test('default arena is the specified six-enemy, four-heart opening', () => {
  const state = createGame();
  assert.deepEqual([state.width, state.height, state.player.x, state.player.y, state.player.hp, state.charge], [9, 7, 5, 4, 4, 0]);
  assert.equal(state.enemies.length, 6);
  assert.deepEqual(state.enemies.map(e => `${e.kind}:${e.x},${e.y}`).sort(), ['swordsman:3,3', 'swordsman:7,5', 'charger:5,1', 'charger:9,4', 'gunner:1,4', 'warden:6,6'].sort());
  assert.equal(state.enemies.filter(e => e.intent).length, 2);
  assert.ok(state.enemies.filter(e => e.intent).every(e => e.kind === 'charger' || e.kind === 'gunner'));
});

test('coordinated fixture conserves charge, refunds, souls and the six-cell route', () => {
  let state = createGame('combo');
  const startBeat = state.beat;
  state = act(state, { kind: 'activate' });
  assert.deepEqual([state.phase, state.charge, state.budget, at(state, 'A').guard, at(state, 'B').guard, at(state, 'C').guard, at(state, 'D').guard], ['attack', 0, 8, 0, 0, 3, 7]);
  state = act(state, { kind: 'lunge', target: 'A' });
  assert.deepEqual([state.player.x, state.player.y, state.budget, state.fresh.length], [5, 4, 6, 1]);
  state = act(state, { kind: 'bell', to: p(7, 6), payment: { fresh: [state.fresh[0].id], reserve: 0 } });
  assert.deepEqual([at(state, 'C').guard, at(state, 'C').exposure, state.budget, state.fresh.length], [0, 2, 6, 0]);
  state = act(state, { kind: 'lunge', target: 'B' });
  assert.deepEqual([state.player.x, state.player.y, state.budget, state.fresh.length], [5, 6, 4, 1]);
  state = act(state, { kind: 'lunge', target: 'C' });
  assert.deepEqual([state.player.x, state.player.y, state.budget, state.fresh.length, state.kills], [7, 6, 2, 2, 3]);
  state = act(state, { kind: 'end' });
  assert.deepEqual([state.phase, state.beat, state.budget, state.charge, state.reserve, state.fresh.length], ['defense', startBeat, 0, 0, 1, 0]);
  assert.deepEqual(state.stale.map(s => p(s.x, s.y)), [p(5, 6)]);
  assert.deepEqual([at(state, 'D').x, at(state, 'D').y, at(state, 'D').guard, at(state, 'D').hp, at(state, 'D').intent], [7, 4, 7, 2, null]);
});

test('emergency activation cancels damage, wounds once and escapes without advancing time', () => {
  let state = createGame('emergency');
  const w = state.enemies.find(e => e.kind === 'warden')!;
  const before = structuredClone(state);
  state = act(state, { kind: 'activate' });
  assert.ok(state.enemies.every(e => e.intent === null));
  state = act(state, { kind: 'lunge', target: w.id });
  assert.deepEqual([state.player.x, state.player.y, state.player.hp, state.budget], [4, 4, 1, 2]);
  assert.deepEqual([at(state, w.id).hp, at(state, w.id).guard, at(state, w.id).protected], [1, 15, true]);
  reject(state, { kind: 'break', target: w.id });
  state = act(state, { kind: 'traverse', to: p(2, 4) });
  state = act(state, { kind: 'end' });
  assert.deepEqual([state.beat, state.player.hp, state.budget, state.fresh.length], [before.beat, 1, 0, 0]);
  assert.equal(at(state, w.id).protected, false);
  assert.deepEqual(p(at(state, w.id).x, at(state, w.id).y), p(w.x, w.y));
});

test('preview, application and legal enumeration are pure and agree across scenarios', () => {
  for (const scenario of ['arena', 'combo', 'emergency', 'lone', 'pillars', 'corner'] as const) {
    for (const state of [createGame(scenario), fixture([enemy('S', 5, 4, { guard: 0, exposure: 2 }), enemy('W', 8, 6)], { phase: 'attack', budget: 5 })]) {
      const before = structuredClone(state);
      const legal = legalCommands(state);
      assert.ok(legal.length > 0);
      assert.deepEqual(state, before, 'Enumeration mutated state');
      for (const cmd of legal) {
        const predicted = preview(state, cmd);
        const actual = applyCommand(state, cmd);
        assert.equal(actual.ok, true, `Enumerator returned illegal ${JSON.stringify(cmd)}`);
        assert.deepEqual(predicted, actual);
        assert.deepEqual(state, before, `${cmd.kind} mutated its input`);
      }
    }
  }
});

test('new breach keeps two decisions, does not spill into HP, then regenerates only on expiry', () => {
  let state = fixture([enemy('S', 5, 4, { guard: 2, intent: intent([p(4, 4)]) })]);
  state = act(state, { kind: 'harrier', target: 'S' });
  assert.deepEqual([state.player.hp, at(state, 'S').guard, at(state, 'S').exposure, at(state, 'S').hp, state.charge], [4, 0, 2, 1, 0]);
  state = act(state, { kind: 'wait' });
  assert.deepEqual([at(state, 'S').guard, at(state, 'S').exposure, state.player.hp], [0, 1, 4]);
  state = act(state, { kind: 'wait' });
  assert.deepEqual([at(state, 'S').guard, at(state, 'S').exposure, state.player.hp], [10, 0, 4]);
  assert.ok(at(state, 'S').intent, 'Expiry may publish a new tell but cannot execute it');
});

test('positive Guard passively recovers only on beats without actual Guard damage', () => {
  let state = fixture([enemy('A', 8, 7, { guard: 6 }), enemy('B', 6, 4, { guard: 8 })]);
  state = act(state, { kind: 'harrier', target: 'B' });
  assert.deepEqual([at(state, 'A').guard, at(state, 'B').guard], [7, 5]);
  state = act(state, { kind: 'wait' });
  assert.deepEqual([at(state, 'A').guard, at(state, 'B').guard], [8, 6]);
});

test('frozen actions suspend exposure, recovery and defensive charge; pulse does not refresh breach', () => {
  let state = fixture([enemy('A', 7, 4, { guard: 0, exposure: 1 }), enemy('B', 8, 7, { guard: 6 })], { charge: 7 });
  state = act(state, { kind: 'activate' });
  state = act(state, { kind: 'traverse', to: p(3, 4) });
  state = act(state, { kind: 'traverse', to: p(4, 4) });
  assert.deepEqual([state.beat, at(state, 'A').exposure, at(state, 'B').guard, state.charge], [0, 1, 4, 0]);
  state = act(state, { kind: 'end' });
  assert.deepEqual([at(state, 'A').exposure, at(state, 'B').guard], [1, 4]);
});

test('a step-parry can earn 2 charge plus one shared evade charge', () => {
  let state = fixture([
    enemy('S', 5, 3, { intent: intent([p(4, 3)]) }),
    enemy('G', 1, 4, { kind: 'gunner', intent: intent([2, 3, 4, 5, 6].map(x => p(x, 4)), false) }),
  ]);
  state = act(state, { kind: 'parry', target: 'S', to: p(4, 3) });
  assert.deepEqual([state.charge, state.player.hp, at(state, 'S').guard, at(state, 'G').guard], [3, 4, 6, 8]);
});

test('several genuine evades each damage Guard but share one charge, capped at 12', () => {
  let state = fixture([
    enemy('A', 3, 4, { intent: intent([p(4, 4)]) }),
    enemy('B', 5, 4, { intent: intent([p(4, 4)]) }),
  ], { charge: 12 });
  state = act(state, { kind: 'slip', to: p(4, 2) });
  assert.deepEqual([state.charge, at(state, 'A').guard, at(state, 'B').guard], [12, 8, 8]);
});

test('a canceled attack pays no evade reward and no old tell returns after attack exit', () => {
  let state = fixture([enemy('S', 5, 4, { guard: 2, intent: intent([p(4, 4)]) })], { charge: 4 });
  state = act(state, { kind: 'activate' });
  state = act(state, { kind: 'traverse', to: p(2, 4) });
  state = act(state, { kind: 'end' });
  assert.deepEqual([state.charge, at(state, 'S').intent, at(state, 'S').exposure], [0, null, 2]);
  state = act(state, { kind: 'wait' });
  assert.equal(state.player.hp, 4);
  assert.equal(state.charge, 0);
});

test('gunfire first-body friendly fire can breach and cancel a later committed charger', () => {
  let state = fixture([
    enemy('G', 1, 4, { kind: 'gunner', intent: intent([2, 3, 4, 5, 6].map(x => p(x, 4)), false) }),
    enemy('C', 3, 4, { kind: 'charger', guard: 4, intent: intent([4, 5, 6].map(x => p(x, 4))) }),
  ]);
  state = act(state, { kind: 'wait' });
  assert.deepEqual([state.player.hp, at(state, 'C').guard, at(state, 'C').exposure, at(state, 'C').x, at(state, 'C').intent], [4, 0, 2, 3, null]);
});

test('charger enemy collision applies recipient and self Guard damage without HP spill', () => {
  let state = fixture([
    enemy('C', 1, 4, { kind: 'charger', intent: intent([2, 3, 4].map(x => p(x, 4))) }),
    enemy('S', 3, 4, { guard: 2 }),
  ]);
  state = act(state, { kind: 'wait' });
  assert.deepEqual([at(state, 'C').x, at(state, 'C').guard, at(state, 'S').guard, at(state, 'S').hp, state.player.hp], [2, 8, 0, 1, 4]);
});

test('fatal damage stops all later enemy attacks and rewards immediately', () => {
  let state = fixture([
    enemy('G', 1, 4, { kind: 'gunner', intent: intent([2, 3, 4, 5, 6].map(x => p(x, 4)), false) }),
    enemy('C', 6, 4, { kind: 'charger', intent: intent([p(5, 4), p(4, 4), p(3, 4)], true, 1, p(-1, 0)) }),
  ], { player: { ...p(4, 4), hp: 1, maxHp: 4 } });
  state = act(state, { kind: 'wait' });
  assert.deepEqual([state.phase, state.player.hp, at(state, 'C').x, state.charge], ['defeat', 0, 6, 0]);
  reject(state, { kind: 'activate' });
});

test('invalid geometry is atomic and diagonal squeezing needs two blocked sides', () => {
  const state = fixture([enemy('S', 8, 7)], { walls: [p(5, 4), p(4, 5)] });
  reject(state, { kind: 'slip', to: p(5, 5) });
  reject(state, { kind: 'slip', to: p(7, 4) });
  reject(state, { kind: 'slip', to: p(0, 4) });
  const oneSide = { ...state, walls: [p(5, 4)] };
  const moved = act(oneSide, { kind: 'slip', to: p(5, 5) });
  assert.deepEqual(p(moved.player.x, moved.player.y), p(5, 5));
});

test('body obstruction blocks gun attacks and lunges, while traverse vault crosses one body', () => {
  const state = fixture([enemy('A', 5, 4), enemy('B', 7, 4, { guard: 0, exposure: 2 })], { phase: 'attack', budget: 5 });
  reject(state, { kind: 'shot', target: 'B' });
  reject(state, { kind: 'lunge', target: 'B' });
  const moved = act(state, { kind: 'traverse', to: p(6, 4) });
  assert.deepEqual([moved.player.x, moved.player.y, moved.budget], [6, 4, 4]);
});

test('protected survivor remains an obstacle and is excluded from every offensive source', () => {
  let state = fixture([enemy('W', 5, 4, { kind: 'warden', hp: 2, maxHp: 2, maxGuard: 15, guard: 0, exposure: 2 }), enemy('S', 6, 5)], { phase: 'attack', budget: 10, reserve: 9 });
  state = act(state, { kind: 'lunge', target: 'W' });
  assert.deepEqual([at(state, 'W').hp, at(state, 'W').guard, at(state, 'W').protected, state.budget], [1, 15, true, 8]);
  for (const kind of ['lunge', 'shot', 'break', 'lance'] as const) reject(state, { kind, target: 'W' });
  reject(state, { kind: 'sweep', targets: ['W'] });
  state = act(state, { kind: 'bell', to: p(5, 4), payment: { fresh: [], reserve: 3 } });
  assert.deepEqual([at(state, 'W').guard, at(state, 'S').guard, state.budget, state.reserve], [15, 7, 8, 6]);
  state = act(state, { kind: 'traverse', to: p(6, 4) });
  assert.equal(state.player.x, 6);
});

test('sweep pays full cost before its batch of wounds and refunds', () => {
  const enemies = [enemy('A', 3, 3, { guard: 0, exposure: 2 }), enemy('B', 4, 3, { guard: 0, exposure: 2 }), enemy('C', 5, 3, { guard: 0, exposure: 2 }), enemy('D', 8, 7)];
  const state = fixture(enemies, { phase: 'attack', budget: 5 });
  reject({ ...state, budget: 4 }, { kind: 'sweep', targets: ['A', 'B', 'C'] });
  const result = act(state, { kind: 'sweep', targets: ['A', 'B', 'C'] });
  assert.deepEqual([result.budget, result.fresh.length, result.kills, result.enemies.length], [3, 3, 3, 1]);
});

test('explicit fresh/reserve payment preserves token choice, and invalid payment spends nothing', () => {
  const state = fixture([enemy('S', 6, 4, { guard: 0, exposure: 2 }), enemy('W', 8, 7)], { phase: 'attack', budget: 0, reserve: 6, fresh: [{ id: 'old', ...p(1, 1) }, { id: 'new', ...p(2, 2) }] });
  reject(state, { kind: 'lance', target: 'S', payment: { fresh: ['old', 'old'], reserve: 0 } });
  reject(state, { kind: 'lance', target: 'S', payment: { fresh: ['missing'], reserve: 3 } });
  reject(state, { kind: 'lance', target: 'S', payment: { fresh: ['old'], reserve: 2 } });
  const result = act(state, { kind: 'lance', target: 'S', payment: { fresh: ['new'], reserve: 3 } });
  assert.deepEqual([result.budget, result.charge, result.reserve, result.fresh.length, result.kills], [1, 0, 3, 2, 1]);
  assert.ok(result.fresh.some(s => s.id === 'old'));
  assert.ok(!result.fresh.some(s => s.id === 'new'));
});

test('zero budget permits finite soul spells and always offers an explicit exit', () => {
  const state = fixture([enemy('S', 5, 4, { guard: 0, exposure: 2 }), enemy('W', 8, 7)], { phase: 'attack', budget: 0, fresh: [{ id: 'a', ...p(1, 1) }, { id: 'b', ...p(2, 2) }] });
  assert.ok(legalCommands(state).some(c => c.kind === 'lance'));
  assert.ok(legalCommands(state).some(c => c.kind === 'end'));
  const result = act(state, { kind: 'lance', target: 'S' });
  assert.deepEqual([result.phase, result.budget, result.fresh.length], ['attack', 1, 1]);
  const bare = { ...state, fresh: [] };
  assert.ok(legalCommands(bare).some(c => c.kind === 'end'));
  assert.equal(act(bare, { kind: 'end' }).phase, 'defense');
});

test('stale collection follows ordinary movement paths but teleport takes only destination', () => {
  const stale = [{ id: 'a', ...p(5, 4) }, { id: 'b', ...p(6, 4) }];
  const state = fixture([enemy('S', 8, 7)], { phase: 'attack', budget: 2, stale });
  const moved = act(state, { kind: 'traverse', to: p(6, 4) });
  assert.deepEqual([moved.reserve, moved.stale.length], [2, 0]);
  const teleported = act({ ...state, reserve: 3 }, { kind: 'thread', to: p(6, 4), payment: { fresh: [], reserve: 3 } });
  assert.deepEqual([teleported.reserve, teleported.stale.map(s => s.id)], [1, ['a']]);
  const capped = act({ ...state, reserve: 9 }, { kind: 'traverse', to: p(6, 4) });
  assert.deepEqual([capped.reserve, capped.stale.length], [9, 2]);
});

test('spell walls block visibility and defensive spell costs are validated before the beat', () => {
  const state = fixture([enemy('S', 6, 4)], { reserve: 6, walls: [p(5, 4)] });
  reject(state, { kind: 'thread', to: p(6, 4), payment: { fresh: [], reserve: 3 } });
  reject(state, { kind: 'bell', to: p(6, 4), payment: { fresh: [], reserve: 3 } });
  reject({ ...state, reserve: 2 }, { kind: 'thread', to: p(3, 4) });
  const moved = act(state, { kind: 'thread', to: p(3, 4), payment: { fresh: [], reserve: 3 } });
  assert.deepEqual([moved.beat, moved.reserve, moved.charge], [1, 3, 0]);
});

test('final kill applies its wound then expires souls, auto-collects and caps reserve', () => {
  let state = fixture([enemy('S', 5, 4, { guard: 0, exposure: 2 })], { phase: 'attack', budget: 3, reserve: 8, fresh: [{ id: 'a', ...p(1, 1) }], stale: [{ id: 'b', ...p(2, 2) }] });
  state = act(state, { kind: 'lunge', target: 'S' });
  assert.deepEqual([state.phase, state.player.x, state.enemies.length, state.kills, state.wounds, state.reserve, state.fresh.length, state.stale.length], ['victory', 5, 0, 1, 1, 9, 0, 0]);
  reject(state, { kind: 'wait' });
});

test('the default arena has a repeatable mobile victory with all four hearts', () => {
  const replay = JSON.parse(readFileSync(new URL('./fixtures/winning-replay.json', import.meta.url), 'utf8'));
  const commands = replay.commands as Command[];
  let state = createGame();
  for (const command of commands) {
    const expected = preview(state, command);
    state = act(state, command);
    assert.deepEqual(state, expected.state);
  }
  assert.deepEqual([state.phase, state.beat, state.actions, state.player.hp, state.kills, state.wounds], [replay.expected.phase, replay.expected.beats, replay.expected.actions, 4, 6, 7]);
});

test('reachable state walks preserve health, resource, occupancy and frozen-time invariants', () => {
  let seed = 0x147f;
  const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (const scenario of ['arena', 'pillars', 'corner', 'combo'] as const) for (let run = 0; run < 3; run++) {
    let state = createGame(scenario);
    for (let n = 0; n < 24 && !['victory', 'defeat'].includes(state.phase); n++) {
      const commands = legalCommands(state);
      assert.ok(commands.length);
      const command = commands[random(commands.length)];
      const before = state;
      state = act(state, command);
      const positions = [state.player, ...state.enemies].map(e => `${e.x},${e.y}`);
      assert.equal(new Set(positions).size, positions.length, 'Living actors overlap');
      assert.ok([state.charge, state.budget, state.reserve, state.player.hp].every(n => Number.isInteger(n) && n >= 0));
      assert.ok(state.charge <= 12 && state.reserve <= 9 && state.player.hp <= 4);
      for (const e of state.enemies) {
        assert.ok(e.hp > 0 && e.hp <= e.maxHp && e.guard >= 0 && e.guard <= e.maxGuard);
        assert.equal(e.guard === 0, e.exposure > 0, 'Guard and exposure disagree');
        assert.ok(!e.protected || state.phase === 'attack');
        assert.ok(!e.exposure || !e.intent, 'Breached enemy threatens a cell');
        assert.ok(e.x >= 1 && e.x <= state.width && e.y >= 1 && e.y <= state.height);
        assert.ok(!state.walls.some(w => w.x === e.x && w.y === e.y));
      }
      if (before.phase === 'attack') assert.equal(state.beat, before.beat, 'Frozen action advanced defensive time');
      if (state.phase === 'attack') assert.equal(state.charge, 0);
      if (state.phase !== 'attack') assert.equal(state.fresh.length, 0);
    }
  }
});

test('a gunner lane already blocked before the starting cell pays no evade reward', () => {
  let state = fixture([
    enemy('G', 1, 4, { kind: 'gunner', intent: intent([2, 3, 4, 5, 6].map(x => p(x, 4)), false) }),
    enemy('S', 3, 4),
  ]);
  state = act(state, { kind: 'slip', to: p(4, 3) });
  assert.deepEqual([state.player.hp, state.charge, at(state, 'G').guard, at(state, 'S').guard], [4, 0, 10, 6]);
});

test('a charger blocked before the starting cell pays collision damage but no evade reward', () => {
  let state = fixture([
    enemy('C', 1, 4, { kind: 'charger', intent: intent([2, 3, 4].map(x => p(x, 4))) }),
    enemy('S', 3, 4),
  ]);
  state = act(state, { kind: 'slip', to: p(4, 3) });
  assert.deepEqual([state.player.hp, state.charge, at(state, 'C').guard, at(state, 'S').guard], [4, 0, 8, 6]);
});

test('a charger collision beyond the vacated starting cell still earns a genuine evade', () => {
  let state = fixture([
    enemy('C', 1, 4, { kind: 'charger', intent: intent([2, 3, 4].map(x => p(x, 4))) }),
    enemy('S', 4, 4),
  ], { player: { ...p(2, 4), hp: 4, maxHp: 4 } });
  state = act(state, { kind: 'slip', to: p(2, 3) });
  assert.deepEqual([state.player.hp, state.charge, at(state, 'C').guard, at(state, 'S').guard], [4, 1, 6, 6]);
});

test('all five additional laboratory scenarios have complete repeatable victories', () => {
  for (const scenario of ['lone', 'pillars', 'corner', 'combo', 'emergency'] as const) {
    const replay = JSON.parse(readFileSync(new URL(`./fixtures/${scenario}-winning-replay.json`, import.meta.url), 'utf8'));
    let state = createGame(scenario);
    const startingHp = state.player.hp;
    for (const command of replay.commands as Command[]) {
      const expected = preview(state, command);
      state = act(state, command);
      assert.deepEqual(state, expected.state);
    }
    assert.deepEqual(
      { phase: state.phase, beats: state.beat, actions: state.actions, hp: state.player.hp, kills: state.kills, wounds: state.wounds },
      replay.expected,
      `${scenario} replay result diverged`,
    );
    assert.equal(state.player.hp, startingHp, `${scenario} has a damage-free witness`);
  }
});
