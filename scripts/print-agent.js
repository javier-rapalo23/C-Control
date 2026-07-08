/*
 * Agente local de impresión.
 *
 * Este script corre en una PC dentro de la misma red que la impresora térmica
 * (la nube/Vercel no puede alcanzar IPs de red local como 192.168.x.x).
 * Revisa periódicamente si hay tickets pendientes de imprimir en la app y
 * los envía directamente a la impresora por socket TCP (puerto 9100 por defecto).
 *
 * Uso:
 *   PRINT_AGENT_APP_URL=https://tu-app.vercel.app PRINT_AGENT_TOKEN=xxxx node scripts/print-agent.js
 *
 * También puedes crear un archivo .env.agent junto a este script con:
 *   PRINT_AGENT_APP_URL=https://tu-app.vercel.app
 *   PRINT_AGENT_TOKEN=xxxx
 *   PRINT_AGENT_POLL_MS=2000
 */

const net = require('net');
const path = require('path');
const fs = require('fs');

const envFile = path.join(__dirname, '.env.agent');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const APP_URL = (process.env.PRINT_AGENT_APP_URL || '').replace(/\/$/, '');
const TOKEN = process.env.PRINT_AGENT_TOKEN || '';
const POLL_MS = Number(process.env.PRINT_AGENT_POLL_MS || 2000);

if (!APP_URL || !TOKEN) {
  console.error('Faltan variables: PRINT_AGENT_APP_URL y/o PRINT_AGENT_TOKEN.');
  process.exit(1);
}

function sendToPrinter(ip, port, buffer, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error(`Tiempo de espera agotado conectando a ${ip}:${port}`)));
    socket.once('error', (err) => finish(new Error(`No se pudo conectar a ${ip}:${port}: ${err.message}`)));

    socket.connect(port, ip, () => {
      socket.write(buffer, (err) => {
        if (err) finish(new Error(`Error enviando datos: ${err.message}`));
        else finish();
      });
    });
  });
}

async function pollOnce() {
  const res = await fetch(`${APP_URL}/api/print/agent/pending`, {
    headers: { 'x-agent-token': TOKEN },
  });
  const body = await res.json();
  if (!body.ok) {
    console.error('Error consultando trabajos pendientes:', body.error?.message || res.status);
    return;
  }

  const job = body.data;
  if (!job) return;

  console.log(`Imprimiendo trabajo ${job.id} en ${job.printerIp}:${job.printerPort}...`);
  try {
    await sendToPrinter(job.printerIp, job.printerPort, Buffer.from(job.payloadB64, 'base64'));
    await reportCompletion(job.id, true);
    console.log(`Trabajo ${job.id} impreso correctamente.`);
  } catch (err) {
    await reportCompletion(job.id, false, err.message);
    console.error(`Trabajo ${job.id} falló:`, err.message);
  }
}

async function reportCompletion(jobId, success, error) {
  await fetch(`${APP_URL}/api/print/agent/${jobId}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-token': TOKEN },
    body: JSON.stringify({ success, error }),
  });
}

console.log(`Agente de impresión iniciado. Consultando ${APP_URL} cada ${POLL_MS}ms.`);
setInterval(() => {
  pollOnce().catch((err) => console.error('Error en ciclo de sondeo:', err.message));
}, POLL_MS);
