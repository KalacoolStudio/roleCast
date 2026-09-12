const defaults = {
  packetMs: 40,
  prefixMs: 320,
  silenceMs: 480,
  onsetPackets: 2,
  calibrationPackets: 8,
  minimumStartLevel: 0.012,
  minimumContinueLevel: 0.008,
  noiseMultiplier: 3,
  continueMultiplier: 1.8,
  playbackMultiplier: 0.22,
  maximumPlaybackGate: 0.07,
};

const rms = (samples) => {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / Math.max(1, samples.length));
};

/**
 * Adaptive client-side gate in front of the provider's turn detection.
 * It learns steady room noise, retains speech prefix/tail audio, and raises
 * the threshold during local playback without disabling deliberate barge-in.
 */
export class AdaptiveVad {
  constructor(options = {}) {
    this.options = { ...defaults, ...options };
    this.prefixPackets = Math.ceil(
      this.options.prefixMs / this.options.packetMs,
    );
    this.silencePackets = Math.ceil(
      this.options.silenceMs / this.options.packetMs,
    );
    this.reset();
  }

  reset() {
    this.noiseLevel = 0.004;
    this.calibration = 0;
    this.onset = 0;
    this.hangover = 0;
    this.speaking = false;
    this.prefix = [];
  }

  push(samples, playbackLevel = 0) {
    const packet = samples.slice();
    const inputLevel = rms(packet);
    let peak = 0;
    for (const sample of packet) peak = Math.max(peak, Math.abs(sample));

    const playbackGate = Math.min(
      this.options.maximumPlaybackGate,
      playbackLevel * this.options.playbackMultiplier,
    );
    const startLevel = Math.max(
      this.options.minimumStartLevel,
      this.noiseLevel * this.options.noiseMultiplier,
      playbackGate,
    );
    const continueLevel = Math.max(
      this.options.minimumContinueLevel,
      this.noiseLevel * this.options.continueMultiplier,
      playbackGate * 0.65,
    );

    if (this.speaking) {
      if (inputLevel >= continueLevel) this.hangover = this.silencePackets;
      else this.hangover--;
      if (this.hangover > 0) return [packet];
      this.speaking = false;
      this.onset = 0;
      this.prefix = [packet];
      return [];
    }

    this.prefix.push(packet);
    if (this.prefix.length > this.prefixPackets) this.prefix.shift();

    const calibrating = this.calibration < this.options.calibrationPackets;
    const clearSpeechDuringCalibration = inputLevel >= 0.035 || peak >= 0.06;
    const candidate =
      inputLevel >= startLevel &&
      (!calibrating || clearSpeechDuringCalibration) &&
      inputLevel >= playbackGate;

    if (candidate) this.onset++;
    else {
      this.onset = 0;
      const alpha = calibrating
        ? 0.2
        : inputLevel < this.noiseLevel
          ? 0.08
          : 0.02;
      this.noiseLevel = Math.min(
        0.04,
        Math.max(0.0015, this.noiseLevel * (1 - alpha) + inputLevel * alpha),
      );
      this.calibration++;
    }

    if (this.onset < this.options.onsetPackets) return [];
    this.speaking = true;
    this.hangover = this.silencePackets;
    const result = this.prefix;
    this.prefix = [];
    return result;
  }
}
