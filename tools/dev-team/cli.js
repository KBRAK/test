#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createCodexAgent, execute, runTeam } from './team.js';

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) {
    console.log('Aufruf: npm run team -- [--demo] [--task-file DATEI | "Auftrag"]\nOptional: --repo PFAD --output PFAD\nEchte Läufe benötigen eine authentifizierte Codex-CLI und können Kosten verursachen.');
    return;
  }
  let demo = false, cwd = process.cwd(), output, taskFile;
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--demo') demo = true;
    else if (['--repo', '--output', '--task-file'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Wert für ${arg} fehlt.`);
      if (arg === '--repo') cwd = resolve(value);
      else if (arg === '--output') output = resolve(value);
      else taskFile = resolve(value);
    } else if (arg.startsWith('--')) throw new Error(`Unbekannte Option: ${arg}`);
    else words.push(arg);
  }
  if (taskFile && words.length) throw new Error('Auftrag als Text oder Datei angeben.');
  const task = taskFile ? await readFile(taskFile, 'utf8') : words.join(' ');
  if (!task.trim()) throw new Error('Ein Auftrag ist erforderlich.');
  await execute('git', ['rev-parse', '--show-toplevel'], { cwd });
  if (!demo) await execute('codex', ['--version'], { cwd });
  const lock = join(cwd, '.dev-team.lock');
  try { await mkdir(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Ein Teamlauf ist bereits aktiv (.dev-team.lock). Nach einem Absturz nur entfernen, wenn kein Lauf mehr aktiv ist.');
    throw error;
  }
  try {
    const runDir = output ?? join(tmpdir(), 'dev-team', randomUUID());
    console.log(`Protokolle: ${runDir}`);
    const agent = demo ? async role => ({ summary: `Demo: ${role.name}`, details: 'Simulierte Übergabe; keine KI-Ausführung, Tests oder Codeänderungen.', verdict: role.id === 'reviewer' ? 'approved' : 'complete' }) : createCodexAgent({ cwd, runDir });
    const state = await runTeam({ task, cwd, runDir, agent, demo, onStep: name => console.log(`→ ${name}`) });
    console.log(`Ergebnis: ${state.status}`);
    if (state.status !== 'completed') process.exitCode = 2;
  } finally { await rm(lock, { recursive: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
