import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { demoStatus, defaults } from './control.ts';
import { deviceAddress, isStatus, requestDevice, connectionPreferences } from './device.ts';
test('new farm preferences are independent from old indoor project',()=>{
  const m=new Map([['deviceAddress','http://legacy-device.local']]);
  const storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};
  assert.deepEqual(connectionPreferences(storage),{address:'http://smartfarm.local',demo:false});
  storage.setItem('farmMode','demo'); assert.equal(connectionPreferences(storage).demo,true);
});
test('accept hostname and IP; reject credentials and paths',()=>{
  assert.equal(deviceAddress('smartfarm.local'),'http://smartfarm.local');
  assert.equal(deviceAddress('192.168.1.8:80'),'http://192.168.1.8');
  assert.throws(()=>deviceAddress('http://user:password@host')); assert.throws(()=>deviceAddress('http://host/api/status'));
});
test('reject indoor firmware and malformed sensor values',()=>{
  assert.equal(isStatus(demoStatus()),true); assert.equal(isStatus({people:1}),false);
  assert.equal(isStatus({...demoStatus(),waterLevel:'75'}),false);
  assert.equal(isStatus({...demoStatus(),outputs:{pump:'ON'}}),false);
});
test('settings send exact JSON and server failures surface',async()=>{
  const original=globalThis.fetch;
  try { globalThis.fetch=async(url,options)=>{assert.equal(url,'http://smartfarm.local/api/settings');assert.equal(options?.method,'POST');assert.equal(options?.body,JSON.stringify(defaults));return Response.json(demoStatus());};
    assert.equal((await requestDevice('smartfarm.local','settings',defaults)).schema,'smartfarm-v1');
    globalThis.fetch=async()=>Response.json({error:'Pump blocked'},{status:409});
    await assert.rejects(requestDevice('smartfarm.local','outputs',{pump:true}),/Pump blocked/);
  } finally {globalThis.fetch=original;}
});

