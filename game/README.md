# Creature Forge game PWA

This is the separate, offline-first player application from Phase 5 of the creature platform roadmap. It consumes the builder's `AnimalPackageV1` contract and the shared hybrid recipe renderer in `src/animalPackage/hybrid.ts`.

## Run locally

From the repository root:

```bash
npm run game:dev
```

The default development URL is `http://localhost:4174`.

## Verify and build

```bash
npm run game:test
npm run game:lint
npm run game:build
```

The production PWA is written to `game/dist`. Serve that directory over HTTPS (or localhost) so the browser can install the manifest and service worker.

## Data model

- Eight approved Animal Package V1 assets are bundled in `src/library.ts`.
- The body package determines the anatomy template and visible categories.
- A saved hybrid contains animal IDs, asset versions, part IDs, colours, and small transforms. It does not duplicate source SVG.
- Player recipes live in IndexedDB in the `creature-game` database.
- Export and import use a versioned JSON save bundle containing recipes and player progression.
- The service worker caches the application shell and loaded same-origin official assets for offline startup.

## Gameplay loop

Each official part supplies health, power, armor, speed and traits. The result card shows every contribution and the selected anatomy determines locomotion. Arena tests resolve in at most twelve rounds, award gene credits, and unlock additional official source animals for stronger or more specialized builds. Credits, wins and unlocks are stored alongside recipes in IndexedDB.
