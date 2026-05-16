/**
 * Audio Engine public API.
 *
 * Import from this barrel — do NOT import directly from native-audio.engine.ts.
 * This allows swapping the engine in a single place.
 *
 * Usage:
 *   import { audioEngine } from '@/services/audio-engine';
 *   import type { AudioEngine } from '@/services/audio-engine';
 */

export type { AudioEngine, AudioEngineConfig } from './types';
export { nativeAudioEngine as audioEngine } from './native-audio.engine';
