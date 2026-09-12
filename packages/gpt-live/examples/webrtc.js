/**
 * Use control for an existing WebRTC session, detaching on every exit.
 * The caller keeps the ID returned by createWebRtcSession before attaching.
 * Call control.close() explicitly to end the remote session, when appropriate.
 */
export async function withSideband(client, sessionId, options, useControl) {
  const control = await client.attach(sessionId, options);
  try {
    return await useControl(control);
  } finally {
    control.disconnect();
  }
}
