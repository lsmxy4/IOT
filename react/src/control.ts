export type Settings = { soilStart: number; soilStop: number; fanTemperature: number; fanHumidity: number; lightThreshold: number; pumpMaxSeconds: number; pumpCooldownSeconds: number; waterMin: number; soilDry: number; soilWet: number; soilCalibrated: boolean };
export type Outputs = { pump: boolean; fan: boolean; light: boolean };
export type Status = {
  schema: 'smartfarm-v1'; temperature: number | null; humidity: number | null;
  soil: number | null; light: number | null; dark: boolean | null; waterOk: boolean; waterLevel: number | null;
  auto: boolean; armed: boolean; hardwareReady: boolean; pumpReady?: boolean; fanReady?: boolean; pumpLocked: boolean;
  pumpSeconds: number; cooldownSeconds: number; uptime: number;
  outputs: Outputs; settings: Settings;
  sensors: { dht: boolean; soil: boolean; light: boolean; water: boolean };
  capabilities: { soil: boolean; lightAnalog: boolean; waterAnalog: boolean };
  raw: { soil: number | null; light: number | null; water: number | null };
};
export const defaults: Settings = { soilStart: 40, soilStop: 55, fanTemperature: 28, fanHumidity: 70, lightThreshold: 2, pumpMaxSeconds: 10, pumpCooldownSeconds: 60, waterMin: 20, soilDry: 800, soilWet: 300, soilCalibrated: false };
export const off: Outputs = { pump: false, fan: false, light: false };
export function validSettings(s: Settings) {
  return !!s && Object.entries(s).filter(([key]) => key !== 'soilCalibrated').every(([,v]) => typeof v === 'number' && Number.isFinite(v)) && typeof s.soilCalibrated === 'boolean' && s.waterMin >= 5 && s.waterMin <= 80 && [s.soilDry, s.soilWet].every(n => Number.isInteger(n) && n >= 1 && n <= 1022) && Math.abs(s.soilDry - s.soilWet) >= 50
    && s.soilStart >= 5 && s.soilStop <= 95 && s.soilStop - s.soilStart >= 5
    && s.fanTemperature >= 10 && s.fanTemperature <= 45 && s.fanHumidity >= 5 && s.fanHumidity <= 95
    && s.lightThreshold >= 0.1 && s.lightThreshold <= 90
    && Number.isInteger(s.pumpMaxSeconds) && s.pumpMaxSeconds >= 1 && s.pumpMaxSeconds <= 30
    && Number.isInteger(s.pumpCooldownSeconds) && s.pumpCooldownSeconds >= 10 && s.pumpCooldownSeconds <= 3600;
}
export function controlledOutputs(s: Status): Outputs {
  if (!s.armed) return { ...off, light: !s.auto && s.outputs.light };
  let { pump, fan, light } = s.outputs;
  if (s.auto) {
    pump = s.capabilities.soil && s.soil !== null && (s.soil < s.settings.soilStart || (pump && s.soil < s.settings.soilStop));
    fan = s.temperature !== null && s.humidity !== null && (s.temperature >= s.settings.fanTemperature || s.humidity >= s.settings.fanHumidity || (fan && (s.temperature > s.settings.fanTemperature - 1 || s.humidity > s.settings.fanHumidity - 3)));
    light = s.capabilities.lightAnalog ? s.light !== null && (s.light < s.settings.lightThreshold || (light && s.light < s.settings.lightThreshold + 0.5)) : s.dark === true;
  }
  if (!(s.pumpReady ?? s.hardwareReady) || !s.sensors.water || !s.waterOk || s.pumpLocked || s.cooldownSeconds > 0 || s.pumpSeconds >= s.settings.pumpMaxSeconds || (s.capabilities.soil && !s.sensors.soil)) pump = false;
  if (!(s.fanReady ?? s.hardwareReady) || !s.sensors.dht) fan = false;
  if (s.auto && !s.sensors.light) light = false;
  return { pump, fan, light };
}
export function demoStatus(): Status {
  return { schema: 'smartfarm-v1', temperature: 25.4, humidity: 62, soil: 38, light: null, dark: false, waterOk: true, waterLevel: 75,
    auto: true, armed: false, hardwareReady: true, pumpLocked: false, pumpSeconds: 0, cooldownSeconds: 0, uptime: 0,
    outputs: { ...off }, settings: { ...defaults, soilCalibrated: true }, sensors: { dht: true, soil: true, light: true, water: true },
    capabilities: { soil: true, lightAnalog: false, waterAnalog: true }, raw: { soil: 620, light: null, water: null } };
}
export function demoTick(s: Status): Status {
  const next = { ...s, uptime: s.uptime + 1, pumpSeconds: s.outputs.pump ? s.pumpSeconds + 1 : 0, cooldownSeconds: Math.max(0, s.cooldownSeconds - 1) };
  if (s.outputs.pump && next.pumpSeconds >= s.settings.pumpMaxSeconds) next.pumpLocked = true;
  next.outputs = controlledOutputs(next);
  if (s.outputs.pump && !next.outputs.pump) next.cooldownSeconds = s.settings.pumpCooldownSeconds;
  return next;
}
export function alerts(s: Status): string[] {
  const messages: string[] = [];
  if (!(s.pumpReady ?? s.hardwareReady)) messages.push('펌프 구동 모듈 설정 필요');
  if (!(s.fanReady ?? s.hardwareReady)) messages.push('팬 구동 모듈 설정 필요');
  if (!s.sensors.water || !s.waterOk) messages.push('물 부족 또는 수위 입력 이상 · 펌프 작동 금지');
  if (s.pumpLocked) messages.push('급수 시간 초과 · 배관과 토양 상태 확인 후 잠금을 해제하세요');
  if (!s.sensors.dht) messages.push('온습도 센서 오류 · 팬 정지');
  if (s.capabilities.soil && !s.sensors.soil) messages.push('토양 센서 미보정 또는 오류 · 펌프 작동 금지');
  if (!s.sensors.light) messages.push(s.auto ? '조도 센서 오류 · 자동 LED 정지' : '조도 센서 오류 · LED 수동 제어 가능');
  if (s.temperature !== null && s.temperature >= s.settings.fanTemperature + 5) messages.push('높은 온도 · 재배 환경을 확인하세요');
  return messages;
}

