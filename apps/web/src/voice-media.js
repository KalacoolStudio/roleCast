const errors = {
  NotAllowedError: "無法使用麥克風，請允許權限後再次開啟語音。",
  NotFoundError: "找不到麥克風，請連接裝置後再次開啟語音。",
  NotReadableError: "無法讀取麥克風，請檢查裝置或其他程式是否正在使用。",
  VOICE_UNSUPPORTED:
    "此瀏覽器不支援即時語音，請使用支援 AudioWorklet 的瀏覽器。",
  VOICE_AUDIO: "音訊播放已暫停，請重新開啟語音。",
  VOICE_BACKPRESSURE: "語音傳輸或播放跟不上速度，請重新開啟語音。",
  VOICE_TIMEOUT: "語音連線逾時，請重新開啟語音。",
};
export class VoiceMedia {
  constructor({
    workletUrl,
    request,
    onState = () => {},
    onEvent = () => {},
    env = globalThis,
  }) {
    Object.assign(this, { workletUrl, request, onState, onEvent, env });
    this.closed = false;
    this.state = "idle";
    this.muted = false;
    this.lastSequence = 0;
    this.outputPending = 0;
  }
  update(state, error) {
    this.state = state;
    this.onState({
      state,
      muted: this.muted,
      mutePending: this.mutePending,
      playing: this.playing,
      error,
    });
  }
  check() {
    if (this.closed) throw new Error("Cancelled");
  }
  async prepare() {
    this.update("preparing");
    this.preparation = setTimeout(
      () => this.fail({ code: "VOICE_TIMEOUT" }),
      35000,
    );
    try {
      const { navigator, AudioContext, AudioWorkletNode } = this.env;
      if (
        !navigator?.mediaDevices?.getUserMedia ||
        !AudioContext ||
        !AudioWorkletNode
      )
        throw { code: "VOICE_UNSUPPORTED" };
      this.context = new AudioContext({ latencyHint: "interactive" });
      await this.context.resume();
      this.check();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (this.closed) {
        stream.getTracks().forEach((t) => t.stop());
        this.check();
      }
      this.stream = stream;
      await this.context.audioWorklet.addModule(this.workletUrl);
      this.check();
      this.node = new AudioWorkletNode(this.context, "role-cast-voice", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.node);
      this.node.connect(this.context.destination);
      this.node.port.onmessage = ({ data }) => {
        if (this.closed) return;
        if (data.type === "error") this.fail(data);
        else if (data.type === "playback") {
          this.playing = data.playing;
          this.update(this.state);
        } else if (data.type === "playback-received")
          this.outputPending = Math.max(0, this.outputPending - data.bytes);
        else if (data.type === "audio" && this.state === "active") {
          this.node.port.postMessage({ type: "capture-received" });
          if (
            this.socket?.readyState !== 1 ||
            this.socket.bufferedAmount + data.bytes.byteLength > 24000
          )
            this.fail({ code: "VOICE_BACKPRESSURE" });
          else this.socket.send(data.bytes);
        }
      };
      this.node.onprocessorerror = () => this.fail({ code: "VOICE_AUDIO" });
      stream.getTracks().forEach((t) => {
        t.onended = () => this.fail({ code: "VOICE_AUDIO" });
      });
      this.context.onstatechange = () => {
        if (!this.closed && this.context.state !== "running")
          this.fail({ code: "VOICE_AUDIO" });
      };
      if (this.context.state !== "running") throw { code: "VOICE_AUDIO" };
    } catch (error) {
      if (!this.closed) this.fail(error);
      throw error;
    }
  }
  async connect(sessionId, callId) {
    this.check();
    this.update("connecting");
    clearTimeout(this.preparation);
    this.timeout = setTimeout(
      () => this.fail({ code: "VOICE_TIMEOUT" }),
      35000,
    );
    try {
      this.sessionId = sessionId;
      this.callId = callId;
      this.abort = new AbortController();
      const reservation = await this.request(
        `/drills/${sessionId}/calls/${callId}/voice`,
        { requestId: this.env.crypto.randomUUID() },
        this.abort.signal,
      );
      this.check();
      this.voiceId = reservation.voiceId;
      const url = new URL(
        `/api/drills/${sessionId}/calls/${callId}/voice/${this.voiceId}`,
        this.env.location.href,
      );
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = (this.socket = new this.env.WebSocket(url));
      socket.binaryType = "arraybuffer";
      this.lastHeartbeat = Date.now();
      socket.onopen = () => {
        if (this.closed) {
          socket.close();
          return;
        }
        socket.send(
          JSON.stringify({ type: "attach", token: reservation.token }),
        );
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastHeartbeat > 15000)
            this.fail({ code: "VOICE_TIMEOUT" });
          else this.control({ type: "heartbeat" });
        }, 5000);
      };
      socket.onmessage = ({ data }) => {
        if (this.closed) return;
        if (data instanceof ArrayBuffer) {
          if (this.state === "active") {
            this.outputPending += data.byteLength;
            if (this.outputPending > 12000) {
              this.fail({ code: "VOICE_BACKPRESSURE" });
              return;
            }
            this.node.port.postMessage({ type: "audio", bytes: data }, [data]);
          }
          return;
        }
        try {
          const event = JSON.parse(data);
          if (
            event.voiceId !== this.voiceId ||
            event.sequence <= this.lastSequence
          )
            return;
          this.lastSequence = event.sequence;
          if (event.type === "ready") {
            clearTimeout(this.timeout);
            this.node.port.postMessage({ type: "active", active: true });
            this.update("active");
          } else if (event.type === "heartbeat")
            this.lastHeartbeat = Date.now();
          else if (event.type === "muted") {
            this.mutePending = false;
            this.muted = event.muted;
            this.stream.getAudioTracks().forEach((track) => {
              track.enabled = !this.muted;
            });
            this.node.port.postMessage({ type: "mute", muted: this.muted });
            this.update("active");
          } else if (event.type === "stopped") {
            this.stop(false, event.error);
          } else if (["caption", "checkpoint"].includes(event.type))
            this.onEvent(event);
        } catch {
          this.fail({});
        }
      };
      socket.onerror = () => this.fail({});
      socket.onclose = () => {
        if (!this.closed) this.fail({});
      };
    } catch (error) {
      if (!this.closed) this.fail(error);
      throw error;
    }
  }
  control(event) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(event));
  }
  mute() {
    if (this.state !== "active" || this.mutePending) return;
    this.mutePending = true;
    // Stop real microphone samples immediately; continue sending PCM silence.
    if (!this.muted) this.node.port.postMessage({ type: "mute", muted: true });
    if (!this.muted)
      this.stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    this.control({ type: "mute", muted: !this.muted });
    this.update("active");
  }
  fail(error) {
    this.stop(true, {
      message:
        errors[error?.name] ||
        errors[error?.code] ||
        (error?.code ? error?.message : null) ||
        "語音連線中斷，請改用文字或再次開啟語音。",
    });
  }
  stop(notify = true, error) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.preparation);
    clearTimeout(this.timeout);
    clearInterval(this.heartbeat);
    this.abort?.abort();
    this.node?.port.postMessage({ type: "clear" });
    if (this.node) this.node.port.onmessage = null;
    if (this.node) this.node.onprocessorerror = null;
    this.source?.disconnect();
    this.node?.disconnect();
    this.node?.port.close();
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    if (this.context) {
      this.context.onstatechange = null;
      this.context.close().catch(() => {});
    }
    if (notify) this.control({ type: "stop" });
    this.socket?.close();
    this.update("idle", error?.message);
  }
}
