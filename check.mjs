import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext, Script } from 'node:vm';
import { ESLint } from 'eslint';
import recommended from '@eslint/js';
import globals from 'globals';
import { parseHTML } from 'linkedom';
import * as THREE from 'three';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const code = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
new Script(code, { filename: 'index.html' });

if (process.argv.includes('--lint')) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      recommended.configs.recommended,
      { languageOptions: { globals: { ...globals.browser, ...globals.es2022 } } }
    ]
  });
  const results = await eslint.lintText(code, { filePath: 'game.js' });
  const formatter = await eslint.loadFormatter('stylish');
  console.log(formatter.format(results) || 'JavaScript syntax and ESLint checks passed.');
  if (results.some(result => result.errorCount || result.warningCount)) process.exitCode = 1;
}

if (process.argv.includes('--test')) {
  const { document, window } = parseHTML(html);
  const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(ids.length, new Set(ids).size, 'HTML element IDs are unique');
  for (const use of document.querySelectorAll('use')) {
    assert.ok(document.querySelector(use.getAttribute('href')), 'SVG icon target exists');
  }
  assert.ok(!html.includes('</+'), 'No malformed closing tags');
  const context2d = { fillRect() {}, strokeRect() {}, fillText() {} };
  window.HTMLCanvasElement.prototype.getContext = () => context2d;
  window.HTMLElement.prototype.focus = function () {};
  window.HTMLElement.prototype.setPointerCapture = function () {};
  let frame;
  const storage = new Map();
  const timers = new Map();
  let nextTimer = 0;
  class TestRenderer {
    shadowMap = {};
    info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio() {}
    setSize() {}
    render(scene, camera) {
      assert.ok(scene.isScene && camera.isPerspectiveCamera);
      scene.updateMatrixWorld(true);
    }
  }
  class FixedClock { getDelta() { return 1 / 30; } }
  const sandbox = createContext({
    window, document, console, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { frame = callback; }
  });
  window.THREE = { ...THREE, WebGLRenderer: TestRenderer, Clock: FixedClock };
  window.innerWidth = 1440; window.innerHeight = 900; window.devicePixelRatio = 1;
  runInContext(code, sandbox, { filename: 'index.html', timeout: 30000 });
  const snapshot = () => window.cloudline.snapshot();
  const tick = (seconds = 1) => { for (let i = 0; i < Math.round(seconds * 30); i++) frame(); };
  const key = (type, code) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    event.code = code;
    document.body.dispatchEvent(event);
  };
  const press = code => { key('keydown', code); key('keyup', code); };
  const click = id => document.getElementById(id).click();

  assert.ok(snapshot().trackLength > 400, 'Continuous railway has two substantial routes');
  assert.equal(snapshot().passengers, 12);
  assert.equal(snapshot().speed, 0);
  assert.equal(document.getElementById('destination-name').textContent, 'Mango Tide');
  const first = window.cloudline.trackAt(0).position;
  const last = window.cloudline.trackAt(snapshot().trackLength).position;
  assert.ok(first.distanceTo(last) < 0.001, 'Track closes seamlessly');
  for (let d = 0; d < snapshot().trackLength; d += 2) {
    const road = window.cloudline.roadAt(d);
    assert.ok(Number.isFinite(road.curvature) && Number.isFinite(road.slope), 'Road physics are finite');
  }
  key('keydown', 'KeyW'); tick(4); key('keyup', 'KeyW');
  assert.ok(snapshot().speed > 4, 'Power accelerates with inertia');
  const beforePause = snapshot().distance;
  press('Space'); tick(2);
  assert.equal(snapshot().distance, beforePause, 'Pause halts the simulation');
  press('Space');
  key('keydown', 'KeyS'); tick(4); key('keyup', 'KeyS');
  assert.equal(snapshot().speed, 0, 'Brake stops without reversing');
  tick(2);
  assert.equal(snapshot().speed, 0, 'Tram remains stopped on an uphill track');

  click('help-btn');
  const beforeHelp = snapshot().distance;
  key('keydown', 'KeyW'); tick(2); key('keyup', 'KeyW');
  assert.equal(snapshot().distance, beforeHelp, 'Help pauses driving');
  click('close-help');
  click('view-btn'); assert.equal(snapshot().camera, 1);
  click('view-btn'); assert.equal(snapshot().camera, 2);
  click('view-btn'); assert.equal(snapshot().camera, 0);

  // Drive to the platform using only public controls, then exercise both services.
  for (let trip = 0; trip < 2; trip++) {
    let arrived = false;
    for (let i = 0; i < 9000; i++) {
      const s = snapshot();
      const target = window.cloudline.stations[s.target].distance;
      const gap = (target - s.distance + s.trackLength) % s.trackLength;
      if ((gap < 6 || gap > s.trackLength - 6) && s.speed < 0.5) { arrived = true; break; }
      const stopDistance = s.speed * s.speed / 5 + s.speed * 0.8 + 3;
      const braking = gap < stopDistance || s.speed > 8;
      if (braking) {
        key('keyup', 'KeyW'); key('keydown', 'KeyS');
      } else {
        key('keyup', 'KeyS');
        key(s.speed < 5 ? 'keydown' : 'keyup', 'KeyW');
      }
      frame();
    }
    key('keyup', 'KeyW'); key('keyup', 'KeyS');
    assert.ok(arrived, `Can stop at station on service ${trip + 1}`);
    const before = snapshot();
    press('KeyE'); assert.ok(snapshot().boarding, 'Doors open at the platform');
    key('keydown', 'KeyW'); tick(2); key('keyup', 'KeyW');
    assert.equal(snapshot().speed, 0, 'Cannot accelerate while passengers board');
    tick(5);
    assert.equal(snapshot().target, 1 - before.target, 'Boarding switches to the other service');
    assert.ok(snapshot().coins > before.coins, 'Arrival pays sky coins');
    assert.ok(snapshot().passengers >= 8 && snapshot().passengers <= 16);
  }
  const positionBeforeWorkshop = snapshot().distance;
  click('workshop-btn'); assert.equal(snapshot().mode, 'workshop');
  click('install-btn'); tick(6.2);
  assert.ok(snapshot().upgrades.leaves, 'Hearth leaves installed');
  document.querySelector('[data-part="companion"]').click();
  click('install-btn'); tick(6.2);
  assert.ok(snapshot().upgrades.companion, 'Little Companion installed');
  assert.ok(JSON.parse(storage.get('cloudline-save-v1')).companion, 'Upgrade is saved');
  click('leave-workshop'); tick(2);
  assert.equal(snapshot().mode, 'drive', 'Tram drives out of the workshop');
  assert.ok(Math.abs(snapshot().distance - positionBeforeWorkshop) < 0.1, 'Workshop preserves route position');
  assert.equal(snapshot().installing, false);

  const physics = runInContext('Driving', sandbox);
  const fast = { speed: 15, accel: 0, comfort: 100, roughTime: 0 };
  for (let i = 0; i < 120; i++) physics.step(fast, { power: true }, { slope: 0, curvature: 0.08, wind: true }, 1 / 30);
  assert.ok(fast.comfort < 50 && fast.roughTime > 3, 'Fast curves and crosswind penalize comfort');
  assert.ok(fast.speed <= 17, 'Top speed is bounded');
  const cozy = { speed: 5, accel: 0, comfort: 60, roughTime: 0 };
  for (let i = 0; i < 120; i++) physics.step(cozy, {}, { slope: 0, curvature: 0.005, wind: false }, 1 / 30);
  assert.ok(cozy.comfort > 60, 'Gentle driving rebuilds comfort');
  assert.equal(physics.reward(100, 0), 75, 'Perfect arrival pays base bonus');
  assert.equal(physics.reward(100, 3), 105, 'Smooth streak adds tips');
  console.log('All game checks passed: scene construction, continuous track, driving, brakes, pause, both station routes, boarding lock, camera controls, workshop, persistence, and comfort scoring.');
}
