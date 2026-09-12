import { decodeAudio } from "@role-cast/gpt-live";

/**
 * Run a caller-owned conversation, then await remote finalization on every exit.
 * interact(connection) owns capture, pacing, delegated work and when to finish.
 * Audio/transcript handlers receive those events; onEvent receives other events.
 */
export async function withWebSocketVoice(
  client,
  {
    session = {},
    signal,
    onAudio = () => {},
    onTranscript = () => {},
    onEvent = () => {},
  },
  interact,
) {
  const connection = await client.connectWebSocket(session, {
    signal,
    onEvent(event) {
      if (event.type === "session.output_audio.delta")
        return onAudio(decodeAudio(event.delta));
      if (
        event.type === "session.input_transcript.delta" ||
        event.type === "session.output_transcript.delta"
      )
        return onTranscript(event);
      return onEvent(event);
    },
  });
  try {
    await interact(connection);
  } finally {
    // close() releases local resources on success, error, or its finite timeout.
    await connection.close();
  }
  return connection.closed;
}
