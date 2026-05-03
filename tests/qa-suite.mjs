import { createClient } from '@supabase/supabase-js';

const BASE = 'https://tukitask.vercel.app';
let SUPA_URL = '', SUPA_KEY = '';

const USERS = {
  cliente: { email: 'clientes@gmail.com', password: 'cliente123***' },
  driver:  { email: 'driver@gmail.com',   password: 'driver123***'  },
  tecnico: { email: 'tecnico@gmail.com',  password: 'tecnico123***' },
  admin:   { email: 'admin@gmail.com',    password: 'admin123***'   },
};

const F = { critical: [], important: [], improvements: [], correct: [] };
const log = (...a) => console.log('[QA]', ...a);
const add = (sev, msg) => F[sev].push(msg);

async function discover() {
  log('Descubriendo credenciales Supabase...');
  const html = await fetch(BASE).then(r => r.text());
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
  for (const s of scripts.slice(0, 30)) {
    const url = s.startsWith('http') ? s : BASE + s;
    try {
      const js = await fetch(url).then(r => r.text());
      const u = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
      const k = js.match(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/);
      if (u && k) { SUPA_URL = u[0]; SUPA_KEY = k[0]; log('URL:', SUPA_URL); log('KEY:', SUPA_KEY.slice(0,40)+'...'); return true; }
    } catch {}
  }
  return false;
}

async function login(role) {
  const { email, password } = USERS[role];
  const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) { add('critical', `Login ${role} FALLO: ${error.message}`); return null; }
  return { token: data.session?.access_token, user: data.user };
}

async function api(path, opts = {}) {
  const { method = 'GET', body, token } = opts;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, ok: res.ok, body: json ?? text, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

async function testLoginValidation() {
  log('\n=== 1.1 Validación de login ===');
  const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
  const r1 = await supa.auth.signInWithPassword({ email: 'x@x.com', password: 'wrong' });
  if (r1.error) { log('OK rechaza creds invalidas:', r1.error.message); F.correct.push('Login rechaza credenciales invalidas'); }
  else add('critical', 'Acepta login invalido!');
  const r2 = await supa.auth.signInWithPassword({ email: 'noemail', password: 'x' });
  if (r2.error) log('OK rechaza email malformado'); else add('critical', 'Acepta email malformado');
}

async function testRoles() {
  log('\n=== 1.2 Login por rol ===');
  const sessions = {};
  for (const role of Object.keys(USERS)) {
    const s = await login(role);
    if (s?.token) { log(`OK ${role}`); F.correct.push(`Login OK ${role}`); sessions[role] = s; }
    else log(`FALLO ${role}`);
  }
  return sessions;
}

async function testCheckRole(sessions) {
  log('\n=== 1.3 /api/check-role ===');
  for (const [role, s] of Object.entries(sessions)) {
    const r = await api('/api/check-role', { method: 'POST', token: s.token, body: { email: USERS[role].email.toLowerCase() } });
    log(`  ${role} status=${r.status} role=${r.body?.role} ${r.ms}ms`);
    if (!r.ok) add('important', `check-role fallo ${role}: ${r.status}`);
    else {
      const got = r.body?.role;
      const match = got === role || (role === 'tecnico' && (got === 'tecnico' || got === 'servicio'));
      if (!match) add('important', `check-role retorna '${got}' para ${role}`);
    }
  }
}

async function testClient(sessions) {
  log('\n=== 1.4 Cliente ===');
  const s = sessions.cliente; if (!s) return null;

  const r0 = await api(`/api/orders?client_email=${encodeURIComponent(USERS.cliente.email)}`, { token: s.token });
  log(`  GET orders status=${r0.status} ${r0.ms}ms`);
  if (!r0.ok) add('important', `Cliente no lista pedidos: ${r0.status}`);
  else F.correct.push('Cliente lista sus pedidos');

  const rBad = await api('/api/orders', { method: 'POST', token: s.token, body: { suggested_price: 10, pickup_address: 't', delivery_address: 't', vehicle_type: 'moto' } });
  log(`  POST precio=10 status=${rBad.status}`);
  if (rBad.status >= 400) F.correct.push('Valida precio minimo');
  else add('important', `Precio=10 NO rechazado (${rBad.status})`);

  const rHuge = await api('/api/orders', { method: 'POST', token: s.token, body: { suggested_price: 999999999999, pickup_address: 't', delivery_address: 't', vehicle_type: 'moto' } });
  log(`  POST precio=999B status=${rHuge.status}`);
  if (rHuge.status >= 400) F.correct.push('Valida precio maximo');
  else add('important', `Precio astronomico NO rechazado (${rHuge.status})`);

  const rEmpty = await api('/api/orders', { method: 'POST', token: s.token, body: {} });
  log(`  POST body vacio status=${rEmpty.status}`);
  if (rEmpty.status >= 400) F.correct.push('Rechaza body vacio');
  else add('critical', `Acepta body vacio (${rEmpty.status})`);

  const orderBody = {
    suggested_price: 15000,
    pickup_address: 'Av Mcal Lopez 1234', pickup_lat: -25.2637, pickup_lng: -57.5759,
    delivery_address: 'Av Espana 555', delivery_lat: -25.2800, delivery_lng: -57.6200,
    vehicle_type: 'moto', description: 'QA TEST', order_type: 'envio',
    receiver_contact: 'Tester', receiver_phone: '0981234567',
  };
  const rOk = await api('/api/orders', { method: 'POST', token: s.token, body: orderBody });
  log(`  POST valido status=${rOk.status} id=${rOk.body?.id} ${rOk.ms}ms`);
  if (rOk.status === 201 && rOk.body?.id) { F.correct.push('Cliente crea pedidos correctamente'); return rOk.body.id; }
  else { add('critical', `No crea pedido valido: ${rOk.status} ${JSON.stringify(rOk.body).slice(0,200)}`); return null; }
}

async function testDriver(sessions) {
  log('\n=== 1.5 Driver ===');
  const s = sessions.driver; if (!s) return;
  const r = await api('/api/orders', { token: s.token });
  log(`  GET orders status=${r.status} ${r.ms}ms`);
  if (r.status === 402) add('improvements', `Driver saldo insuficiente: balance=${r.body?.balance}`);
  else if (!r.ok) add('important', `Driver feed fallo: ${r.status}`);
  else F.correct.push('Driver accede al feed');
  const rp = await api('/api/driver-profile', { token: s.token });
  log(`  GET driver-profile status=${rp.status}`);
  if (rp.ok) F.correct.push('Driver lee perfil'); else add('important', `driver-profile: ${rp.status}`);
  const rw = await api('/api/wallet', { token: s.token });
  log(`  GET wallet status=${rw.status} balance=${rw.body?.balance}`);
  if (rw.ok) F.correct.push('Driver consulta billetera'); else add('important', `wallet: ${rw.status}`);
}

async function testTecnico(sessions) {
  log('\n=== 1.6 Tecnico ===');
  const s = sessions.tecnico; if (!s) return;
  const r = await api('/api/tecnico/jobs', { token: s.token });
  log(`  GET tecnico/jobs status=${r.status} ${r.ms}ms`);
  if (!r.ok) add('important', `tecnico/jobs: ${r.status} ${JSON.stringify(r.body).slice(0,120)}`);
  else F.correct.push('Tecnico accede a jobs');
  const rs = await api('/api/tecnico/settings', { token: s.token });
  log(`  GET tecnico/settings status=${rs.status}`);
  if (!rs.ok) add('important', `tecnico/settings: ${rs.status}`);
  else F.correct.push('Tecnico lee settings');
}

async function testAdmin(sessions) {
  log('\n=== 1.7 Admin ===');
  const s = sessions.admin; if (!s) return;
  const eps = ['/api/admin/config','/api/admin/wallets','/api/admin/documents','/api/admin/pricing','/api/admin/bank-alias'];
  for (const ep of eps) {
    const r = await api(ep, { token: s.token });
    log(`  GET ${ep} status=${r.status} ${r.ms}ms`);
    if (r.ok) F.correct.push(`Admin accede a ${ep}`);
    else if (r.status !== 404) add('important', `Admin ${ep} fallo: ${r.status}`);
  }
}

async function testLoad(sessions) {
  log('\n=== 2. CARGA: 50 pedidos concurrentes ===');
  const s = sessions.cliente;
  if (!s) { add('critical', 'Sin sesion cliente para carga'); return; }
  const body = i => ({
    suggested_price: 15000 + i * 100,
    pickup_address: `Load #${i}`, pickup_lat: -25.2637, pickup_lng: -57.5759,
    delivery_address: `Load Dest #${i}`, delivery_lat: -25.28 + i*0.001, delivery_lng: -57.62,
    vehicle_type: 'moto', description: `QA LOAD ${i}`, order_type: 'envio',
    receiver_contact: 'LoadTester', receiver_phone: '0981234567',
  });
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      api('/api/orders', { method: 'POST', token: s.token, body: body(i) })
        .then(r => ({ i, ok: r.ok, status: r.status, ms: r.ms, id: r.body?.id, err: r.body?.error }))
        .catch(e => ({ i, ok: false, status: 0, ms: 0, err: e.message }))
    )
  );
  const elapsed = Date.now() - t0;
  const ok = results.filter(r => r.ok).length;
  const err = results.filter(r => !r.ok);
  const lat = results.map(r => r.ms).sort((a,b)=>a-b);
  const avg = Math.round(lat.reduce((a,b)=>a+b,0)/lat.length);
  const p50 = lat[Math.floor(lat.length*0.5)];
  const p95 = lat[Math.floor(lat.length*0.95)];
  const p99 = lat[Math.floor(lat.length*0.99)];
  log(`  Total: 50 en ${elapsed}ms`);
  log(`  Exito: ${ok}/50  Errores: ${err.length}`);
  log(`  Latencia avg=${avg}ms p50=${p50}ms p95=${p95}ms p99=${p99}ms max=${lat[lat.length-1]}ms`);
  log(`  Throughput: ${(50/(elapsed/1000)).toFixed(1)} req/s`);
  if (err.length) err.slice(0,5).forEach(e => log(`    err #${e.i} status=${e.status} ${JSON.stringify(e.err).slice(0,120)}`));
  const ids = results.filter(r=>r.id).map(r=>r.id);
  const uniq = new Set(ids);
  if (ids.length !== uniq.size) add('critical', `DUPLICADOS: ${ids.length - uniq.size} pedidos mismo ID`);
  else if (ok === 50) F.correct.push(`50 pedidos concurrentes sin duplicados (avg=${avg}ms p95=${p95}ms)`);
  if (p95 > 5000) add('important', `Latencia p95=${p95}ms > 5s bajo carga`);
  else if (p95 > 2000) add('improvements', `Latencia p95=${p95}ms alta bajo carga`);
  else F.correct.push(`Latencia bajo carga OK: p95=${p95}ms`);
  if (err.length > 5) add('important', `${err.length}/50 errores bajo carga`);
  else if (err.length > 0) add('improvements', `${err.length}/50 errores bajo carga`);
}

async function testSecurity(sessions) {
  log('\n=== 3. Seguridad ===');
  const noauth = ['/api/orders','/api/wallet','/api/driver-profile','/api/tecnico/jobs','/api/admin/config','/api/admin/wallets'];
  for (const ep of noauth) {
    const r = await api(ep);
    log(`  [no-auth] ${ep} status=${r.status}`);
    if (r.status === 200) add('critical', `${ep} accesible SIN auth!`);
    else if ([401,403].includes(r.status)) F.correct.push(`${ep} requiere auth`);
  }
  const c = sessions.cliente;
  if (c) {
    const r = await api('/api/orders', { method: 'POST', token: c.token, body: {
      client_email: 'admin@gmail.com', suggested_price: 15000,
      pickup_address: 'spoof', pickup_lat: -25.26, pickup_lng: -57.57,
      delivery_address: 'spoof', delivery_lat: -25.28, delivery_lng: -57.62,
      vehicle_type: 'moto', description: 'spoof', receiver_contact: 'x', receiver_phone: '0981111111',
    }});
    log(`  [spoof] status=${r.status} actual_email=${r.body?.client_email}`);
    if (r.body?.client_email === USERS.cliente.email) F.correct.push('Servidor fuerza client_email desde token');
    else if (r.body?.client_email === 'admin@gmail.com') add('critical', 'Suplantacion de client_email permitida');
  }
  if (c) {
    const r = await api('/api/admin/wallets', { token: c.token });
    log(`  [escalation] cliente->admin status=${r.status}`);
    if (r.status === 200) add('critical', 'Cliente accede a endpoint admin!');
    else F.correct.push('Admin endpoints bloquean no-admin');
  }
  const d = sessions.driver;
  if (d) {
    const r = await api('/api/orders?driver_email=otro@mail.com', { token: d.token });
    log(`  [isolation] status=${r.status}`);
    if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) add('important', 'Driver podria leer pedidos de otros');
    else F.correct.push('Driver aislado');
  }
  const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
  const inj = await supa.auth.signInWithPassword({ email: "admin'--@gmail.com", password: 'anything' });
  if (inj.error) F.correct.push('Rechaza email con caracteres SQL');
  else add('critical', 'Acepta login SQL-injection!');
}

function report() {
  const o = [];
  o.push('\n\n====================================================');
  o.push('  REPORTE FINAL QA - TukiTask');
  o.push('====================================================\n');
  o.push(`CRITICOS (${F.critical.length})`);
  if (!F.critical.length) o.push('  (ninguno)');
  F.critical.forEach(f => o.push('  - ' + f));
  o.push(`\nIMPORTANTES (${F.important.length})`);
  if (!F.important.length) o.push('  (ninguno)');
  F.important.forEach(f => o.push('  - ' + f));
  o.push(`\nMEJORAS (${F.improvements.length})`);
  if (!F.improvements.length) o.push('  (ninguna)');
  F.improvements.forEach(f => o.push('  - ' + f));
  o.push(`\nCORRECTOS (${F.correct.length})`);
  F.correct.forEach(f => o.push('  + ' + f));
  o.push('\n====================================================');
  console.log(o.join('\n'));
}

(async () => {
  try {
    const ok = await discover();
    if (!ok) { add('critical', 'No se pudo obtener Supabase URL/KEY'); report(); process.exit(1); }
    await testLoginValidation();
    const sessions = await testRoles();
    if (!Object.keys(sessions).length) { add('critical', 'NINGUN login funciono'); report(); return; }
    await testCheckRole(sessions);
    await testClient(sessions);
    await testDriver(sessions);
    await testTecnico(sessions);
    await testAdmin(sessions);
    await testLoad(sessions);
    await testSecurity(sessions);
    report();
  } catch (e) {
    console.error('FATAL:', e.stack || e.message);
    add('critical', `Excepcion: ${e.message}`);
    report();
  }
})();
