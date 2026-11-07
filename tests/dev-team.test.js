import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTeam, createCodexAgent, execute } from '../tools/dev-team/team.js';

const result = verdict => ({ summary: 'Ergebnis', details: 'Prüfbefund', verdict });
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'team-test-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('Team übergibt Ergebnisse und begrenzt Korrekturschleife', async () => fixture(async root => {
  const seen = [];
  const state = await runTeam({ task: 'Feature', cwd: root, runDir: join(root, 'run'), agent: async (role, prompt, label) => {
    seen.push(label);
    if (role.id === 'architect') assert.match(prompt, /Prüfbefund/);
    return result(role.id === 'reviewer' ? 'changes_requested' : 'complete');
  }});
  assert.equal(state.status, 'changes_requested');
  assert.deepEqual(seen, ['lead','architect','developer','qa','reviewer','developer-revision','qa-recheck','reviewer-recheck']);
  assert.equal(JSON.parse(await readFile(join(root, 'run/run.json'))).status, 'changes_requested');
}));
test('QA-Befunde erzwingen Korrektur auch bei positivem Review', async () => fixture(async root => {
  const state = await runTeam({ task: 'Feature', cwd: root, runDir: join(root, 'run'), agent: async (role, prompt, label) => result(label === 'qa' ? 'changes_requested' : 'approved') });
  assert.equal(state.status, 'completed');
  assert.equal(state.steps.length, 8);
}));
test('Agentenfehler stoppt Ablauf und persistiert Fehlerstatus', async () => fixture(async root => {
  await assert.rejects(runTeam({ task: 'Feature', cwd: root, runDir: join(root, 'run'), agent: async () => { throw new Error('offline'); } }), /offline/);
  assert.equal(JSON.parse(await readFile(join(root, 'run/run.json'))).status, 'failed');
}));
test('Ungültige Antworten werden nicht als Erfolg behandelt', async () => fixture(async root => {
  await assert.rejects(runTeam({ task: 'Feature', cwd: root, runDir: join(root, 'run'), agent: async () => ({}) }), /Ungültige/);
}));
test('Codex-Adapter verwendet stdin, passende Sandbox und strukturierte Ausgabe', async () => fixture(async root => {
  const agent = createCodexAgent({ cwd: root, runDir: root, executeCommand: async (command, args, options) => {
    assert.equal(command, 'codex');
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    assert.equal(options.input, 'Auftrag');
    await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(result('approved')));
    return {stdout: 'Ereignis', stderr: ''};
  }});
  assert.equal((await agent({sandbox: 'read-only'}, 'Auftrag', 'review')).verdict, 'approved');
}));
test('Prozessfehler und Zeitlimits werden weitergegeben', async () => {
  await assert.rejects(execute(process.execPath, ['-e', 'process.exit(3)']), /Status 3/);
  await assert.rejects(execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {timeoutMs: 100}), /Zeitlimit/);
});
test('Vorhandene Laufordner werden nicht überschrieben', async () => fixture(async root => {
  await writeFile(join(root, 'run.json'), 'vorhanden');
  await assert.rejects(runTeam({ task: 'Feature', cwd: root, runDir: root, agent: async () => result('complete') }), /EEXIST/);
  assert.equal(await readFile(join(root, 'run.json'), 'utf8'), 'vorhanden');
}));
