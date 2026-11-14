import Phaser from 'phaser';
import { audio } from './audio.ts';
import { getState } from '../lib/state.ts';
import type { Biome } from '../lib/realms.ts';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
export const WEATHER_NAME: Record<Weather, string> = { clear: 'Clear skies', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm', fog: 'Fog', snow: 'Snow' };
const BLOCK = 8 * 60_000;

/** Weather for a moment in time: stable within each 8-minute block, seasonal and time-of-day aware. */
export function weatherAt(t = Date.now()): Weather {
  let h = Math.floor(t / BLOCK) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  const roll = (h % 1000) / 1000, d = new Date(t), month = d.getMonth(), hour = d.getHours(), winter = month === 11 || month <= 1;
  const fog = hour >= 5 && hour < 10 ? 0.18 : 0.05;
  if (roll < 0.42) return 'clear';
  if (roll < 0.64) return 'cloudy';
  if (roll < 0.64 + fog) return 'fog';
  if (roll < 0.93) return winter ? 'snow' : 'rain';
  return winter ? 'snow' : 'storm';
}

/** The same sky, as it falls in each biome: no rain in the desert, snow on the tundra, mist in the swamp. */
export function biomeWeather(b: Biome, w: Weather): Weather {
  if (b === 'desert') return w === 'rain' || w === 'storm' || w === 'snow' || w === 'fog' ? 'clear' : w;
  if (b === 'tundra') return w === 'rain' || w === 'storm' || w === 'cloudy' ? 'snow' : w;
  if (b === 'swamp') return w === 'cloudy' || w === 'clear' ? (Math.floor(Date.now() / 480000) % 2 ? 'fog' : w) : w;
  if (b === 'forest') return w === 'snow' ? 'rain' : w;
  return w === 'snow' && b === 'grassland' ? 'snow' : w;
}

/** Rain, snow, fog, drifting cloud shadows, lightning and the matching ambience. */
export class WeatherFx {
  current: Weather | null = null;
  private zone = new Phaser.Geom.Rectangle(0, 0, 10, 10);
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tint: Phaser.GameObjects.Rectangle;
  private bolt: Phaser.Time.TimerEvent | null = null;
  constructor(private scene: Phaser.Scene, private W: number, private H: number) {
    const T = scene.textures;
    if (!T.exists('drop')) { const c = document.createElement('canvas'); c.width = 1; c.height = 7; const x = c.getContext('2d')!; const g = x.createLinearGradient(0, 0, 0, 7); g.addColorStop(0, 'rgba(200,220,255,0)'); g.addColorStop(1, 'rgba(210,228,255,0.9)'); x.fillStyle = g; x.fillRect(0, 0, 1, 7); T.addCanvas('drop', c); }
    if (!T.exists('flake')) { const c = document.createElement('canvas'); c.width = 3; c.height = 3; const x = c.getContext('2d')!; x.fillStyle = '#ffffff'; x.fillRect(1, 0, 1, 3); x.fillRect(0, 1, 3, 1); T.addCanvas('flake', c); }
    if (!T.exists('puff')) { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d')!; const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(246,247,248,0.8)'); g.addColorStop(0.55, 'rgba(246,247,248,0.35)'); g.addColorStop(1, 'rgba(246,247,248,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); T.addCanvas('puff', c); }
    this.tint = scene.add.rectangle(-W, -H, W * 3, H * 3, 0xffffff).setOrigin(0).setDepth(19990).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);
  }
  set(w: Weather) {
    if (w === this.current) return; this.current = w;
    this.emitters.forEach((e) => { e.stop(); this.scene.time.delayedCall(2500, () => e.destroy()); }); this.emitters = [];
    this.objs.forEach((o) => this.scene.tweens.add({ targets: o, alpha: 0, duration: 1500, onComplete: () => o.destroy() })); this.objs = [];
    this.bolt?.remove(); this.bolt = null;
    const sc = this.scene, zone = { type: 'random' as const, source: this.zone as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource };
    const tints: Record<Weather, number> = { clear: 0xffffff, cloudy: 0xe2e6ec, rain: 0xb4bccb, storm: 0x8e98ac, fog: 0xffffff, snow: 0xdfe6f0 };
    this.tint.setFillStyle(tints[w]).setVisible(w !== 'clear' && w !== 'fog');
    if (w === 'rain' || w === 'storm') {
      this.emitters.push(sc.add.particles(0, 0, 'drop', { emitZone: zone, speedY: { min: 360, max: 460 }, speedX: { min: -90, max: -60 }, rotate: 10, lifespan: 650, quantity: w === 'storm' ? 9 : 5, frequency: 16, alpha: { start: 0.9, end: 0.6 } }).setDepth(19995));
      this.emitters.push(sc.add.particles(0, 0, 'px', { emitZone: zone, speed: { min: 8, max: 20 }, angle: { min: 200, max: 340 }, lifespan: 260, quantity: 2, frequency: 40, scale: { start: 0.8, end: 0 }, tint: 0xcfe0ff, alpha: 0.7 }).setDepth(5));
    }
    if (w === 'snow') this.emitters.push(sc.add.particles(0, 0, 'flake', { emitZone: zone, speedY: { min: 18, max: 38 }, speedX: { min: -14, max: 10 }, accelerationX: { min: -6, max: 6 }, lifespan: 7000, quantity: 2, frequency: 40, alpha: { start: 0.95, end: 0.4 }, scale: { min: 0.6, max: 1.2 } }).setDepth(19995));
    if (w === 'fog') { const haze = sc.add.rectangle(-this.W, -this.H, this.W * 3, this.H * 3, 0xf0f2f4, 1).setOrigin(0).setDepth(19996).setAlpha(0); sc.tweens.add({ targets: haze, alpha: 0.22, duration: 2500 }); this.objs.push(haze); }
    if (w === 'fog') for (let i = 0; i < 16; i++) { const f = sc.add.image(Math.random() * this.W, Math.random() * this.H, 'puff').setScale(4 + Math.random() * 3, 1.6 + Math.random() * 1).setDepth(19997).setAlpha(0); sc.tweens.add({ targets: f, alpha: 0.9, duration: 2500 }); sc.tweens.add({ targets: f, x: f.x + 220, duration: 50000 + Math.random() * 30000, yoyo: true, repeat: -1 }); this.objs.push(f); }
    if (w === 'cloudy' || w === 'rain' || w === 'storm' || w === 'snow') for (let i = 0; i < 7; i++) {
      const c = sc.add.ellipse(Math.random() * this.W, Math.random() * this.H, 300 + Math.random() * 240, 140 + Math.random() * 80, 0x101820, 0.11).setDepth(19980).setAlpha(0);
      sc.tweens.add({ targets: c, alpha: 1, duration: 2500 }); sc.tweens.add({ targets: c, x: c.x + 600, duration: 70000 + Math.random() * 40000, repeat: -1, onRepeat: () => { c.x = -300; } }); this.objs.push(c);
    }
    if (w === 'storm') this.bolt = sc.time.addEvent({ delay: 9000, loop: true, callback: () => { if (Math.random() < 0.6) this.lightning(); } });
    audio.setWeather(w);
  }
  private lightning() {
    this.scene.cameras.main.flash(140, 230, 235, 255);
    this.scene.time.delayedCall(220, () => this.scene.cameras.main.flash(90, 230, 235, 255));
    if (getState().settings.sound) this.scene.time.delayedCall(600 + Math.random() * 1400, () => audio.play('thunder'));
  }
  /** Keeps precipitation spawning over whatever the camera is looking at. */
  update(cam: Phaser.Cameras.Scene2D.Camera) { const v = cam.worldView; this.zone.setTo(v.x - 60, v.y - 80, v.width + 120, v.height + 40); }
}
