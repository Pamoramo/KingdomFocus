# Kingdom of Discipline

A medieval pixel-art kingdom builder where real study and good habits are the only source of resources. Built with Next.js, TypeScript, Tailwind, Phaser 3 and Supabase. Works on desktop, iPad and iPhone, and installs as a PWA.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Without Supabase variables the game runs fully offline and saves to the browser. `/artlab` shows every generated sprite.

## Tests

```bash
npm test             # rewards, check-ins, habits, economy, ledger
npm run test:db      # schema + sync function against a local Postgres (needs psql/createdb)
```

## Cloud saves (Supabase)

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_kingdom.sql`, then `0002_war.sql`.
3. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`: Project Settings → API → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Project Settings → API → anon public key
4. In Authentication → URL Configuration, add your site URL (for magic links).

How saving works:

- Every resource change is a row in `ledger`, keyed by `(user, kind, ref)`. Submitting the same session or habit completion twice can't pay out twice. Your balance is the sum of the ledger.
- `sync_kingdom()` applies all pending changes in one transaction and returns the merged kingdom.
- Triggers reject rewards that aren't backed by a real study session or habit completion, rewards above the allowed rate, and sessions claiming more time than actually passed.
- Row Level Security limits every table to its owner. Studying as a guest and then signing in merges your guest progress into the account.

## Study rewards & rest

- Rewards grow with focus: each continuous verified minute pays 1% more than the last, up to 3x. 25 min ≈ 283 gold, 1 hour ≈ 820, 2 hours ≈ 2,300.
- Two days without study cost nothing. After that the realm grows restless:
  - thieves strike even moderately guarded towns, and more often;
  - warlike neighbours grow colder each day and send threatening letters.
  One study session calms it.

## War & diplomacy

- Seven neighbours appear on the world map: a bandit lord and six kingdoms, each with a ruler, a personality, a castle level, an army and relations with you.
- Trade, gifts and lending troops build trust. At 60 relations a kingdom will ally with you, and allies join your campaigns and defend you.
- Siege engines (rams, towers, mangonels, ballistae, trebuchets) are built at the Siege Workshop.
- On campaign you first fight a field battle, choosing a tactic: assault, defensive line, flanking, volley, feigned retreat or ambush. Terrain, army composition, ranks and commanders all matter.
- During a siege, every 20 verified study minutes is one siege day. Farms produce supplies while you study, and each siege day the army eats them.
- Your own castle can only be besieged once you reach stage 4 and are at odds with someone, or when a kingdom truly hates you. Losing costs part of your stores, never your buildings.

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel. The framework is detected automatically.
2. Add the two `NEXT_PUBLIC_SUPABASE_*` variables under Project → Settings → Environment Variables.
3. Deploy, then add the Vercel URL to Supabase's allowed redirect URLs.

## Layout

- `src/lib`: pure game logic.
  - `rewards`, `study`, `habits`: proportional rewards, check-in timer, habit rules.
  - `economy`: buildings, troops, technologies, stages, ranks.
  - `state`: store, actions and the ledger.
  - `syncCore`, `sync`: cloud sync.
- `src/lib/battle.ts`, `war.ts`, `warActions.ts`: battle simulation, the world and diplomacy, and the war actions.
- `src/game`: the Phaser scenes (kingdom, world map, battle) and `audio.ts` (generated music and sound).
  - `world`: terrain, river, buildings, construction, lights.
  - `army`: formations with zoom-based detail.
  - `ambient`: villagers, patrols, archers, sparring.
  - `art/`: procedural pixel art.
- `src/components`: React UI panels.
- `supabase/`: migration and database tests.
- `scripts/icons.mjs`: regenerates the PWA icons.

Tuning: reward rates and check-in intervals can be changed in Settings. Costs, unlocks and stage goals are in `src/lib/economy.ts`.
