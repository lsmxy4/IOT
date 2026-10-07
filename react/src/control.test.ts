import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { controlledOutputs, defaults, demoStatus, demoTick, off, validSettings } from './control.ts';
test('boot remains disarmed even with dry soil', () => assert.deepEqual(controlledOutputs(demoStatus()), off));
test('automatic irrigation starts below threshold and stops at target', () => {
  const s = {...demoStatus(),armed:true}; assert.equal(controlledOutputs(s).pump,true);
  assert.equal(controlledOutputs({...s,soil:48,outputs:{...off,pump:true}}).pump,true);
  assert.equal(controlledOutputs({...s,soil:55,outputs:{...off,pump:true}}).pump,false);
});
test('water shortage and sensor loss block pump in manual and auto', () => {
  for(const auto of [true,false]) { const s={...demoStatus(),armed:true,auto,outputs:{...off,pump:true}};
    assert.equal(controlledOutputs({...s,waterOk:false}).pump,false);
    assert.equal(controlledOutputs({...s,sensors:{...s.sensors,water:false}}).pump,false);
    assert.equal(controlledOutputs({...s,sensors:{...s.sensors,soil:false}}).pump,false);
  }
});
test('unconfigured motor driver blocks motors but permits ordinary LED',()=> {
  const s={...demoStatus(),armed:true,hardwareReady:false,dark:true,temperature:35};
  assert.deepEqual(controlledOutputs(s),{pump:false,fan:false,light:true});
});
test('pump maximum duration latches off and cannot auto restart after cooldown',()=>{
  let s={...demoStatus(),armed:true,outputs:{...off,pump:true},pumpSeconds:9};
  s=demoTick(s); assert.equal(s.pumpLocked,true); assert.equal(s.outputs.pump,false); assert.equal(s.cooldownSeconds,60);
  for(let i=0;i<65;i++) s=demoTick(s);
  assert.equal(s.outputs.pump,false); assert.equal(s.pumpLocked,true);
});
test('water cutoff starts cooldown',()=>{
  const s=demoTick({...demoStatus(),armed:true,waterOk:false,outputs:{...off,pump:true}});
  assert.equal(s.outputs.pump,false); assert.equal(s.cooldownSeconds,60);
});
test('fan uses either humidity or temperature and stops on DHT failure',()=>{
  const s={...demoStatus(),armed:true,humidity:80}; assert.equal(controlledOutputs(s).fan,true);
  assert.equal(controlledOutputs({...s,sensors:{...s.sensors,dht:false}}).fan,false);
});
test('digital light changes only with darkness and valid input',()=>{
  const s={...demoStatus(),armed:true,dark:true}; assert.equal(controlledOutputs(s).light,true);
  assert.equal(controlledOutputs({...s,sensors:{...s.sensors,light:false}}).light,false);
});
test('reject unsafe settings and invalid calibration',()=>{
  assert.equal(validSettings(defaults),true);
  for(const settings of [{...defaults,pumpMaxSeconds:31},{...defaults,pumpCooldownSeconds:0},{...defaults,soilStop:40},{...defaults,soilWet:800},{...defaults,waterMin:NaN},{...defaults,soilDry:1.5}]) assert.equal(validSettings(settings),false);
});

test('manual LED works without arming or sensors while motors stay blocked', () => {
  const s = {...demoStatus(), auto:false, armed:false, hardwareReady:false, sensors:{dht:false,soil:false,light:false,water:false}, outputs:{pump:true,fan:true,light:true}};
  assert.deepEqual(controlledOutputs(s), {pump:false,fan:false,light:true});
  assert.deepEqual(controlledOutputs({...s,outputs:{...off}}), off);
  assert.deepEqual(controlledOutputs({...s,auto:true}), off);
});

test('analog LED threshold has half-point hysteresis and manual override', () => {
 const s={...demoStatus(),armed:true,capabilities:{...demoStatus().capabilities,lightAnalog:true},light:1};
 assert.equal(controlledOutputs(s).light,true);
 assert.equal(controlledOutputs({...s,light:2.2,outputs:{...off,light:true}}).light,true);
 assert.equal(controlledOutputs({...s,light:2.5,outputs:{...off,light:true}}).light,false);
 assert.equal(controlledOutputs({...s,light:2.2}).light,false);
 assert.equal(controlledOutputs({...s,auto:false,light:100,outputs:{...off,light:true}}).light,true);
});

