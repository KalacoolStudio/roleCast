export const isTerminal = (state) =>
  ["completed", "failed", "interrupted"].includes(state);

// Read-only transport. This module never sends a command or starts a model job.
export function connectDrill({
  id,
  getSnapshot,
  getEvents,
  onSnapshot,
  onEvent,
  onReset,
  onStatus,
  source = (url) => new EventSource(url),
  visibility = document,
}) {
  let stopped = false,
    generation = 0,
    stream,
    pollTimer,
    reconnectTimer;
  let sequence = null,
    revision = -1,
    current,
    catching = null;
  const active = (g) => !stopped && g === generation;
  const clear = () => {
    stream?.close();
    stream = null;
    clearTimeout(pollTimer);
    clearTimeout(reconnectTimer);
  };
  const publish = (snapshot) => {
    if (stopped || snapshot.id !== id) return;
    const nextRevision = snapshot.stage?.revision ?? 0;
    if (nextRevision < revision) return;
    revision = nextRevision;
    current = snapshot;
    onSnapshot(snapshot);
    if (isTerminal(snapshot.state)) {
      clear();
      onStatus("ended");
    }
  };
  const event = (value) => {
    if (value.drillId !== id || value.sequence <= sequence) return;
    if (value.sequence !== sequence + 1) throw new Error("Event gap");
    sequence = value.sequence;
    onEvent(value);
  };
  const catchUp = async (g) => {
    if (catching === g || !active(g)) return;
    catching = g;
    try {
      const snapshot = await getSnapshot();
      if (!active(g)) return;
      if (snapshot.stage && sequence !== null) {
        let page;
        do {
          page = await getEvents(sequence);
          if (!active(g)) return;
          for (const value of page.events) event(value);
        } while (page.hasMore);
      }
      publish(snapshot);
      if (!stream && !isTerminal(snapshot.state)) onStatus("polling");
    } catch (error) {
      if (active(g)) {
        onStatus("offline");
        if (error.code === "CURSOR_AHEAD") {
          catching = false;
          return bootstrap();
        }
      }
    } finally {
      catching = false;
      if (active(g) && !stream && !isTerminal(current?.state))
        pollTimer = setTimeout(() => catchUp(g), 1000);
    }
  };
  const open = (g) => {
    if (!active(g) || !current?.stage || isTerminal(current.state)) return;
    const connection = source(
      `/api/drills/${encodeURIComponent(id)}/events/stream?after=${sequence}`,
    );
    stream = connection;
    connection.onopen = () => {
      if (!active(g) || stream !== connection) return;
      clearTimeout(pollTimer);
      onStatus("live");
    };
    const fail = () => {
      if (!active(g) || stream !== connection) return;
      connection.close();
      stream = null;
      onStatus("reconnecting");
      clearTimeout(pollTimer);
      catchUp(g);
      reconnectTimer = setTimeout(() => open(g), 4000);
    };
    connection.onerror = fail;
    connection.addEventListener("stage", (message) => {
      if (!active(g) || stream !== connection) return;
      try {
        event(JSON.parse(message.data));
      } catch {
        fail();
      }
    });
    connection.addEventListener("snapshot", (message) => {
      if (!active(g) || stream !== connection) return;
      try {
        const snapshot = JSON.parse(message.data);
        if (snapshot.stage.lastEventSequence > sequence) {
          fail();
          return;
        }
        publish(snapshot);
      } catch {
        fail();
      }
    });
  };
  const bootstrap = async () => {
    clear();
    const g = ++generation;
    sequence = null;
    revision = -1;
    catching = false;
    onStatus("connecting");
    try {
      const snapshot = await getSnapshot();
      if (!active(g)) return;
      sequence = snapshot.stage?.lastEventSequence ?? 0;
      onReset();
      publish(snapshot);
      if (!isTerminal(snapshot.state)) {
        if (snapshot.stage) open(g);
        else pollTimer = setTimeout(() => catchUp(g), 500);
      }
    } catch {
      if (active(g)) {
        onStatus("offline");
        pollTimer = setTimeout(bootstrap, 1500);
      }
    }
  };
  const visible = () => {
    if (visibility.hidden) {
      ++generation;
      clear();
      onStatus("paused");
    } else bootstrap();
  };
  visibility.addEventListener("visibilitychange", visible);
  bootstrap();
  return {
    acceptSnapshot: publish,
    close() {
      stopped = true;
      ++generation;
      clear();
      visibility.removeEventListener("visibilitychange", visible);
    },
  };
}
