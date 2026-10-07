# Stillblade

A browser combat prototype about earning one devastating moment.

**[Play on GitHub Pages](https://qpxjfnty.github.io/stillblade/)**

Defend in a small Unicode arena. Evade and parry to erode enemy Guard and build charge. Cash in the entire meter to interrupt the crowd and freeze time, then link sword attacks, gunshots and soul spells. You have four hearts; a heavy hit takes two.

## The combat loop

1. Read the marked enemy commitments. Choose an action and target, inspect the forecast, then confirm.
2. Slip, vault or turn aside attacks to gain charge. Enemy Guard recovers when left undamaged.
3. At four charge or more, activate an attack turn. Every enemy is interrupted and takes two Guard damage.
4. Breached enemies are stunned and vulnerable to one HP hit. A surviving enemy restores Guard and cannot be wounded again that attack turn.
5. Spend the attack budget on a route through the crowd. HP hits refund one budget point; kills create fresh souls for immediate spells.
6. Unused fresh souls become weaker pickups when the turn ends. Three collected reserve units replace one fresh soul.

The initial encounter contains two swordsmen, two chargers, a gunner and a two-heart warden. Practice encounters isolate synchronized breaches, emergency activation, an isolated enemy, pillars and corner escapes. The full baseline is in [the combat specification](docs/COMBAT_SPEC.md). Numerical balance is experimental.

## Play anywhere

The game is a static site with no account, download or server connection required after loading. Use a current browser on a phone, tablet or computer. Mouse, touch and keyboard follow the same select, preview and confirm flow. There are no reflex inputs. The in-game help lists the controls. Progress is saved locally when browser storage is available; blocked storage does not prevent play.

Keyboard: **1–8** selects an action, **arrows** move the arena cursor, and **Space** selects a cell. **Enter** confirms the forecast. **F** previews freezing time, **E** previews ending the attack turn, **Escape** cancels, and **?** opens the field guide. Parry and Sweep select a stance before selecting enemies.

Violence is presented through cosmetic Unicode effects. Corpses and blood do not change collision or targeting. Reduced-motion preferences are respected.

## Development

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

For browser verification, run a local server in another terminal, install the test browsers once, and run:

```sh
npx playwright install chromium firefox webkit
npm run qa
npm run qa:interaction
```

The QA scripts default to `http://127.0.0.1:4173/`. Set `QA_URL` to test a different origin, including the deployed Pages site. The matrix covers Chromium, Firefox and WebKit, with phone, tablet, desktop and landscape viewports. Screenshots and reports are written to ignored `output/playwright/`. This is browser automation and device emulation; it does not replace physical device testing.

`src/model.ts` defines serializable state and commands. `src/engine.ts` owns deterministic simulation; previews and committed actions use the same transition. The DOM interface renders the state and handles input. Vite emits a portable static build with relative asset paths.

Pushes to `main` run the engine tests and production build before deploying `dist/` to GitHub Pages through [a custom Actions workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Repository Pages settings must use **GitHub Actions** as the publishing source.

## Scope

This is a combat laboratory, not a full roguelike campaign. It has no progression, loot or procedural run structure yet. The intentionally bad mechanics from the research catalogue are not enabled in the baseline.
