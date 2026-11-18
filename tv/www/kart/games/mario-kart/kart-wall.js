import { kartCorners } from "./surface-contact.js";
export function kartWallLimits(track, racer, time = 0) {
  const road = track.bounds(racer.s, racer.lateral);
  if (racer.lateral > road.min + 3 && racer.lateral < road.max - 3) return road;
  const frame = track.frame(racer.s, racer.heading, racer.lateral, racer.surfaceForward, racer.surfaceNormal);
  let min = -Infinity, max = Infinity;
  for (const corner of kartCorners(racer, frame, time)) {
    const near = track.project(corner, racer.s), edge = track.bounds(near.s, near.lateral);
    const offset = near.lateral - racer.lateral;
    min = Math.max(min, edge.min + 0.15 - offset);
    max = Math.min(max, edge.max - 0.15 - offset);
  }
  if (min > max) {
    const center = (min + max) / 2;
    return { min: center, max: center };
  }
  return { min, max };
}
