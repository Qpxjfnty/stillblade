export type Pos = { x: number; y: number };
export type EnemyKind = 'swordsman' | 'charger' | 'gunner' | 'warden';
export type Phase = 'defense' | 'attack' | 'victory' | 'defeat';
export type ScenarioId = 'arena' | 'combo' | 'emergency' | 'lone' | 'pillars' | 'corner';
export type ActionKind = 'slip' | 'parry' | 'vault' | 'light' | 'harrier' | 'wait' | 'activate' | 'lunge' | 'shot' | 'sweep' | 'break' | 'traverse' | 'bell' | 'thread' | 'lance' | 'end';
export interface Intent { cells: Pos[]; direction: Pos; damage: number; parryable: boolean; }
export interface Enemy extends Pos { id: string; kind: EnemyKind; hp: number; maxHp: number; guard: number; maxGuard: number; exposure: number; protected: boolean; intent: Intent | null; }
export interface Soul extends Pos { id: string; }
export interface Command { kind: ActionKind; to?: Pos; target?: string; targets?: string[]; payment?: { fresh: string[]; reserve: number }; }
export interface CombatEvent { kind: 'move' | 'guard' | 'breach' | 'wound' | 'kill' | 'hurt' | 'charge' | 'soul' | 'phase' | 'info'; text: string; at?: Pos; from?: Pos; }
export interface GameState {
  version: 1; scenario: ScenarioId; width: number; height: number; walls: Pos[];
  phase: Phase; beat: number; actions: number; player: Pos & { hp: number; maxHp: number };
  enemies: Enemy[]; charge: number; budget: number; fresh: Soul[]; stale: Soul[]; reserve: number;
  nextSoulId: number; kills: number; wounds: number; log: string[];
}
export interface Resolution { ok: boolean; error?: string; state: GameState; events: CombatEvent[]; }
export const RULES = { width: 9, height: 7, hp: 4, threshold: 4, chargeCap: 12, regen: 1, pulse: 2, exposure: 2, reserveCap: 9 } as const;
export const SCENARIOS: { id: ScenarioId; name: string; description: string }[] = [
  { id: 'arena', name: 'The crucible', description: 'Six enemies. Build charge through defense, then cut through the crowd.' },
  { id: 'combo', name: 'The perfect opening', description: 'Start with 8 charge. Activate, lunge, then use a fresh soul to breach another enemy.' },
  { id: 'emergency', name: 'One heart left', description: 'A heavy sweep is coming. Spend your 4 charge to interrupt it and escape.' },
  { id: 'lone', name: 'The last swordsman', description: 'Practice parrying, Guard recovery and finishing an isolated enemy.' },
  { id: 'pillars', name: 'Broken columns', description: 'Opaque pillars change paths and firing lanes.' },
  { id: 'corner', name: 'Back to the wall', description: 'Practice escaping a cramped opening with movement and vaults.' },
];
export const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const distance = (a: Pos, b: Pos) => Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y));
export const key = (p: Pos) => `${p.x},${p.y}`;
export const DIRECTIONS: Pos[] = [{x:0,y:-1},{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1}];
