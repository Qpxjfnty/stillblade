/** Bounded, deterministic playability witness finder. A failure is not proof of unwinnability. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, applyCommand, legalCommands } from '../src/engine';
import type { Command, GameState, ScenarioId } from '../src/model';

interface Node { state: GameState; parent?: Node; command?: Command; depth: number; score: number; }
const scenario = (process.argv[2] || 'arena') as ScenarioId;
const beamWidth = Number(process.argv[3] || 140);
const maxDepth = Number(process.argv[4] || 100);
const constraint = process.argv[5] || 'none';
if (!['none', 'stationary', 'no-souls'].includes(constraint)) throw new Error('Unknown search constraint');
const started = Date.now();
let examined = 0;
const signature = (s: GameState): string => JSON.stringify({
  phase: s.phase, player: s.player, charge: s.charge, budget: s.budget, reserve: s.reserve,
  enemies: s.enemies, fresh: s.fresh.map(({ x, y }) => [x, y]), stale: s.stale.map(({ x, y }) => [x, y]),
});
const score = (s: GameState, depth: number): number => {
  if (s.phase === 'victory') return 1e9 + s.player.hp * 100 - depth;
  const weakened = s.enemies.reduce((v, e) => v + (e.maxGuard - e.guard) * 3 + (e.exposure ? 12 : 0), 0);
  const exposedInReach = s.enemies.reduce((v, e) => v + (e.exposure && Math.max(Math.abs(e.x - s.player.x), Math.abs(e.y - s.player.y)) <= 3 ? 4 : 0), 0);
  return s.kills * 700 + s.wounds * 700 + s.player.hp * 100 + s.charge * 8 + s.budget * 8 + s.reserve * 2 + s.fresh.length * 14 + weakened + exposedInReach - depth * 1.4 - s.beat * 0.6;
};
const initial = createGame(scenario);
let beam: Node[] = [{ state: initial, depth: 0, score: score(initial, 0) }];
const seen = new Set<string>([signature(initial)]);
let best = beam[0];
let winner: Node | undefined;
for (let depth = 1; depth <= maxDepth && beam.length && !winner; depth++) {
  const candidates: Node[] = [];
  for (const parent of beam) {
    for (const command of legalCommands(parent.state)) {
      if (constraint === 'no-souls' && ['bell', 'thread', 'lance'].includes(command.kind)) continue;
      const result = applyCommand(parent.state, command);
      examined++;
      if (!result.ok) throw new Error(`Illegal enumerated command ${JSON.stringify(command)}: ${result.error}`);
      if (result.state.phase === 'defeat') continue;
      if (constraint === 'stationary' && (result.state.player.x !== initial.player.x || result.state.player.y !== initial.player.y)) continue;
      const key = signature(result.state);
      if (seen.has(key)) continue;
      seen.add(key);
      const node: Node = { state: result.state, parent, command, depth, score: score(result.state, depth) };
      if (node.score > best.score) best = node;
      if (node.state.phase === 'victory') { winner = node; break; }
      candidates.push(node);
    }
    if (winner) break;
  }
  candidates.sort((a, b) => b.score - a.score);
  // Retain some per-phase diversity so attractive preparation cannot erase all finishing routes.
  const quota = Math.max(10, Math.floor(beamWidth / 4));
  const attack = candidates.filter(n => n.state.phase === 'attack').slice(0, quota);
  const defense = candidates.filter(n => n.state.phase === 'defense').slice(0, quota);
  const selected = new Set([...attack, ...defense]);
  for (const node of candidates) { if (selected.size >= beamWidth) break; selected.add(node); }
  beam = [...selected];
  if (depth % 5 === 0 || winner || !beam.length) {
    process.stdout.write(`${scenario} depth ${depth}; ${examined} resolutions; best ${best.state.kills} kills/${best.state.wounds} wounds, ${best.state.player.hp} HP, ${best.state.phase}, charge ${best.state.charge}, budget ${best.state.budget}; ${Math.round((Date.now() - started)/1000)}s\n`);
  }
}
const leaf = winner || best;
const commands: Command[] = [];
for (let n: Node | undefined = leaf; n?.parent; n = n.parent) commands.unshift(n.command!);
let replay = createGame(scenario);
const frames = [{ command: null as Command | null, state: replay }];
for (const command of commands) {
  const result = applyCommand(replay, command);
  if (!result.ok) throw new Error(`Replay failed ${result.error}`);
  replay = result.state;
  frames.push({ command, state: replay });
}
if (signature(replay) !== signature(leaf.state)) throw new Error('Replay diverged');
const report = {
  scenario, constraint, victory: Boolean(winner), search: { beamWidth, maxDepth, examined, uniqueStates: seen.size, elapsedMs: Date.now() - started },
  actions: commands.length, beats: replay.beat, hp: replay.player.hp, kills: replay.kills, wounds: replay.wounds,
  actionKinds: Object.fromEntries([...new Set(commands.map(c => c.kind))].map(kind => [kind, commands.filter(c => c.kind === kind).length])),
  limitations: 'A deterministic beam-search witness, not optimality, balance, fun, human usability, or exhaustive exploit proof.', commands, frames,
};
mkdirSync('work/qa', { recursive: true });
const output = `work/qa/${scenario}${constraint === 'none' ? '' : `-${constraint}`}-${winner ? 'win' : 'search'}.json`;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report, commands: undefined, frames: undefined }, null, 2));
process.exitCode = winner ? 0 : 2;
