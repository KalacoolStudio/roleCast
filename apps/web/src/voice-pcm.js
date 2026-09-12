/** Streaming linear resampling: keep the boundary sample and fractional phase. */
export class Resampler {
  constructor(inputRate, outputRate = 24000) {
    if (
      !Number.isFinite(inputRate) ||
      inputRate <= 0 ||
      !Number.isFinite(outputRate) ||
      outputRate <= 0
    )
      throw new Error("Invalid sample rate");
    this.step = inputRate / outputRate;
    this.pending = new Float32Array(0);
    this.position = 0;
  }
  push(samples) {
    const joined = new Float32Array(this.pending.length + samples.length);
    joined.set(this.pending);
    joined.set(samples, this.pending.length);
    const output = [];
    while (this.position + 1 < joined.length) {
      const i = Math.floor(this.position),
        fraction = this.position - i;
      output.push(joined[i] + (joined[i + 1] - joined[i]) * fraction);
      this.position += this.step;
    }
    const consumed = Math.min(Math.floor(this.position), joined.length);
    this.pending = joined.slice(consumed);
    this.position -= consumed;
    return Float32Array.from(output);
  }
}
export function encodePCM(samples) {
  const bytes = new ArrayBuffer(samples.length * 2),
    view = new DataView(bytes);
  samples.forEach((v, i) => {
    const value = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  });
  return bytes;
}
export function decodePCM(bytes) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength % 2)
    throw new Error("Invalid PCM");
  const view = new DataView(bytes),
    samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    const value = view.getInt16(i * 2, true);
    samples[i] = value / (value < 0 ? 32768 : 32767);
  }
  return samples;
}
