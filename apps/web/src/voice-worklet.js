/* global AudioWorkletProcessor, sampleRate, registerProcessor */
import { Resampler, encodePCM, decodePCM } from "./voice-pcm.js";

class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capture = new Resampler(sampleRate);
    this.playback = new Resampler(24000, sampleRate);
    this.packet = new Float32Array(960);
    this.packetSize = 0;
    this.outstanding = 0;
    this.playing = false;
    this.queue = new Float32Array(Math.ceil(sampleRate * 0.25));
    this.read = 0;
    this.size = 0;
    this.active = false;
    this.muted = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === "active") this.active = data.active;
      else if (data.type === "capture-received")
        this.outstanding = Math.max(0, this.outstanding - 1);
      else if (data.type === "mute") {
        this.muted = data.muted;
        this.packetSize = 0;
        this.capture = new Resampler(sampleRate);
      } else if (data.type === "clear") {
        this.active = false;
        this.size = 0;
        this.packetSize = 0;
      } else if (data.type === "audio" && this.active) {
        try {
          const samples = this.playback.push(decodePCM(data.bytes));
          if (this.size + samples.length > this.queue.length)
            throw new Error("Playback backlog");
          for (const sample of samples) {
            this.queue[(this.read + this.size) % this.queue.length] = sample;
            this.size++;
          }
          this.port.postMessage({
            type: "playback-received",
            bytes: data.bytes.byteLength,
          });
          if (this.size && !this.playing) {
            this.playing = true;
            this.port.postMessage({ type: "playback", playing: true });
          }
        } catch {
          this.size = 0;
          this.active = false;
          this.port.postMessage({ type: "error", code: "VOICE_BACKPRESSURE" });
        }
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (output)
      for (let i = 0; i < output.length; i++) {
        output[i] = this.active && this.size ? this.queue[this.read] : 0;
        if (this.active && this.size) {
          this.read = (this.read + 1) % this.queue.length;
          this.size--;
        }
      }
    if (!this.size && this.playing) {
      this.playing = false;
      this.port.postMessage({ type: "playback", playing: false });
    }
    if (this.active && inputs[0]?.[0]) {
      const channels = inputs[0],
        mono = new Float32Array(channels[0].length);
      if (!this.muted)
        for (const channel of channels)
          for (let i = 0; i < mono.length; i++)
            mono[i] += channel[i] / channels.length;
      for (const sample of this.capture.push(mono)) {
        this.packet[this.packetSize++] = sample;
        if (this.packetSize === this.packet.length) {
          if (this.outstanding >= 12) {
            this.active = false;
            this.size = 0;
            this.port.postMessage({
              type: "error",
              code: "VOICE_BACKPRESSURE",
            });
            break;
          }
          const bytes = encodePCM(this.packet);
          this.outstanding++;
          this.port.postMessage({ type: "audio", bytes }, [bytes]);
          this.packetSize = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("role-cast-voice", VoiceProcessor);
