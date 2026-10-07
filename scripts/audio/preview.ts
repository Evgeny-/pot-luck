/**
 * Render the game's actual score and synth voices without opening a browser.
 * npm install --prefix .cache/audio/runtime --no-audit --no-fund web-audio-engine@0.13.4
 * bun scripts/audio/preview.ts italy japan
 * The temporary renderer is kept out of the game's dependencies. WAVs stay in .cache/audio.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { scheduleMusicPreview, type MusicTheme } from '../../src/audio/audio';

const require = createRequire(import.meta.url);
const { OfflineAudioContext } = require('../../.cache/audio/runtime/node_modules/web-audio-engine');
const themes = (process.argv.slice(2).length ? process.argv.slice(2) : ['italy', 'japan']) as MusicTheme[];
const valid = new Set(['menu', 'italy', 'japan', 'mexico', 'usa', 'india', 'china']);
const sampleRate = 22050;
const seconds = 60;
await mkdir('.cache/audio', { recursive: true });

for (const theme of themes) {
  if (!valid.has(theme)) throw new Error(`Unknown music theme: ${theme}`);
  const context = new OfflineAudioContext(2, seconds * sampleRate, sampleRate);
  scheduleMusicPreview(context as AudioContext, theme, seconds - 2, 7);
  const audio = await context.startRendering() as AudioBuffer;
  const channels = [audio.getChannelData(0), audio.getChannelData(1)];
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  if (!peak || !Number.isFinite(peak)) throw new Error(`${theme} rendered no finite sound`);
  // Listening previews use a consistent peak; the quiet in-game mix is unchanged.
  const gain = 0.26 / peak;
  const wav = Buffer.alloc(44 + audio.length * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(audio.length * 4, 40);
  let energy = 0;
  for (let i = 0; i < audio.length; i++) {
    const fade = Math.min(1, (audio.length - 1 - i) / sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const sample = channels[ch][i] * gain * fade;
      energy += sample * sample;
      wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + (i * 2 + ch) * 2);
    }
  }
  const path = `.cache/audio/${theme}-preview.wav`;
  await writeFile(path, wav);
  console.log(JSON.stringify({ path, seconds, peak, previewGain: gain, rms: Math.sqrt(energy / (audio.length * 2)) }));
}
