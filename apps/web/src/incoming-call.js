import { useEffect, useRef } from "react";

const RING_INTERVAL_MS = 2200;
const RING_LEVEL = 0.018;

export class IncomingCallTone {
  constructor(env = window) {
    this.env = env;
    this.oscillators = [];
  }

  start() {
    if (this.context || !this.env.AudioContext) return;
    this.context = new this.env.AudioContext({ latencyHint: "interactive" });
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    this.oscillators = [440, 480].map((frequency) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(this.gain);
      oscillator.start();
      return oscillator;
    });
    this.resume = () => this.context?.resume().catch(() => {});
    this.env.document.addEventListener("pointerdown", this.resume);
    this.env.document.addEventListener("keydown", this.resume);
    this.ring();
    this.timer = this.env.setInterval(() => this.ring(), RING_INTERVAL_MS);
    this.resume();
  }

  ring() {
    if (!this.context || this.context.state === "closed") return;
    const now = this.context.currentTime + 0.01;
    const level = this.gain.gain;
    level.cancelScheduledValues(now);
    level.setValueAtTime(0, now);
    for (const offset of [0, 0.46]) {
      level.linearRampToValueAtTime(RING_LEVEL, now + offset + 0.02);
      level.setValueAtTime(RING_LEVEL, now + offset + 0.28);
      level.linearRampToValueAtTime(0, now + offset + 0.36);
    }
  }

  stop() {
    if (!this.context) return;
    this.env.clearInterval(this.timer);
    this.env.document.removeEventListener("pointerdown", this.resume);
    this.env.document.removeEventListener("keydown", this.resume);
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        // The tone is already stopped.
      }
      oscillator.disconnect();
    }
    this.gain.disconnect();
    if (this.context.state !== "closed") this.context.close().catch(() => {});
    this.context = null;
    this.gain = null;
    this.oscillators = [];
  }
}

export function useIncomingCallTone(callKey) {
  const owner = useRef(null);
  useEffect(() => {
    owner.current?.stop();
    owner.current = null;
    if (!callKey) return;
    const tone = new IncomingCallTone();
    owner.current = tone;
    tone.start();
    return () => {
      tone.stop();
      if (owner.current === tone) owner.current = null;
    };
  }, [callKey]);
}
