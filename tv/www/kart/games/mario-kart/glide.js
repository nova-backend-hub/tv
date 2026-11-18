export function stepSourceGlide(height, velocity, speed, dt) {
  const terminal = -Math.max(10, Math.abs(speed) * 0.42);
  const response = 5;
  const decay = Math.exp(-response * dt);
  return {
    height: height + terminal * dt + (velocity - terminal) * (1 - decay) / response,
    velocity: terminal + (velocity - terminal) * decay
  };
}
