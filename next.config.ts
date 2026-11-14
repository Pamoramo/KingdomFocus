import type { NextConfig } from 'next';

// Lets phones, tablets and other computers on your home network open the dev server
// (e.g. http://10.0.0.150:3000). Without this, Next blocks its own scripts for any
// hostname but localhost and the game hangs on the title screen.
const LAN = ['10.*.*.*', '192.168.*.*', ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`), '*.local'];

const config: NextConfig = { reactStrictMode: false, allowedDevOrigins: LAN };
export default config;
