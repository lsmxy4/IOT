import { validSettings, type Status } from './control.ts';
export const DEFAULT_DEVICE_ADDRESS = 'http://smartfarm.local';
export function connectionPreferences(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage.getItem('farmConnectionVersion') !== 'v1') { storage.setItem('farmAddress', DEFAULT_DEVICE_ADDRESS); storage.setItem('farmMode', 'live'); storage.setItem('farmConnectionVersion', 'v1'); }
  return { address: storage.getItem('farmAddress') || DEFAULT_DEVICE_ADDRESS, demo: storage.getItem('farmMode') === 'demo' };
}
export function deviceAddress(value: string): string {
  const input = value.trim(); if (!input) throw new Error('장치 주소를 입력하세요.');
  const url = new URL(input.includes('://') ? input : `http://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('IP 또는 smartfarm.local만 입력하세요.');
  return url.origin;
}
export function isStatus(value: unknown): value is Status {
  if (!value || typeof value !== 'object') return false;
  const s = value as Status;
  return s.schema === 'smartfarm-v1' && [s.temperature, s.humidity, s.soil, s.light, s.waterLevel].every(n => n === null || (typeof n === 'number' && Number.isFinite(n)))
    && [s.auto, s.armed, s.hardwareReady, s.pumpLocked, s.waterOk].every(n => typeof n === 'boolean')
    && (s.dark === null || typeof s.dark === 'boolean')
    && [s.pumpSeconds, s.cooldownSeconds, s.uptime].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    && !!s.outputs && [s.outputs.pump, s.outputs.fan, s.outputs.light].every(n => typeof n === 'boolean')
    && !!s.sensors && [s.sensors.dht, s.sensors.soil, s.sensors.light, s.sensors.water].every(n => typeof n === 'boolean')
    && !!s.capabilities && [s.capabilities.soil, s.capabilities.lightAnalog, s.capabilities.waterAnalog].every(n => typeof n === 'boolean')
    && !!s.raw && [s.raw.soil, s.raw.light, s.raw.water].every(n => n === null || (typeof n === 'number' && Number.isFinite(n)))
    && validSettings(s.settings);
}
export async function requestDevice(address: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Status> {
  let response: Response;
  try { response = await fetch(`${deviceAddress(address)}/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ?? AbortSignal.timeout(3500), cache: 'no-store' }); }
  catch { throw new Error('장치 연결 실패 · 같은 Wi-Fi, 보드 전원과 주소를 확인하세요.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`요청 실패 (${response.status}): ${result?.error || '응답 없음'}`);
  if (!isStatus(result)) throw new Error('스마트팜 펌웨어가 필요합니다. 새 코드를 보드에 업로드하세요.');
  return result;
}
