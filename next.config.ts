import type { NextConfig } from 'next';
import { hostname } from 'node:os';

// Lets phones, tablets and other computers open the dev server from another device. Without this, Next blocks
// its own scripts for any hostname but localhost and the game hangs on the title screen.
//  - home networks: 10.x, 192.168.x, 172.16-31.x and *.local names
//  - Tailscale: 100.x addresses (its 100.64.0.0/10 range) and MagicDNS names like my-pc.tailnet-name.ts.net
//  - this computer's own name (MagicDNS also answers to it bare, e.g. http://my-pc:3000); Next does not allow a
//    wildcard for bare names, so any others go in DEV_ORIGINS, e.g. DEV_ORIGINS=my-pc,my-laptop
const LAN = ['10.*.*.*', '192.168.*.*', ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`), '*.local'];
const TAILSCALE = ['100.*.*.*', '**.ts.net'];
const NAMES = [hostname().toLowerCase().split('.')[0], ...(process.env.DEV_ORIGINS ?? '').split(',').map((s) => s.trim().toLowerCase())].filter(Boolean);

const config: NextConfig = { reactStrictMode: false, allowedDevOrigins: [...LAN, ...TAILSCALE, ...NAMES] };
export default config;
