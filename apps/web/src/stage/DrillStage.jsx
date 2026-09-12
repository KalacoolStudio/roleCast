import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sprites } from "./sprites.js";
import {
  positions,
  snapshotScene,
  StageDirector,
  activityLabels,
} from "./scene.js";
import "./stage.css";

export function CharacterSprite({ kind, character, reduced = false }) {
  const [step, setStep] = useState(0);
  const [motion, setMotion] = useState({
    walking: false,
    facing: character.facing,
  });
  const key = kind === "persona" ? character.spriteKey : kind;
  const sprite = sprites[key] || sprites["persona-01"];
  const previous = useRef({
    position: character.position,
    key,
    id: character.id,
  });
  const duration = reduced ? 0 : (character.moveMs ?? 600);
  const [x, y] = positions[character.position];
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { position: character.position, key, id: character.id };
    const changed = before.position !== character.position;
    const sameActor = before.key === key && before.id === character.id;
    const dx = x - positions[before.position][0];
    setMotion((old) => ({
      walking: sameActor && changed && duration > 0,
      facing: changed && dx !== 0 ? (dx < 0 ? "left" : "right") : old.facing,
    }));
    // Fallback for hidden/detached elements where transitionend is not dispatched.
    const timer = setTimeout(
      () => setMotion((old) => ({ ...old, walking: false })),
      duration + 32,
    );
    return () => clearTimeout(timer);
  }, [character.position, character.id, key, x, duration]);
  const walking = motion.walking && !reduced;
  useEffect(() => {
    setStep(0);
    if (!walking) return;
    const timer = setInterval(
      () => setStep((n) => (n + 1) % sprite.walk.length),
      sprite.frameMs,
    );
    return () => clearInterval(timer);
  }, [walking, sprite]);
  const frame = walking
    ? sprite.walk[step % sprite.walk.length]
    : sprite.idle[0];
  const label =
    kind === "mastermind" ? "老闆" : kind === "judge" ? "秘書" : character.name;
  return (
    <div
      className={`stage-character ${kind}`}
      data-position={character.position}
      data-sprite={key}
      data-walking={walking}
      data-frame={frame}
      data-facing={motion.facing}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          ["left", "top"].includes(event.propertyName)
        )
          setMotion((old) => ({ ...old, walking: false }));
      }}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        zIndex: Math.round(y),
        "--move-duration": `${duration}ms`,
      }}
    >
      <span
        className={`character-bubble ${character.handoff ? "handoff" : ""}`}
      >
        {character.handoff && <span aria-hidden="true">▤ </span>}
        {character.bubble}
      </span>
      <div
        className="sprite-window"
        style={{
          transform: motion.facing === "left" ? "scaleX(-1)" : undefined,
        }}
        aria-hidden="true"
      >
        <div
          className="sprite-cell"
          style={{ transform: `translateY(${sprite.footOffsets[frame]}%)` }}
        >
          <img
            src={sprite.src}
            alt=""
            draggable="false"
            style={{
              left: `${-(frame % 4) * 100}%`,
              top: `${-Math.floor(frame / 4) * 100}%`,
            }}
          />
        </div>
      </div>
      <span className="character-name">
        {label}
        <small>
          {kind === "persona"
            ? character.role
            : kind === "mastermind"
              ? "MASTERMIND"
              : "JUDGE"}
        </small>
      </span>
    </div>
  );
}
const statuses = {
  connecting: "正在連線",
  live: "即時同步",
  polling: "同步中 · 備援連線",
  reconnecting: "正在重新連線",
  offline: "連線中斷，正在重試",
  paused: "背景暫停",
  ended: "紀錄已保存",
};
export function DrillStage({ drill, events, resetKey, connection }) {
  const [scene, setScene] = useState(() => snapshotScene(drill));
  const [reduced, setReduced] = useState(
    () =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      localStorage.getItem("role-cast-reduce-motion") === "true",
  );
  const [hidden, setHidden] = useState(document.hidden);
  const director = useRef(null);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () =>
      setReduced(
        media.matches ||
          localStorage.getItem("role-cast-reduce-motion") === "true",
      );
    const visible = () => setHidden(document.hidden);
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", visible);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    const next = new StageDirector(setScene);
    director.current = next;
    next.reset(drill);
    return () => next.dispose();
    // Reset only on a new drill or a foreground/bootstrap snapshot.
  }, [drill.id, resetKey]);
  useEffect(() => {
    director.current?.update(drill, events, reduced || hidden);
  }, [drill, events, reduced, hidden]);
  const reused = drill.stage?.currentAssignment?.action === "reused";
  return (
    <section
      className={`stage-panel ${reduced || hidden ? "motion-reduced" : ""}`}
      aria-label="角色即時舞台"
    >
      <div className="stage-toolbar">
        <div>
          <span className="stage-eyebrow">LIVE STAGE</span>
          <h2>幕後，正在發生</h2>
        </div>
        <label className="motion-toggle">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => {
              const value =
                e.target.checked ||
                matchMedia("(prefers-reduced-motion: reduce)").matches;
              setReduced(value);
              localStorage.setItem("role-cast-reduce-motion", String(value));
            }}
          />
          減少動畫
        </label>
      </div>
      <div className="stage-canvas" data-phase={scene.phase}>
        <div className="stage-map">
          <span className="stage-location stage-boss-desk">調度區</span>
          <span className="stage-location stage-call-desk">通話區</span>
          <span className="stage-entrance">入口 →</span>
          <span className="stage-waiting">候場</span>
          <span className="stage-report-spot">回報位</span>
          <CharacterSprite
            kind="mastermind"
            character={scene.mastermind}
            reduced={reduced || hidden}
          />
          <CharacterSprite
            kind="judge"
            character={scene.judge}
            reduced={reduced || hidden}
          />
          {scene.persona && (
            <CharacterSprite
              kind="persona"
              character={scene.persona}
              reduced={reduced || hidden}
            />
          )}
        </div>
      </div>
      <div className="stage-caption">
        <span
          className={`connection-dot ${connection === "offline" ? "offline" : ""}`}
        />
        {statuses[connection] || "同步中"}
        {reused && ["awaiting_call", "in_call"].includes(drill.state) && (
          <span className="returning">同一位職員 · 再次上場</span>
        )}
      </div>
      <div className="stage-activity" aria-label="角色活動紀錄">
        <span className="stage-eyebrow">ACTIVITY / 動態</span>
        <p aria-live="polite">
          {drill.state === "reporting"
            ? activityLabels.report_started
            : events.length
              ? activityLabels[events.at(-1).type]
              : "角色已就位，與演練進度同步。"}
        </p>
        <ol>
          {events
            .filter((e) => !e.type.startsWith("turn_"))
            .slice(-4)
            .map((event) => (
              <li key={event.sequence}>
                <span>{String(event.sequence).padStart(2, "0")}</span>
                {activityLabels[event.type]}
                {event.persona && ` · ${event.persona.name}`}
              </li>
            ))}
        </ol>
      </div>
    </section>
  );
}
