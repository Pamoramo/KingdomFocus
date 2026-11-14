import Phaser from 'phaser';
import { getState } from '../lib/state.ts';
import { nightFactor } from './KingdomScene.ts';
import { audio } from './audio.ts';
import { neglect } from '../lib/state.ts';

type Target = { x: number; y: number; h: number; alive: () => boolean };
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

const LINES: Record<string, readonly string[]> = {
  worker: ['Another day, another beam.', 'These walls won\'t build themselves!', 'Mind the scaffolding!', 'Hammer, nail, repeat.', 'Fine timber, this.', 'My back aches.', 'Who ordered more stone?'],
  villager: ['Lovely weather.', 'Bread\'s fresh at the bakery!', 'Have you seen my goat?', 'The harvest looks good.', 'Our lord works so hard.', 'I heard the keep is growing.', 'Fresh water from the well!'],
  guard: ['All quiet.', 'Halt! Who goes there?', 'Eyes on the horizon.', 'Nothing to report.', 'Long watch tonight.', 'Keep moving, citizen.'],
  archer: ['Bullseye!', 'Wind\'s from the west.', 'Steady... loose!', 'Almost had it.', 'Draw, aim, release.'],
  soldier: ['For the realm!', 'Hold the line!', 'My boots need mending.', 'Drill again?', 'Ready for orders.', 'Shields up!', 'I hear the captain is fair.', 'Polish that helm!'],
  patrol: ['All clear on this street.', 'Keep your eyes open.', 'Nice day for a patrol.', 'Move along, nothing to see.', 'The night watch has it easy.', 'Mind your purses, folks!'],
  spar: ['Have at you!', 'Is that all?', 'Again!', 'Good parry!', 'Watch your footing!'],
};
const TALKS: [string, string][] = [
  ['Did you hear the news?', 'The lord studied all morning!'], ['Lovely day.', 'Aye, for working.'], ['Where are you off to?', 'The market, of course.'],
  ['Is that a new tower?', 'Built from pure discipline!'], ['How\'s the family?', 'Growing, like the realm.'], ['Fancy an ale later?', 'After my shift!'],
  ['They say the army grows.', 'Good. I sleep better.'], ['Need a hand?', 'Bless you, friend.'], ['Smell that bread?', 'Makes me hungry!'],
];
/** Lines that react to what is happening in the realm. */
function situational(): string[] {
  const s = getState(), out: string[] = [];
  if (s.session?.status === 'running') out.push('Hush! The lord is studying.', 'Every page builds our walls!', 'Study well, my liege!');
  if (s.world.threat) out.push('Man the walls!', 'Enemies at the gate!', 'Hold fast, they won\'t get in!');
  if (s.world.campaign) out.push('Any word from the siege?', 'I pray our soldiers eat well.', 'Victory will be ours!');
  if (nightFactor(s.settings.dayNight).n > 0.6) out.push('Mind the dark.', 'Time for bed.', 'Look at the stars.');
  const n = neglect(s);
  if (n > 0) out.push('Is our lord unwell? No study in days...', 'Thieves grow bold these days.', 'The neighbours whisper we are weak.', 'I hope our lord returns to the books soon.');
  if (s.stage >= 3) out.push('Remember when this was all dust?');
  if (s.stage >= 5) out.push('What a castle!', 'Our realm is the envy of all.');
  return out;
}

/** Small pixel speech bubbles that follow their speaker and fade away. */
export class Chatter {
  private live: { c: Phaser.GameObjects.Container; t: Target }[] = [];
  constructor(private scene: Phaser.Scene) {}
  get count() { return this.live.length; }
  say(t: Target, text: string, delay = 0, voice = 440, life?: number) {
    this.scene.time.delayedCall(delay, () => {
      if (!t.alive()) return;
      if (getState().settings.sound) audio.babble(text.length, voice);
      const txt = this.scene.add.text(0, 0, text, { fontFamily: 'monospace', fontSize: '22px', color: '#2a1d14', wordWrap: { width: 300 } }).setOrigin(0.5, 1).setScale(0.25).setResolution(2);
      const w = txt.displayWidth + 6, h = txt.displayHeight + 4, g = this.scene.add.graphics();
      g.fillStyle(0x1d1716, 1).fillRoundedRect(-w / 2 - 0.5, -h - 3.5, w + 1, h + 1, 2.5).fillTriangle(-2.5, -3, 2.5, -3, 0, 0.5);
      g.fillStyle(0xfff8e6, 1).fillRoundedRect(-w / 2, -h - 3, w, h, 2).fillTriangle(-1.8, -3.2, 1.8, -3.2, 0, -0.4);
      txt.setPosition(0, -5);
      const c = this.scene.add.container(t.x, t.y - t.h, [g, txt]).setDepth(30002).setAlpha(0).setScale(0.6);
      const item = { c, t }; this.live.push(item);
      this.scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 180, ease: 'Back.Out' });
      this.scene.tweens.add({ targets: c, alpha: 0, delay: life ?? 2200 + text.length * 40, duration: 300, onComplete: () => { c.destroy(); this.live = this.live.filter((x) => x !== item); } });
    });
  }
  update() { for (const { c, t } of this.live) if (t.alive()) c.setPosition(Math.round(t.x), Math.round(t.y - t.h)); }
  /** Each kind of character has its own voice pitch. */
  voice(role: string) { return ({ worker: 360, villager: 480, guard: 300, patrol: 320, soldier: 330, archer: 420, spar: 350, thief: 640 } as Record<string, number>)[role] ?? 440; }
  line(role: string) { const sit = situational(); return sit.length && Math.random() < 0.35 ? pick(sit) : pick(LINES[role] ?? LINES.villager); }
  conversation(a: Target, b: Target) { const [q, r] = pick(TALKS); this.say(a, q, 0, 470); this.say(b, r, 1700, 390); }
}
