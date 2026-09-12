import { GptLiveError } from "./errors.js";

export function encodeAudio(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.byteLength ||
    bytes.byteLength % 2
  )
    throw new GptLiveError("LIVE_INPUT");
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64",
  );
}

/** Decode a base64 PCM16LE payload (event.delta or reflected event.audio). */
export function decodeAudio(base64) {
  if (
    typeof base64 !== "string" ||
    !base64.length ||
    base64.length % 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64,
    )
  )
    throw new GptLiveError("LIVE_INPUT");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length % 2 || bytes.toString("base64") !== base64)
    throw new GptLiveError("LIVE_INPUT");
  return bytes;
}
