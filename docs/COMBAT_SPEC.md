# Stillblade combat specification

Implementation baseline from Combat System and Bad Ideas Research v0.1. Values are playtest hypotheses.

## Combat System and Bad Ideas Research

Defensive arena combat with guard breaches and frozen attack turns

Version 0.1  |  6 October 2026  |  Prototype specification

A powerful but vulnerable swordsman survives a small, crowded arena by manipulating enemy attacks. Successful defense erodes regenerating Guard and builds charge. The player spends that charge to interrupt the entire crowd, freeze time and perform a mobile sequence of attacks. Kills create fresh souls that can turn a successful strike into another tactical opportunity.

The defining decision is when to stop preparing and attack. Waiting can produce a larger sequence, but enemies recover Guard and the player remains only a few mistakes from death. An early attack turn is a reliable escape that may squander an underprepared bank of charge.

### How to use this document

Part One defines a complete baseline for a small combat experiment, including timing, actions, enemies, resource accounting and worked encounters. It separates established direction from proposed defaults. Its numerical values are hypotheses for playtesting, not claims of balance.

Part Two deliberately challenges that baseline with 60 ideas arranged into five tiers of increasing apparent badness. Every idea has a literal rule, a likely failure, a reason to investigate it and a bounded experiment. These are alternatives for testing, not additions to the baseline.

### Reading routes

- For the core concept, read Design commitments, Resources and the arena, and Attack turn transitions.
- For implementation, read the complete combat section and both worked examples before using the experiment checklist.
- For exploration, read the five tiers in order, then the shortlist. Higher tiers intentionally violate more of the baseline.

The placeholder setting is fantasy with swords and guns. The intended presentation is Unicode combat with extreme, readable violence. Narrative, campaign progression and permanent upgrades are outside this combat specification.

## Design commitments

### Established direction

- Small arena tactical roguelike combat with a highly mobile player facing several enemies at once.
- Defensive play prepares high impact offense. Immediate outcomes and enemy commitments are visible; there are no reflex tests or hidden hit rolls.
- HP uses a few large units. Enemy Guard uses a separate numerical scale, such as 10 or 15, and represents poise and defensive readiness rather than physical armor.
- Enemy Guard regenerates passively. Reaching zero interrupts and stuns the enemy, exposing HP. One HP hit consumes the opening and restores surviving enemies' Guard.
- At sufficient charge, the player may activate an attack turn at a decision point. Activation cashes in the whole bank, interrupts every enemy, deals minor Guard damage and freezes normal time.
- The player spends the resulting budget on linked attacks. An enemy that takes HP damage becomes untargetable for the remainder of that attack turn.
- Kills during the attack turn create fresh souls for immediate powerful spells. Unused souls lose most of their value, but can be collected into a reserve for later spells.
- Extreme Unicode violence supplies spectacle. Blood, limbs and corpses do not change tactical rules.

### Defaults chosen for the first experiment

Four player HP, a 9 by 7 arena, six enemies, two defensive decisions of exposure, a charge threshold of 4 and a cap of 12 are proposed values. So are the move list, soul exchange rate and refund rule below. They make the design executable without treating earlier suggestions as user decisions.

The optional combo extension is implemented as a one point attack-budget refund per enemy wounded. Kills provide souls rather than an additional charge refund. Pulse breaches receive no extra reward initially; opening several enemies at once is already valuable.

### What success should feel like

A player can explain how their defense prepared a kill sequence, can deliberately relocate through that sequence, and sometimes chooses a smaller attack turn to survive. Completing the setup should produce a genuine period of dominance. We will not restore difficulty by secretly resuming canceled attacks.

## Resources and the arena

Resource | Initial value | Meaning
--- | --- | ---
Player HP | 4 whole pips | Ordinary attacks remove 1; heavy attacks remove 2. Zero is defeat.
Enemy HP | 1 or 2 pips | One decisive wound kills a common enemy; an elite requires two attack turns.
Enemy Guard | 10 or 15 | Numerical defense. No Guard damage spills into HP.
Charge | 0 to 12 | Activate at 4 or more. Earned in defensive time; no passive gain or decay.
Attack budget | Bank at activation | Spent during frozen time. Unspent budget is discarded on exit.
Fresh souls | 1 per kill | Available immediately during that attack turn, regardless of kill location.
Soul reserve | 0 to 9 units | One stale soul gives 1 unit. Three reserve units replace one fresh soul.

### Space and movement

Use a top-down grid with 9 by 7 walkable cells and an impassable outer boundary. The initial roster is two swordsmen, two chargers, a gunner and a warden. Start with an open arena; add pillars in separate test encounters. One living actor occupies a cell. Dead enemies immediately vacate it; gore and soul pickups never block movement.

Movement uses eight directions. A diagonal step can pass one occupied orthogonal side cell, but cannot squeeze between two blocked side cells. Sliding and lunging follow a straight sequence of these steps. Range measured in cells uses Chebyshev distance unless the move specifies a straight ray. Wall and living-body obstruction are shown in the preview.

All actors and their exact resources are visible. HP pips remain visible behind Guard; exposure changes damage eligibility, not information access. No critical-hit chances, accuracy rolls, fog of war or hidden defensive modifiers appear in the baseline. Spell visibility uses a center-to-center grid line: any wall interior crossed blocks sight, and an exact diagonal corner is blocked only when both side cells are walls. Bodies do not block spell sight, but do block projectile rays.

### Health and encounter boundaries

Low HP does not reduce mobility, damage or available defenses. There is no healing during the baseline encounter and no player Guard layer. Each isolated laboratory encounter starts at full HP with no charge or reserve. A later linked-room test can carry HP and reserve, but is not required to establish this combat loop.

## Defensive actions

Each accepted defensive action advances one combat beat. Inspection, aiming, cancellation and invalid actions are free. The player always has a movement option independent of charge. Input time is unlimited.

Action | Rule | Guard and charge
--- | --- | ---
Move | Move 1 or 2 cells along a clear straight ray. | Each committed attack genuinely evaded loses 2 Guard; earn 1 total charge for the beat's evades.
Turn Aside | Stay or step 1 cell, then parry one selected melee tell that would hit the destination and whose attacker is adjacent there. | Cancel that attack, deal 4 Guard to its attacker, earn 2 charge. Other attacks still resolve.
Vault | Cross one adjacent living enemy to the empty cell immediately beyond it. May cross a breached enemy. | Uses the same evade reward as Move. No cooldown in this first experiment.
Light Attack | Strike one adjacent visible enemy with positive Guard. Stay in place; other commitments still resolve. | Deal 4 Guard. No charge and no interrupt unless it breaches.
Harrier Shot | Shoot the first enemy on a clear ray up to 4 cells away. No ammunition resource. | Deal 3 Guard. No charge and no interrupt unless it breaches.
Reserve spell | Cast Bell or Thread with reserve. It occupies the defensive action. | Effects below; a spell creates no charge by itself. Movement can earn the usual evade reward.
Wait | Remain in place and let one beat resolve. | No reward for waiting. May be useful for aligning commitments.

### A real defensive success

An evade qualifies only when a published attack threatened the player's starting cell, the player leaves its committed footprint, and that attack actually resolves without hitting the player. An attack canceled before resolving does not also pay an evade reward. Each qualifying attacker loses Guard once; the player receives at most 1 evade charge, regardless of the number dodged.

Turn Aside can parry one attack while its step evades others. This earns at most 3 charge in a beat: 2 for the parry and 1 for evasion. Parry validation uses the current published tell, not a hypothetical future attack. Gunfire and the warden's heavy sweep cannot be parried.

Taking damage does not erase legitimately earned charge, but may kill the player before the next decision. Defensive Guard damage cannot wound an exposed enemy. This keeps normal time focused on survival and preparation.

## How a defensive beat resolves

The player sees enemy intentions and resolution order before choosing. The same rules must produce both the forecast and the committed outcome. Attacks never acquire a new target secretly during resolution.

- 1. Validate the command and any reserve cost. Record existing breaches and the published intentions. Invalid commands change nothing.
- 2. Apply the player's movement, shot, spell or selected parry. Deduct its cost. Any Guard reaching zero immediately creates a breach and cancels that enemy's intention.
- 3. Resolve remaining published attacks in their displayed order. Apply movement along committed charge paths, first-body collisions, damage and earned defensive rewards. A new breach cancels a later pending attack immediately. On fatal player damage, stop this step at once; no later attacks or rewards resolve.
- 4. If player HP reaches zero, end the encounter immediately. Otherwise decrement only exposure counters that existed at the start of this beat. Newly created breaches retain their full counter.
- 5. Restore expired breaches to full Guard. Other standing enemies regain 1 Guard if they took no actual Guard damage this beat. A restored enemy does not receive an extra point beyond its maximum.
- 6. Eligible idle enemies choose their next movement and tell. Enemies that resolved or had an attack interrupted this beat have spent their opportunity. An enemy restored from an expired breach may publish a fresh tell from its cell, but does not move or attack now.
- 7. Show the updated board, exact charge, new tells and the next decision. Charge is capped at 12.

### Order and targeting

Use gunner, charger, swordsman, then warden order, with displayed enemy number breaking ties. Show these order numbers on the board and forecast. An attack commits to cells, not to a tracking lock on the player. A charger moves along its published ray; bodies may stop it early. Effects on earlier actors can therefore change later outcomes, and the forecast must include that.

An eligible idle enemy first publishes an attack if already in range. Otherwise it takes one legal step toward a reachable attack position and may publish a tell after moving. It never executes a newly published tell in the same beat. Deterministic pathfinding ties use the fixed direction order north, northeast, east, southeast, south, southwest, west, northwest.

This baseline has no reinforcements or changing roster during combat. Enemy movement never grants the player free charge. End-of-phase bookkeeping does not count as a defensive beat.

## Guard and breach timing

Guard represents the ability to fend off a wound: poise, weapon position, balance and readiness. Attacks need not physically damage armor. A fighter at 1 Guard is still protected until that last point is removed.

### Damage and passive recovery

Guard damage subtracts an integer, clamped at zero. A hit against positive Guard affects only Guard even when it would overshoot zero. For example, 4 Guard damage against 2 remaining Guard creates a breach and deals no HP damage. Guard regains 1 at the end of a normal beat if it remains positive and took no actual Guard damage that beat. The attack phase suspends this recovery.

### The breach state

Reaching zero immediately cancels the current intention, stuns the enemy and grants two subsequent defensive decisions of exposure. The enemy cannot move, attack, parry or regenerate. It still occupies space. Additional Guard damage while already breached does nothing and cannot refresh the timer or pay a second reward.

If an enemy is breached during beat 6, its counter is 2 at the decision after beat 6. Committing the next normal defensive action reduces it to 1. Committing another reduces it to 0 and restores Guard at that beat's end. Activation at either intervening decision freezes the remaining window for the entire attack turn.

A breach permits at most one HP-damaging hit before it closes. It does not guarantee that the player will use the opening. An HP hit restores full Guard and ends the stun if the enemy survives. During an attack turn, that survivor also gains protection from further offensive effects until the turn ends.

### Protection after a wound

A protected survivor cannot be selected for an attack, take splash or collision effects, lose Guard, be forcibly moved or grant another refund. It remains a physical obstacle and may be vaulted. A movement-only teleport may pass it. Area previews visibly exclude protected enemies rather than pretending they receive damage.

This protection does not continue into the next defensive phase. It is a limit on repeated wounds within one frozen sequence. An enemy with 2 HP therefore requires at least two attack turns under baseline damage values.

### Why the timer matters

An early breach buys safety, but can recover before the rest of the crowd is ready. Activating preserves current exposure. Expiry restores a fresh visible threat rather than an immediate hit; canceling the enemy's old commitment remains permanent.

## Attack turn transitions

### Entering frozen time

At any player decision in defensive time, charge of 4 or more enables Activate. This is an untimed command; it cannot interrupt an animation midway, reverse a resolved hit or rescue a dead player. Activation does not advance the defensive clock.

- Copy the entire charge bank into attack budget and set charge to zero.
- Cancel every enemy's published intention, including attacks that would otherwise hit next. This interrupt alone does not stun an enemy for future defensive beats.
- Apply 2 Guard damage simultaneously to every living, unbreached enemy. It cannot damage HP. Positive Guard reduced to zero creates the normal breach and stun.
- Enter the attack phase. Freeze enemy movement, attack resolution, Guard recovery, exposure counters and soul aging. No new enemies appear.

The pulse rewards bringing several enemies within 2 Guard of breaking. Already breached enemies retain their remaining window; the pulse does not refresh it. Pulse damage supplies no charge, refund or soul. There is no separate bonus for a pulse breach in version 0.1.

### Playing the attack turn

Choose and confirm attacks, movement or spells one at a time. An action spends its full cost before applying effects; a future refund cannot pay an unaffordable action. Every enemy's first HP-damaging hit refunds 1 attack-budget point, including a lethal hit or a spell hit. Kills additionally create one fresh soul. Refunds enter the current attack budget, never the empty defensive charge meter.

Zero budget does not force an exit if an affordable soul spell remains. The player may end the turn at any decision. The interface must always expose End Attack Turn, including when no other action is legal. Each enemy can pay one refund and one soul at most; no resurrection or spawning occurs during frozen time.

### Returning to defense

Discard remaining attack budget. Convert each unused fresh soul into a stale pickup at its kill cell. Remove wound protection from surviving enemies. Existing unconsumed breaches retain their paused counters and remain stunned.

Unbreached survivors publish fresh tells from their current cells if they can attack; they receive no free movement. Out-of-range enemies wait for the next normal beat's idle update. The player sees these new commitments before acting. Canceled attacks never return.

On the final kill, resolve its refund and soul, then end the encounter: expire unused fresh souls, collect all stale pickups, apply the reserve cap and show victory. No cleanup actions are required.

## Actions during the attack turn

Sword and gun moves spend attack budget. Every HP hit removes one whole pip. This kit tests movement, preparation and crowd payoff.

Move | Cost | Effect
--- | --- | ---
Lunge | 3 budget | Select one exposed enemy 1 to 3 cells away on a clear eight-direction ray. Travel to the cell before it and deal 1 HP. If it dies, enter its cell; otherwise stop before it.
Execution Shot | 3 budget | Deal 1 HP to the first enemy on a ray up to 5 cells away, if exposed. Remain in place. Living bodies block the ray.
Sweep | 5 budget | Stay or step to an adjacent empty cell, then hit up to three selected exposed enemies adjacent to the destination for 1 HP each. Targets are resolved as one batch.
Break | 2 budget | Deal 4 Guard to one adjacent guarded enemy. No HP spillover and no immediate refund.
Traverse | 1 budget | Move 1 or 2 clear cells in a straight direction, or vault one adjacent enemy. No Guard damage or charge gain.
Soul spell | Souls | Use the spell rules on the following page. Baseline spells cost no attack budget.
End Attack Turn | Remainder | Leave voluntarily and discard unspent budget.

### Route rules

Lunge cannot cross actors or walls; preview its destination. An adjacent survivor leaves the player in place. Sweep applies hits together, then awards qualifying refunds and souls. Corpses vacate their cells before the next decision.

HP attacks require existing exposure. Break and Lunge are separate actions, each affordable when taken. An underprepared crowd therefore consumes more budget, but emergency activation can still create an opening.

### Extension without an infinite turn

Lunge costs 3 and refunds 1. Sweep costs 5 and refunds at most 3. Break and Traverse never refund. Six enemies can return at most 6 budget points; none can be wounded twice that turn.

Spells can extend a sequence at zero budget. Soul Lance costs two soul equivalents and returns at most one fresh soul. Movement and Guard spells create none.

## Fresh souls and the reserve

Every attack-turn kill produces one fresh soul at its death cell, immediately spendable from anywhere. Location matters only if it goes stale.

Spell | Soul cost | Effect and availability
--- | --- | ---
Bell | 1 fresh or 3 reserve | Choose a visible center within 4 cells. Deal 3 Guard to each eligible enemy within 1 cell of it. Walls block effect between center and target. Available in both phases.
Thread | 1 fresh or 3 reserve | Teleport to an empty visible cell within 4 cells, passing bodies but not opaque walls. No damage. Available in both phases.
Soul Lance | 2 fresh or 6 reserve | Hit one exposed enemy on a clear ray within 5 cells for 1 HP. Available only during attack turns. It earns the normal 1 budget refund and, on a kill, one fresh soul.

### Payment and legal targets

A two-unit spell costs two fresh souls, one fresh plus 3 reserve, or 6 reserve. Choose payment explicitly; default to fresh first and oldest token first. Token choice can preserve a useful pickup location. Pay up front; invalid casts cost nothing. Only a defensive Thread that evades a committed attack can earn the usual evade charge.

Bell damages Guard only, never exposed HP, and ignores protected survivors. A cast must affect at least one eligible enemy. Soul Lance obeys the same body obstruction and one-wound rule as Execution Shot. Spell areas and target eligibility are displayed before confirmation.

### Staling and collection

At attack-turn exit, each unspent fresh soul becomes one stale pickup. A pickup created under the player is collected immediately. Entering or crossing its cell through ordinary movement, a vault or a lunge collects it without a separate action; a teleport collects only at its destination. Each adds one reserve unit up to a cap of 9. Uncollected excess remains on the floor during combat. Multiple pickups can share a cell.

Stale pickups do not age further. At victory, all remaining pickups are swept into reserve and overflow is discarded visibly. They are resources rather than gore, and cannot obstruct movement or enemy targeting. In the first isolated encounter, reserve is for that encounter only; a later run structure may carry it across rooms.

### Why retain a weaker soul

Three saved kills finance a defensive Bell or Thread. Immediate use is more efficient, but reserve can rescue a later setup. Defensive casting consumes one beat and cannot wound enemies.

## The first enemy roster

Use a fixed six-enemy encounter before procedural generation: two swordsmen, two chargers, one gunner and one warden. The mix should produce intersecting commitments rather than six identical bodies approaching in a queue.

Enemy | Guard and HP | Published attack | Tactical role
--- | --- | --- | ---
Swordsman | 10 Guard; 1 HP | One adjacent cell; 1 player damage; parryable. | Reliable parry opportunities amid other threats.
Charger | 10 Guard; 1 HP | Straight ray up to 3 cells; 1 player damage; parryable only if already adjacent after the player's step. | Moves along the committed ray and changes crowd geometry.
Gunner | 10 Guard; 1 HP | Straight shot up to 5 cells; 1 player damage; cannot be parried. | Threatens distance and supplies friendly-fire opportunities.
Warden | 15 Guard; 2 HP | Up to 3 adjacent cells in a displayed facing arc; 2 player damage; cannot be parried. | Forces relocation and survives an initial wound.

### Committed attacks and bodies

A swordsman's swing remains aimed at its published cell. A gunner may aim at an aligned player through other enemies, but walls block its aim; its shot hits the first body, dealing 4 Guard to an enemy and no HP. A charger commits to a full 3-cell ray toward an aligned player within range. It travels to the ray's end even if the player leaves, stopping before the first body or wall. An enemy collision deals 4 Guard to the blocker and 2 to the charger; a wall impact deals 2 to the charger. These impacts never wound exposed enemies.

The warden's arc is fixed. Melee swings affect only the player. An evaded attack still pays evade Guard damage, so a charger collision can combine with an evade. All evades together grant at most 1 charge that beat.

### Pressure without cheating

Every attack is announced for at least one decision. Several tells may overlap; reject layouts without a survivable opening. Display resolution order so a gunshot that breaches a charger predictably cancels its pending charge.

A final swordsman can still grant charge through parries. Test this endgame explicitly: its short attack recovery must not turn finishing the encounter into tedious meter generation.

Fixed opening: player (5,4); swordsmen (3,3) and (7,5); chargers (5,1) and (9,4); gunner (1,4); warden (6,6). Everyone starts at full resources except charge and reserve, which are zero. Publish all in-range tells without moving enemies: the northern charger and western gunner initially threaten the player. The other four enemies start idle. The player wins when every enemy is dead and loses immediately at zero HP.

## Worked example of a coordinated attack

This is a controlled midfight fixture, not a claim about the optimal opening. Coordinates run from x 1 to 9 and y 1 to 7. All unspecified cells are empty. Player: (3,4), 3 HP, charge 8, reserve 0. Enemy A: (5,4), Guard 2, HP 1. B: (5,6), Guard 2, HP 1. C: (7,6), Guard 5, HP 1. Warden D: (7,4), Guard 9, HP 2. A and B are swordsmen; C is a gunner. No attack is currently committed. The player activates to exploit this favorable arrangement before Guard recovery erodes it.

Decision | Result | Budget and souls
--- | --- | ---
Activate | Cancel all tells. Pulse leaves A and B exposed, C at 3 Guard and D at 7. Charge becomes 0. | Budget 8; fresh 0
Lunge A | Travel (3,4) to (4,4), kill A and enter (5,4). Pay 3, refund 1. | Budget 6; fresh 1
Bell at C | Spend the fresh soul. The radius hits C only, removing its last 3 Guard and stunning it. | Budget 6; fresh 0
Lunge B | Travel through (5,5), kill B and enter (5,6). Pay 3, refund 1. | Budget 4; fresh 1
Lunge C | Travel through (6,6), kill C and enter (7,6). Pay 3, refund 1. | Budget 2; fresh 2
End attack turn | Discard 2 budget. Unused souls from B and C become stale at (5,6) and (7,6). Collect the one underfoot. | Charge 0; reserve 1

### What the sequence demonstrates

Two synchronized pulse breaches start the combo. The first kill finances a Guard spell that brings a third enemy into it. Three wounds refund 3 budget points and the player travels six cells through attacks. D remains alive at 7 Guard; the player has not secretly damaged its HP or gained charge for the next phase.

D is two cells away at (7,4), so cannot publish its adjacent sweep immediately on re-entry. It receives no free move when the attack turn ends. Its later approach and tell occur through the ordinary defensive update. The stale soul at (5,6) creates a possible future movement destination.

### A different finish

Instead of ending, the player could spend one fresh soul on Thread to choose another visible empty cell within 4. That sacrifices immediate reserve value for positioning. The remaining 2 budget could also fund Traverse or an adjacent Break if legal. Ending early remains an explicit choice, not an automatic consequence of the last kill.

## Emergency activation and a surviving enemy

### Spending before the crowd is ready

Player: (4,4), 1 HP, charge 4. A warden at (5,4) has Guard 2, HP 2 and a committed heavy sweep threatening the player. A gunner farther away threatens another escape lane. Activating is legal before committing another defensive action.

Decision | Outcome | Accounting
--- | --- | ---
Activate | Cancel the sweep and gunshot. The 2 Guard pulse breaches the warden. The gunner loses 2 Guard but remains guarded. | Charge 4 becomes budget 4
Lunge warden | Deal 1 HP. It survives at 1 HP, restores Guard to 15, ends its breach and gains attack-turn protection. The player stays at (4,4). | Pay 3, refund 1; budget 2
Traverse | Move two clear cells west to (2,4), escaping the surviving warden's immediate reach. | Pay 1; budget 1
End attack turn | Discard the last point. Remove the warden's protection. Survivors publish only new legal tells from their current cells. | Charge 0; no souls earned

The attack turn saves the player's life, removes a meaningful HP pip and repositions them, but earns no fresh soul and leaves most of the crowd's Guard intact. The player must build charge again. This is the intended cost of an emergency activation; taking unavoidable damage on exit would undermine its purpose.

### Frozen timer example

Suppose another enemy entered the attack phase with one exposure decision remaining. Five attacks and two spells do not consume that decision. If left unwounded, it returns to defense with one remaining and stays stunned. The next completed defensive action expires it, restores Guard and permits a fresh tell. It cannot perform the attack canceled by the original breach.

### Zero budget with two souls

An attack turn at zero budget can continue through an affordable Soul Lance against an exposed enemy. Pay two soul equivalents first, then deal one HP and refund 1 budget. A kill returns one fresh soul, so the cast cannot fund itself indefinitely. A surviving target becomes protected and cannot be used again.

If no attack or spell is legal, End Attack Turn remains available. A poor activation never traps the interface in frozen time.

## Interface and violent feedback

### One board with two clear modes

Keep the entire arena visible. Show four large player HP pips, the numerical charge bank and activation threshold in defensive time. In frozen time replace charge with the remaining attack budget, fresh souls and reserve. Label the current phase in words as well as color. Make End Attack Turn persistently accessible.

Solid red arrows show the current committed attack footprints: a single sword strike, a warden's fan, or a gunner/charger lane. Dashed cyan arrows show movement from the same pure simulation used by the action forecast. Before selecting a command, label them "Movement if you Wait"; after selecting a valid command, update them to that command's exact movement. These arrows disappear while time is frozen. A corner dash marks an enemy with no committed attack, excluding breached or protected enemies. Such an enemy can still approach. Hover and keyboard focus reveal descriptive hints; inspecting an enemy emphasizes its arrows without advancing time.

Every enemy displays a compact Guard bar with exact numbers, large HP pips, its pending intention and resolution number. Breached enemies show a broken-defense symbol and remaining exposure decisions. Protected survivors use a distinct unavailable marker. Neither blood red nor animation alone may carry critical state information.

### Action previews

- Defensive preview: movement path, all incoming HP loss, parry or evade results, Guard damage, regeneration, resulting breaches, charge gained and the next visible tells.
- Activation preview: enemies interrupted, post-pulse Guard, newly exposed targets and starting attack budget.
- Attack preview: path and endpoint, eligible targets, HP lost, restored Guard, protected survivors, cost, refunds and resulting souls.
- Spell preview: area or ray, blocked targets, excluded survivors and the exact fresh-versus-reserve payment.

Keyboard and one-button mouse or touch share action, target and confirm semantics. Hover or inspection never advances time. Activation has a dedicated button and keyboard binding with a confirmation preview. There are no timed prompts. An optional laboratory undo can aid testing, but is not an established roguelike rule.

### Extreme Unicode violence

Use rapid glyph changes for cuts, punctures, dismemberment, blood sprays and the destruction of bodies. A successful wound must feel categorically different from sparks or displaced glyphs on a Guard hit. Chain kills can use brief hit pauses, directional trails and escalating sound while the tactical simulation remains frozen.

Blood, limbs and corpses have no collision, damage, slipping, visibility or targeting effects. Clear or dim them before the next decision so the board remains readable. Keep critical symbols above effects and provide a reduced-motion presentation. Screen shake and long animations must never make accurate inspection harder.

A useful glyph vocabulary is hearts for HP, a segmented line for Guard, a fracture marker for breach and an outlined symbol for a protected survivor. Validate the chosen Unicode font on the actual browser targets before relying on a glyph.

## What the prototype must establish

### Lessons retained from Final Fight

Final Fight revision e1cf4d6 is a 9 by 7, six-enemy combat laboratory. Retain its shared preview and execution principle. Replace its requirement for three consecutive strikes on one target.

Saved verification records a 32-action victory with three movement actions and 19 of 24 HP spent, a suppression state repeated 100 times, and a safer chip-damage suffix. These witnesses reveal incentive problems, not typical human behavior or every exploit. Test what winning encourages, not just whether a room is winnable.

### First playable laboratory

Implement this ruleset independently in a fresh local project when prototype work is authorized. Use a deterministic TypeScript simulation, a Unicode board and a DOM interface. The renderer consumes state and events; it does not own rules. Use serializable commands and seedable encounters so every discovered exploit has a replay. No GitHub repository is created by this document.

Begin with the four-player-HP roster above in an open room. Add fixtures for a corner, a pillar, simultaneous melee and gunfire, an exposed enemy about to recover, an emergency activation, and a lone surviving enemy. Do not add loot, progression or bosses to compensate for an unsatisfying combat loop.

### Mechanical acceptance

- Forecast and execution agree, including post-beat Guard regeneration and total incoming damage.
- A newly breached enemy always grants its full exposure window; attack actions consume none of it.
- Activation cancels all tells and empties charge. No attack-phase event refills that meter.
- One enemy grants at most one HP refund and one kill soul per attack turn; every offensive source respects protection.
- Soul conversion, payment and collection conserve the defined resources. No fresh soul survives phase exit as fresh.
- Interrupted attacks never return; new tells always precede damage. Invalid commands consume nothing.

### Human acceptance

Ask players to predict sequences and explain activation timing. Compare early, intermediate and full-charge turns. Record setup length, movement, wounds and unused budget. Investigate idle stretches, camping, charge farming and slow last-enemy cleanup. Balance and satisfaction remain unverified until played.
