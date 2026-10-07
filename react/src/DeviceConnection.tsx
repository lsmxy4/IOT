import { useState } from 'react';
import { Wifi } from 'lucide-react';
import { deviceAddress, DEFAULT_DEVICE_ADDRESS } from './device';

type Props = { address: string; demo: boolean; connected: boolean; busy: boolean; received: string; onConnect: (address: string) => void; onDemo: () => void };
export function DeviceConnection({ address, demo, connected, busy, received, onConnect, onDemo }: Props) {
  const [input, setInput] = useState(address);
  const [error, setError] = useState('');
  return <section className="device-connection">
    <h3><Wifi size={17}/>아두이노 연결 설정</h3>
    <p>같은 Wi-Fi의 smartfarm.local에 자동 연결합니다. 이름으로 연결되지 않으면 시리얼 모니터의 IP 주소를 입력하세요.</p>
    <form onSubmit={e => { e.preventDefault(); try { const next = deviceAddress(input); setError(''); onConnect(next); } catch (e) { setError(e instanceof Error ? e.message : '주소를 확인해주세요.'); } }}>
      <label>아두이노 주소<input value={input} onChange={e => setInput(e.target.value)} placeholder="smartfarm.local" required disabled={busy}/></label>
      <div className="connection-actions"><button className="primary" disabled={busy}>주소 저장 · 연결</button><button className="secondary" type="button" disabled={busy} onClick={() => { setInput(DEFAULT_DEVICE_ADDRESS); setError(''); onConnect(DEFAULT_DEVICE_ADDRESS); }}>자동 연결</button><button className="secondary" type="button" disabled={busy} onClick={onDemo}>데모 사용</button></div>
    </form>
    <dl><div><dt>사용 중인 주소</dt><dd>{demo ? '데모 모드 · 실제 장치 미사용' : address}</dd></div><div><dt>연결 상태</dt><dd>{demo ? '시뮬레이션' : connected ? '연결됨 · 2초마다 수신' : '연결 대기 · 자동 재시도'}</dd></div><div><dt>마지막 수신</dt><dd>{demo ? '—' : received || '아직 수신하지 않음'}</dd></div></dl>
    {error && <div className="alert" role="alert">{error}</div>}
  </section>;
}
