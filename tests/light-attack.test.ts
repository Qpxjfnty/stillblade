import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, commandLabel, createGame, legalCommands, preview } from '../src/engine';
import type { Command, GameState } from '../src/model';

const command: Command = { kind: 'light', target: 'S' };
function reject(state: GameState, invalid: Command = command): void {
  const before = structuredClone(state), result = applyCommand(state, invalid);
  assert.equal(result.ok, false);
  assert.deepEqual(result.state, before);
  assert.deepEqual(state, before, 'Invalid Light Attack mutated its input');
}

test('Light Attack removes 4 Guard, allows retaliation, and earns no charge', () => {
  const state = createGame('lone'), before = structuredClone(state);
  assert.ok(legalCommands(state).some(c => c.kind === 'light' && c.target === 'S'));
  assert.equal(commandLabel(command), 'Light Attack S');
  const expected = preview(state, command), result = applyCommand(state, command);
  assert.equal(result.ok, true);
  assert.deepEqual(result, expected);
  assert.deepEqual(state, before, 'Valid Light Attack mutated its input');
  assert.deepEqual(
    [result.state.enemies[0].guard, result.state.enemies[0].hp, result.state.player.hp, result.state.charge, result.state.beat, result.state.actions],
    [6, 1, 3, 0, 1, 1],
    'Actual Guard damage suppresses regeneration, but does not cancel an unbreached attack',
  );
});

test('Light Attack breach interrupts its target, retains the full stun and allows other attacks', () => {
  const state = createGame('lone');
  state.enemies[0].guard = 3;
  state.enemies.push({ ...structuredClone(state.enemies[0]), id: 'OTHER', x: 6, y: 4, guard: 10 });
  const result = applyCommand(state, command);
  assert.equal(result.ok, true);
  const target = result.state.enemies.find(e => e.id === 'S')!;
  assert.deepEqual([target.guard, target.exposure, target.hp, target.intent], [0, 2, 1, null]);
  assert.deepEqual([result.state.player.hp, result.state.charge, result.state.beat], [3, 0, 1]);
  assert.ok(result.events.some(event => event.kind === 'breach'));
  reject(result.state);
});

test('Light Attack rejects unavailable targets, blocked sight, distance and the attack phase atomically', () => {
  reject(createGame('lone'), { kind: 'light' });
  reject(createGame('lone'), { kind: 'light', target: 'missing' });
  const distant = createGame('lone'); distant.enemies[0].y = 2; reject(distant);
  const exposed = createGame('lone'); exposed.enemies[0].guard = 0; exposed.enemies[0].exposure = 2; reject(exposed);
  const protectedState = createGame('lone'); protectedState.enemies[0].protected = true; reject(protectedState);
  const blocked = createGame('lone'); blocked.enemies[0].x = 6;
  blocked.walls = [{ x: 5, y: 3 }, { x: 6, y: 4 }]; reject(blocked);
  const frozen = createGame('lone'); frozen.phase = 'attack'; frozen.budget = 8; reject(frozen);
  for (const state of [distant, exposed, protectedState, blocked, frozen]) {
    assert.ok(!legalCommands(state).some(c => c.kind === 'light'), 'Unavailable Light Attack was enumerated');
  }
});
