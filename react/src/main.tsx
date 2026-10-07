import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowUpRight, Bell, ChevronRight, CircleHelp, Clock3, Download, Droplets, Fan, FlaskConical, Gauge, Leaf, Lightbulb, PlugZap, Power, Settings2, ShieldCheck, Sprout, Sun, Thermometer, Waves, Wifi, X } from 'lucide-react';
import { alerts, controlledOutputs, defaults, demoStatus, demoTick, off, validSettings, type Settings, type Status, type Outputs } from './control';
import { connectionPreferences, requestDevice } from './device';
import { DeviceConnection } from './DeviceConnection';
import './styles.css';

const saved = connectionPreferences(localStorage);
type RecordRow = { at: string; temperature: number | null; humidity: number | null; soil: number | null; water: number | null; light: string; pump: boolean; fan: boolean; lamp: boolean };
const fields: { key: keyof Omit<Settings, 'soilCalibrated'>; label: string; unit: string; min: number; max: number; note: string }[] = [
  { key: 'soilStart', label: '급수 시작', unit: '%', min: 5, max: 90, note: '이 값 미만이면 자동 급수' },
  { key: 'soilStop', label: '급수 종료', unit: '%', min: 10, max: 95, note: '시작보다 5% 이상 높게 설정' },
  { key: 'fanTemperature', label: '환기 시작 온도', unit: '°C', min: 10, max: 45, note: '복귀 여유 1°C' },
  { key: 'fanHumidity', label: '환기 시작 습도', unit: '%', min: 30, max: 95, note: '온도 또는 습도가 높으면 환기' },
  { key: 'lightThreshold', label: 'LED 점등 밝기', unit: '%', min: 0.1, max: 90, note: '이 값 미만 ON · 기준보다 0.5%p 밝아지면 OFF' },
  { key: 'waterMin', label: '급수 가능 최소 수위', unit: '%', min: 5, max: 80, note: 'Grove 센서 측정 길이 기준' },
  { key: 'pumpMaxSeconds', label: '펌프 최대 작동 시간', unit: '초', min: 1, max: 30, note: '초과 시 잠금 · 직접 해제 필요' },
  { key: 'pumpCooldownSeconds', label: '급수 후 대기 시간', unit: '초', min: 10, max: 3600, note: '물이 토양에 스며들 시간을 확보' },
];
const value = (n: number | null | undefined, digits = 0) => n == null ? '—' : n.toFixed(digits);
function App() {
  const [demo, setDemo] = useState(saved.demo);
  const [address, setAddress] = useState(saved.address);
  const [data, setData] = useState<Status | null>(null);
  const [connected, setConnected] = useState(false);
  const [received, setReceived] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState<'dashboard' | 'logs' | 'settings'>('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<Settings>({ ...defaults });
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [events, setEvents] = useState<{ at: string; text: string }[]>([]);
  const revision = useRef(0);
  const pending = useRef(false);
  const previousAlerts = useRef('');
  
  const addEvent = (text: string) => setEvents(items => [{ at: new Date().toLocaleTimeString('ko-KR'), text }, ...items].slice(0, 100));
  function receive(next: Status) { setData(next); setConnected(true); setReceived(new Date().toLocaleTimeString('ko-KR')); setConnectionError(''); }
  useEffect(() => {
    setData(null); setConnected(false); setReceived(''); setConnectionError(''); setError(''); setRows([]); previousAlerts.current = '';
    if (demo) { setData(demoStatus()); const timer = setInterval(() => setData(s => s ? demoTick(s) : demoStatus()), 1000); return () => clearInterval(timer); }
    let disposed = false; let timer: ReturnType<typeof setTimeout>; let controller: AbortController;
    async function poll() {
      if (pending.current) { timer = setTimeout(poll, 250); return; }
      const version = revision.current; controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try { const result = await requestDevice(address, 'status', undefined, controller.signal); if (!disposed && version === revision.current) receive(result); }
      catch (e) { if (!disposed && version === revision.current) { setConnected(false); setConnectionError(e instanceof Error ? e.message : '연결 실패'); } }
      finally { clearTimeout(timeout); if (!disposed) timer = setTimeout(poll, 2000); }
    }
    void poll(); return () => { disposed = true; controller?.abort(); clearTimeout(timer); };
  }, [demo, address, retry]);
  useEffect(() => {
    if (!data || (!demo && !connected)) return;
    const row: RecordRow = { at: new Date().toISOString(), temperature: data.temperature, humidity: data.humidity, soil: data.soil, water: data.waterLevel, light: data.dark === null ? '알 수 없음' : data.dark ? '어두움' : '밝음', pump: data.outputs.pump, fan: data.outputs.fan, lamp: data.outputs.light };
    setRows(items => [...items.slice(-299), row]);
    const current = alerts(data).join('|'); if (current !== previousAlerts.current) { if (current) addEvent(current.replaceAll('|', ' / ')); previousAlerts.current = current; }
  }, [data?.uptime, connected, demo]);
  function connect(next: string) { if (pending.current) return; revision.current++; setAddress(next); setDemo(false); setRetry(n => n + 1); localStorage.setItem('farmAddress', next); localStorage.setItem('farmMode', 'live'); addEvent(`연결 요청 · ${next}`); }
  function useDemo() { if (pending.current) return; revision.current++; setDemo(true); localStorage.setItem('farmMode', 'demo'); addEvent('데모 모드 시작 · 실제 장치에 명령을 보내지 않습니다'); }
  async function command(path: string, body: unknown, update: (s: Status) => Status, message: string) {
    if (pending.current) return; pending.current = true; revision.current++; setBusy(true); setError(''); setNotice('');
    try {
      if (demo) setData(s => { if (!s) return s; const next = update(s); const outputs = controlledOutputs(next); return { ...next, outputs, cooldownSeconds: s.outputs.pump && !outputs.pump ? s.settings.pumpCooldownSeconds : next.cooldownSeconds, pumpSeconds: outputs.pump && s.outputs.pump ? s.pumpSeconds : 0 }; });
      else receive(await requestDevice(address, path, body));
      setNotice(message); addEvent(message); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '요청 실패'); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  const disabled = busy || !data || (!demo && !connected);
  const warnings = data ? alerts(data) : [];
  const openSettings = () => { setDraft({ ...(data?.settings ?? defaults) }); setSettingsOpen(true); setError(''); };
  async function saveSettings() { if (!validSettings(draft)) { setError('설정 범위를 확인하세요. 급수 종료는 시작보다 5% 이상 높아야 하며 건조·습윤 ADC 값은 50 이상 차이가 나야 합니다.'); return; } if (await command('settings', draft, s => ({ ...s, settings: { ...draft } }), demo ? '데모 설정 저장 완료' : '보드에 설정 저장 완료')) setSettingsOpen(false); }
  async function stop() { await command('stop', {}, s => ({ ...s, armed: false, outputs: { ...off } }), '전체 출력 정지 · 다시 활성화해야 작동합니다'); }
  function exportCsv() {
    const csv = '\uFEFF' + ['시각,온도C,습도%,토양수분%,수위%,밝기,펌프,팬,LED', ...rows.map(r => [r.at, r.temperature, r.humidity, r.soil, r.water, r.light, r.pump, r.fan, r.lamp].join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = `smartfarm-${demo ? 'demo' : 'live'}-${Date.now()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const connection = <DeviceConnection key={address} address={address} demo={demo} connected={connected} busy={busy} received={received} onConnect={connect} onDemo={useDemo}/>;
  const metrics = [
    { label: '현재 온도', number: value(data?.temperature, 1), unit: '°C', icon: Thermometer, tone: 'peach', detail: `환기 기준 ${data?.settings.fanTemperature ?? 28}°C`, progress: (data?.temperature ?? 0) * 2 },
    { label: '공기 습도', number: value(data?.humidity), unit: '%', icon: Droplets, tone: 'blue', detail: `환기 기준 ${data?.settings.fanHumidity ?? 70}%`, progress: data?.humidity ?? 0 },
    { label: '토양 수분', number: value(data?.soil), unit: '%', icon: Sprout, tone: 'green', detail: data?.sensors.soil ? `급수 시작 ${data.settings.soilStart}% · 상대 수분` : `보정 필요 · ADC ${data?.raw.soil ?? '—'}`, progress: data?.soil ?? 0 },
    { label: '주변 밝기', number: !data || data.dark === null ? '—' : data.dark ? '어두움' : '밝음', unit: '', icon: Sun, tone: 'gold', detail: `상대 밝기 ${value(data?.light, 1)}% · ADC ${data?.raw.light ?? '—'}`, progress: data?.light ?? 0 },
    { label: '물통 수위', number: value(data?.waterLevel), unit: '%', icon: Waves, tone: 'aqua', detail: data?.waterOk ? '급수 가능 · 센서 감지 높이 기준' : '물 보충 / 센서 연결 확인', progress: data?.waterLevel ?? 0 },
  ];
  const devices = [ { key: 'pump' as const, title: '물 펌프', sub: '토양 수분에 맞춰 필요한 만큼', icon: Droplets, tone: 'blue' }, { key: 'fan' as const, title: '환기 팬', sub: '온도와 습도를 쾌적하게', icon: Fan, tone: 'green' }, { key: 'light' as const, title: '조명 LED', sub: '어두울 때 켜지는 일반 표시등', icon: Lightbulb, tone: 'gold' } ];
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={() => setPage('dashboard')}><span><Sprout size={25}/></span>leafy<span className="brand-dot">.</span></a><div className="farm-select"><div className="farm-mark"><Leaf size={19}/></div><div><strong>나의 스마트팜</strong><small>MY FIRST GREENHOUSE</small></div><ChevronRight size={15}/></div><span className="nav-caption">WORKSPACE</span><nav>{([{ key: 'dashboard', title: '대시보드', icon: Gauge }, { key: 'settings', title: '환경 설정', icon: Settings2 }, { key: 'logs', title: '데이터 기록', icon: Activity }] as const).map(({key, title, icon: Icon}) => <button className={page === key ? 'active' : ''} key={key} aria-label={title} onClick={() => setPage(key)}><Icon size={19}/><span>{title}</span>{page === key && <i/>}</button>)}</nav><div className="sidebar-note"><Sprout size={26}/><strong>작은 변화, 건강한 성장</strong><p>센서로 살피고<br/>필요한 만큼 돌봐주세요.</p><span>GROW WITH CARE ↗</span></div><div className="sidebar-footer"><span className="avatar">G</span><div><strong>나의 재배 공간</strong><small>ESP32 · SMART FARM</small></div></div></aside>
    <main><header className="topbar"><div>워크스페이스 <ChevronRight size={12}/><strong>{page === 'dashboard' ? '대시보드' : page === 'settings' ? '환경 설정' : '데이터 기록'}</strong></div><div><span className={`connection-state ${demo || connected ? 'ok' : ''}`}><i/>{demo ? '데모 모드' : connected ? '장치 연결됨' : '연결 대기'}</span><span className="bell"><Bell size={18}/>{warnings.length > 0 && <b/>}</span><span className="avatar">G</span></div></header>
    <div className="content"><nav className="mobile-nav" aria-label="페이지 이동"><button onClick={()=>setPage('dashboard')} className={page==='dashboard'?'active':''}>대시보드</button><button onClick={()=>setPage('settings')} className={page==='settings'?'active':''}>환경 설정</button><button onClick={()=>setPage('logs')} className={page==='logs'?'active':''}>기록</button></nav><section className="page-title"><div><div className="eyebrow">A LITTLE CARE. A LITTLE GREENER.</div><h1>{page === 'dashboard' ? '오늘도, 초록에 가까이.' : page === 'settings' ? '식물에게 맞는 환경.' : '성장의 흐름을 살펴보세요.'}</h1><p>센서 데이터로 재배 환경을 살피고, 물과 바람과 빛을 관리하세요.</p></div><button className="secondary" onClick={openSettings}><Settings2 size={16}/>제어 기준 설정</button></section>
    {error && <div className="alert error" role="alert">{error}<button aria-label="오류 닫기" onClick={() => setError('')}><X size={16}/></button></div>}
    {notice && <div className="alert success" role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {!demo && !connected && <div className="alert" role="status"><Wifi size={17}/><span>{connectionError || 'smartfarm.local에 연결하고 있습니다.'}{received && ` 마지막 수신 ${received} · 아래 값은 이전 기록입니다.`}</span><button onClick={() => setPage('settings')}>연결 설정 →</button></div>}
    {page === 'dashboard' && <>
      <section className="hero"><div className="hero-copy"><span className="hero-tag"><Leaf size={13}/> CONNECTED GREENHOUSE</span><h2>식물이 자라는 순간을,<br/>더 세심하게.</h2><p>작은 텃밭부터 시작하는 스마트한 재배.<br/>온도·수분·빛을 한눈에 확인하세요.</p><span className="hero-chip"><i/>{!data ? '센서 연결을 기다리고 있어요' : !data.armed ? (data.outputs.light ? '수동 LED가 켜져 있어요 · 모터는 정지 상태예요' : '모니터링 중 · 출력은 정지 상태예요') : data.auto ? '센서 기반 자동 제어가 켜져 있어요' : '수동으로 재배 환경을 관리하고 있어요'}</span></div><div className="greenhouse" aria-hidden="true"><div className="sun-orb"/><div className="glass-house"><div className="roof-line"/><div className="back-window"/><div className="grow-bar"/><div className="art-fan"><Fan size={39}/></div><div className="plant-bed">{Array.from({length:6}, (_,i) => <div className="art-plant" key={i}><i/><i/><i/><b/></div>)}</div><div className="water-tank"><div/><Droplets size={20}/></div><div className="irrigation-pipe"/></div><div className="art-label"><span className="green-dot"/> A SPACE TO GROW <Sprout size={16}/></div></div></section>
      <div className="section-heading"><h2>실시간 재배 환경 <span>LIVE OVERVIEW</span></h2><span className="muted">{demo ? '시뮬레이션 데이터' : received ? `최근 수신 ${received}` : '수신 대기'}</span></div>
      <section className="metrics">{metrics.map(({label,number,unit,icon:Icon,tone,detail,progress}) => <article className="metric" key={label}><div className="metric-head"><span>{label}</span><span className={`icon-bg ${tone}`}><Icon size={20}/></span></div><div className={`metric-number ${unit ? '' : 'word'}`}>{number}<small>{unit}</small></div><p>{detail}</p><div className={`meter ${tone}`}><i style={{width:`${Math.min(100,Math.max(0,progress))}%`}}/></div></article>)}</section>
      <div className="dashboard-grid"><section className="panel device-panel"><div className="panel-heading"><h2>장치 제어 <span className="count">3</span></h2><div className="segmented">{[true,false].map(auto => <button key={String(auto)} disabled={disabled} className={data?.auto === auto ? 'selected' : ''} onClick={() => void command('mode',{auto},s => ({...s,auto, outputs:{...off}}),`${auto?'자동':'수동'} 모드로 전환`)}>{auto ? '자동 모드' : '수동 모드'}</button>)}</div></div><p className="panel-sub">{data?.auto ? '설정한 기준에 따라 급수·환기·조명을 제어합니다.' : 'LED는 바로 켜고 끌 수 있습니다. 펌프·팬은 출력 활성화 후 제어합니다.'}</p><div className="device-cards">{devices.map(({key,title,sub,icon:Icon,tone}) => {const on = data?.outputs[key] ?? false; const blocked = key !== 'light' && !data?.hardwareReady; return <article className={`device-card ${on?'is-on':''}`} key={key}><div className="device-top"><span className={`device-symbol ${tone}`}><Icon size={30} className={key==='fan' && on ? 'spin':''}/></span><span className={`state-pill ${on?'on':''}`}>{blocked ? '모듈 설정 필요' : on ? '작동 중' : '대기'}</span></div><h3>{title}</h3><p>{sub}</p><div className="device-control"><strong>{on ? 'ON' : 'OFF'}</strong><button role="switch" aria-label={`${title} 제어`} aria-checked={on} disabled={disabled || data?.auto || (key !== 'light' && !data?.armed) || blocked || (key === 'pump' && (!data?.waterOk || data?.pumpLocked || !!data?.cooldownSeconds || !data?.sensors.soil))} className={`switch ${on?'checked':''}`} onClick={() => void command('outputs', {[key]:!on}, s => ({...s,outputs:{...s.outputs,[key]:!on}}),`${title} ${on?'OFF':'ON'} 요청 처리`)}><i/></button></div></article>; })}</div><div className="output-toolbar"><span><ShieldCheck size={16}/>{data?.armed ? '출력 활성화됨' : '모터 출력 비활성화 · 수동 LED 사용 가능'}</span><button className="secondary" disabled={disabled || !!data?.armed} onClick={() => void command('arm',{armed:true}, s => ({...s,armed:true}), '출력 활성화 · 센서 조건에 따라 작동합니다')}>출력 활성화</button><button className="danger" disabled={busy || (!demo && !connected)} onClick={() => void stop()}><Power size={14}/>전체 정지</button></div><small className="footnote">화면은 제어 명령 상태입니다. 실제 모터 회전·물 흐름을 측정하지 않습니다.</small></section>
      <section className="panel irrigation"><div className="panel-heading"><h2>안심 급수</h2><span className="icon-bg blue"><Droplets size={18}/></span></div><div className="tank-display"><div className="tank-icon"><div style={{height:`${data?.waterLevel ?? 0}%`}}/><Waves size={30}/></div><div><span>물통 수위</span><strong>{value(data?.waterLevel)}<small>%</small></strong><p>{data?.waterOk ? '급수에 충분한 수위' : '수위 확인 필요'}</p></div></div><div className="stat-line"><span>펌프 작동 시간</span><strong>{data?.pumpSeconds ?? 0} / {data?.settings.pumpMaxSeconds ?? 10}초</strong></div><div className="pump-track"><i style={{width:`${Math.min(100,(data?.pumpSeconds??0)/(data?.settings.pumpMaxSeconds??10)*100)}%`}}/></div><div className="stat-line"><span>다음 급수까지</span><strong>{data?.cooldownSeconds ? `${data.cooldownSeconds}초 대기` : '대기 시간 없음'}</strong></div><div className="safety-note"><ShieldCheck size={16}/><span>물 부족 시 정지 · 연속 급수 제한</span></div>{data?.pumpLocked && <button className="secondary full" disabled={disabled || data.waterOk === false || data.armed} onClick={() => void command('pump/reset',{},s=>({...s,pumpLocked:false}), '펌프 잠금 해제')}>전체 정지 후 급수 잠금 해제</button>}</section></div>
      <div className="dashboard-grid lower-grid"><section className="panel"><div className="panel-heading"><h2>토양 수분 추이</h2><span className="muted">최근 {Math.min(rows.length,40)}개 기록 · 상대 수분 %</span></div><div className="chart"><div className="chart-axis"><span>100%</span><span>50%</span><span>0%</span></div><div className="chart-bars"><div className="threshold-line" style={{bottom:`${data?.settings.soilStart??40}%`}}><span>급수 기준</span></div>{rows.slice(-40).map((r,i)=><div title={`${new Date(r.at).toLocaleTimeString()} · ${r.soil ?? '미측정'}%`} key={`${r.at}-${i}`} style={{height:r.soil === null?'2px':`${Math.max(2,r.soil)}%`}} className={r.soil===null?'unknown':''}/>)}</div></div><div className="chart-labels"><span>이전</span><span>지금</span></div></section><section className="panel"><div className="panel-heading"><h2>환경 알림</h2><span className="count">{warnings.length}</span></div><div className="alert-list">{!data?<p className="empty">센서 연결 후 알림이 표시됩니다.</p>:warnings.length ? warnings.map(w=><div className="warning-item" key={w}><span/><p>{w}</p></div>):<div className="all-clear"><ShieldCheck size={26}/><strong>확인된 경고가 없어요</strong><p>현재 센서값을 기준으로 표시합니다.</p></div>}</div><button className="text-button" onClick={()=>setPage('logs')}>전체 활동 기록 보기 <ArrowUpRight size={14}/></button></section></div>
    </>}
    {page === 'settings' && <><div className="settings-grid">{connection}<section className="panel"><div className="panel-heading"><h2>현재 제어 기준</h2><button className="secondary" onClick={openSettings}>수정</button></div>{fields.map(f=><div className="stat-line" key={f.key}><span>{f.label}</span><strong>{data?.settings[f.key] ?? '—'} {f.unit}</strong></div>)}<div className="safety-note"><Sun size={17}/>두 다리 LDR + 10kΩ · 밝기는 상대값이며 lux가 아닙니다.</div></section></div><section className="panel hardware-info"><h2>현재 하드웨어 구성</h2><p>DHT11 · 토양 습도 모듈(AO) · LDR 아날로그(P35 + 10kΩ) · Grove Water Level Sensor(I²C) · 펌프 · 팬 · 일반 LED</p><p>펌프·팬의 전압 및 구동 모듈이 아직 정해지지 않았습니다. hardware_config.h에서 모듈 설정을 완료하기 전에는 모터 출력을 사용할 수 없습니다. 일반 LED는 생육용 조명을 대신하지 않습니다.</p><p>조도: {value(data?.light, 1)}% · 조도 ADC: {data?.raw.light ?? "—"} · 토양 ADC 원시값: <strong>{data?.raw.soil ?? '—'}</strong> · 건조/습윤 값을 실측한 후 보정하세요. Grove 수위 %는 센서의 감지 높이 비율이며 물통 부피 비율이 아닙니다.</p></section></>}
    {page === 'logs' && <><div className="section-heading"><h2>수신 데이터</h2><button className="secondary" disabled={!rows.length} onClick={exportCsv}><Download size={15}/>CSV 내보내기</button></div><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>수신 시각</th><th>온도</th><th>습도</th><th>토양 수분</th><th>수위</th><th>밝기</th><th>펌프 / 팬 / LED</th></tr></thead><tbody>{rows.slice().reverse().map((r,i)=><tr key={`${r.at}-${i}`}><td>{new Date(r.at).toLocaleTimeString('ko-KR')}</td><td>{value(r.temperature,1)}°C</td><td>{value(r.humidity)}%</td><td>{value(r.soil)}%</td><td>{value(r.water)}%</td><td>{r.light}</td><td>{[r.pump,r.fan,r.lamp].map(n=>n?'ON':'OFF').join(' / ')}</td></tr>)}</tbody></table>{!rows.length&&<p className="empty">아직 기록이 없습니다.</p>}</div><p className="footnote">현재 브라우저 세션의 최근 300개 기록입니다. 새로고침·장치 전환 시 초기화됩니다.</p></section><section className="panel event-panel"><h2>활동 기록</h2>{events.length?events.map((e,i)=><div className="event" key={i}><time>{e.at}</time><span>{e.text}</span></div>):<p className="empty">아직 활동이 없습니다.</p>}</section></>}
    {page === 'dashboard' && <div className="connection-strip"><span><Wifi size={17}/>{demo?'데모 장치':address}</span><span>{demo?'실제 장치와 분리된 시뮬레이션':connected?'센서 연결 정상':'새 스마트팜 펌웨어를 업로드해주세요'}</span><button onClick={()=>setPage('settings')}>연결 설정 <ChevronRight size={13}/></button></div>}
    {demo && <details className="simulator"><summary><FlaskConical size={15}/>데모 센서 조작</summary><div className="sim-controls">{([{key:'temperature',name:'온도',min:10,max:45},{key:'humidity',name:'습도',min:20,max:95},{key:'soil',name:'토양 수분',min:0,max:100},{key:'waterLevel',name:'수위',min:0,max:100}] as const).map(f=><label key={f.key}>{f.name} {data?.[f.key]}<input type="range" min={f.min} max={f.max} value={data?.[f.key]??0} onChange={e=>{const n=Number(e.target.value);setData(s=>s?{...s,[f.key]:n,...(f.key==='waterLevel'?{waterOk:n>=s.settings.waterMin}:{})}:s);}}/></label>)}<button className="secondary" onClick={()=>setData(s=>s?{...s,dark:!s.dark}:s)}>밝기 전환</button><button className="secondary" onClick={()=>setData(s=>s?{...s,sensors:{...s.sensors,dht:!s.sensors.dht}}:s)}>DHT 오류 전환</button></div></details>}
    <footer><span><Sprout size={14}/> LEAFY · SMART FARM SYSTEM</span><span>ESP32 + React TypeScript · {demo?'DEMO':'LIVE'}</span></footer>
    </div></main>
    {settingsOpen && <div className="modal-backdrop" onClick={()=>setSettingsOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">ENVIRONMENT SETTINGS</span><h2 id="settings-title">제어 기준 설정</h2></div><button className="icon-button" aria-label="설정 닫기" onClick={()=>setSettingsOpen(false)}><X size={22}/></button></div><p className="panel-sub">{demo?'데모에만 적용합니다.':'저장하면 아두이노에 전송하고 보드 재부팅 후에도 유지합니다.'}</p><div className="form-fields">{fields.map(f=><label className="setting-field" key={f.key}><div><strong>{f.label}</strong><small>{f.note}</small></div><span><input type="number" step={f.key === 'lightThreshold' ? 0.1 : 1} min={f.min} max={f.max} value={Number.isNaN(draft[f.key])?'':draft[f.key]} onChange={e=>setDraft(s=>({...s,[f.key]:e.target.valueAsNumber}))}/>{f.unit}</span></label>)}</div><details className="calibration"><summary>토양 센서 보정 · 현재 ADC {data?.raw.soil??'—'}</summary><p>건조한 상태와 충분히 젖은 상태에서 각각 측정한 ADC 값을 입력하세요. %는 실측 기준의 상대값입니다.</p>{(['soilDry','soilWet'] as const).map(key=><label className="setting-field" key={key}>{key==='soilDry'?'건조 ADC':'습윤 ADC'}<input type="number" min="1" max="1022" value={Number.isNaN(draft[key])?'':draft[key]} onChange={e=>setDraft(s=>({...s,[key]:e.target.valueAsNumber}))}/></label>)}<label className="checkbox"><input type="checkbox" checked={draft.soilCalibrated} onChange={e=>setDraft(s=>({...s,soilCalibrated:e.target.checked}))}/>건조·습윤 실측값으로 보정을 완료했습니다</label></details>{error&&<div className="alert error">{error}</div>}<button className="primary full" disabled={disabled} onClick={()=>void saveSettings()}>{busy?'저장 중…':demo?'데모 설정 저장':'아두이노에 저장'}</button></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
