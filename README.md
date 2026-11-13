# Kingdom of Discipline

Study and keep habits to grow a pixel-art medieval realm. Built with Next.js, TypeScript, Tailwind, Phaser 3 and Supabase.

```bash
npm install && npm run dev   # http://localhost:3000
npm test                     # reward / check-in / habit logic
```

Cloud saves (optional): create a Supabase project, run `supabase.sql`, copy `.env.example` to `.env.local` and fill in the URL and anon key. Without them the game saves to localStorage.

Layout: `src/lib` holds pure game logic (rewards, study sessions, habits, economy, store, sync), `src/game` holds the Phaser scene and the procedural pixel-art generator, and `src/components` holds the React UI.
