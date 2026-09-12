import { useEffect, useRef, useState } from "react";
import { VoiceMedia } from "./voice-media.js";
import workletUrl from "./voice-worklet.js?worker&url";

export function useVoice(id, session, request) {
  const owner = useRef(null);
  const [status, setStatus] = useState({ state: "idle", muted: false });
  const [events, setEvents] = useState([]);
  const [availability, setAvailability] = useState("checking");
  useEffect(() => {
    let cancelled = false;
    request("/capabilities")
      .then((v) => {
        if (!cancelled)
          setAvailability(v.voice.available ? "available" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setAvailability("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [request]);
  useEffect(() => {
    const stop = () => owner.current?.stop();
    window.addEventListener("pagehide", stop);
    return () => {
      stop();
      window.removeEventListener("pagehide", stop);
    };
  }, [id]);
  useEffect(() => {
    const media = owner.current;
    if (
      media?.callId &&
      session &&
      (session.id !== media.sessionId ||
        session.state !== "in_call" ||
        session.currentCallId !== media.callId ||
        session.calls.find((c) => c.id === media.callId)?.endedAt)
    )
      media.stop();
  }, [session]);
  const start = async (accept) => {
    if (owner.current && !owner.current.closed) return;
    const media = new VoiceMedia({
      workletUrl,
      request,
      onState: (value) => {
        if (owner.current === media) setStatus(value);
      },
      onEvent: (event) => {
        if (owner.current === media && !media.closed)
          setEvents((previous) => [
            ...previous,
            { ...event, sessionId: id, callId: media.callId },
          ]);
      },
    });
    owner.current = media;
    setEvents([]);
    try {
      await media.prepare();
      const callId = await accept();
      await media.connect(id, callId);
    } catch (error) {
      if (!media.closed) media.fail(error);
    }
  };
  return {
    ...status,
    available: availability === "available",
    availability,
    events,
    start,
    stop: () => owner.current?.stop(),
    mute: () => owner.current?.mute(),
    active: status.state !== "idle",
  };
}
