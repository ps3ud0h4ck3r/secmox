// Builds seed.sql from the files under tools/bank/.
//
//   node tools/seed.js
//   node tools/seed.js --chunks 4     also writes seed.1.sql … seed.4.sql
//
// Ids come from role, level and slug, so re-running updates rows in place
// rather than duplicating them. Nothing here deletes: a question removed from
// the bank files stays in the database until it is deleted from the admin
// page, which is deliberate, because deleting a question deletes its attempts.

import { writeFileSync } from 'node:fs';
import { QUESTIONS, questionId } from './questions.js';
import { LABS as LABS_1 } from './bank/labs.js';
import { LABS_2 } from './bank/labs-2.js';
import { SCENARIOS } from './bank/scenarios.js';
import { TRACKS } from './bank/tracks.js';
import { OBJECTIVE_ITEMS } from './bank/objective-items.js';

const LABS = [...LABS_1, ...LABS_2];

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const now = new Date().toISOString();

const seen = new Set();
const blocks = QUESTIONS.map((item) => {
  for (const field of ['slug', 'level', 'topic', 'prompt', 'answer']) {
    if (!item[field]?.trim()) throw new Error(`${item.slug || '(no slug)'}: ${field} is empty`);
  }
  if (!item.followUps?.length) throw new Error(`${item.slug}: no follow-ups`);

  const id = questionId(item);
  if (seen.has(id)) throw new Error(`duplicate id: ${id}`);
  seen.add(id);

  const lines = [
    'INSERT OR REPLACE INTO questions (id, role, topic, level, prompt, model_answer, difficulty, created_at) VALUES (' +
      [id, item.role, item.topic, item.level, item.prompt, item.answer].map(q).join(', ') +
      `, ${item.difficulty || 1}, ${q(now)});`,
  ];
  item.followUps.forEach((f, i) => {
    if (!f.prompt?.trim() || !f.answer?.trim()) {
      throw new Error(`${id}: follow-up ${i + 1} is incomplete`);
    }
    lines.push(
      'INSERT OR REPLACE INTO follow_ups (id, question_id, position, prompt, model_answer) VALUES (' +
        [q(`${id}_f${i + 1}`), q(id), i + 1, q(f.prompt), q(f.answer)].join(', ') +
        ');',
    );
  });
  return lines.join('\n');
});

const labBlocks = LABS.map((lab) => {
  for (const field of ['slug', 'title', 'role', 'level', 'brief', 'artifact_kind', 'artifact_name', 'artifact']) {
    if (!lab[field]?.toString().trim()) throw new Error(`lab ${lab.slug || '(no slug)'}: ${field} is empty`);
  }
  if (!['log', 'table'].includes(lab.artifact_kind)) {
    throw new Error(`lab ${lab.slug}: artifact_kind must be log or table`);
  }
  if (!lab.tasks?.length) throw new Error(`lab ${lab.slug}: no tasks`);

  const id = `lab_${lab.role}_${lab.slug}`;
  const bytes = Buffer.byteLength(lab.artifact, 'utf8');
  const lines = [
    'INSERT OR REPLACE INTO labs (id, title, role, level, brief, artifact_kind, artifact_name, is_free, difficulty, created_at) VALUES (' +
      [id, lab.title, lab.role, lab.level, lab.brief, lab.artifact_kind, lab.artifact_name].map(q).join(', ') +
      `, ${lab.is_free ? 1 : 0}, ${lab.difficulty || 1}, ${q(now)});`,
    'INSERT OR REPLACE INTO lab_artifacts (lab_id, body, bytes) VALUES (' +
      [q(id), q(lab.artifact), bytes].join(', ') + ');',
    `DELETE FROM lab_tasks WHERE lab_id = ${q(id)};`,
  ];
  lab.tasks.forEach((t, i) => {
    if (!t.prompt?.trim() || !t.answer?.trim()) throw new Error(`lab ${id}: task ${i + 1} is incomplete`);
    lines.push(
      'INSERT INTO lab_tasks (id, lab_id, position, prompt, model_answer) VALUES (' +
        [q(`${id}_t${i + 1}`), q(id), i + 1, q(t.prompt), q(t.answer)].join(', ') + ');',
    );
  });
  return lines.join('\n');
});

const seenScenario = new Set();
const scenarioBlocks = SCENARIOS.map((sc) => {
  for (const field of ['slug', 'role', 'level', 'title', 'situation', 'ask', 'modelAnswer']) {
    if (!sc[field]?.toString().trim()) {
      throw new Error(`scenario ${sc.slug || '(no slug)'}: ${field} is empty`);
    }
  }
  if (!['fresher', 'mid'].includes(sc.level)) {
    throw new Error(`scenario ${sc.slug}: level must be fresher or mid`);
  }
  if (!Number.isInteger(sc.minutes) || sc.minutes < 5) {
    throw new Error(`scenario ${sc.slug}: minutes must be a whole number of at least 5`);
  }
  if (!sc.points?.length) throw new Error(`scenario ${sc.slug}: no scoring points`);

  const id = `sc_${sc.role}_${sc.slug}`;
  if (seenScenario.has(id)) throw new Error(`duplicate scenario id: ${id}`);
  seenScenario.add(id);

  const lines = [
    'INSERT OR REPLACE INTO scenarios (id, role, level, title, situation, ask, minutes, model_answer, is_free, created_at) VALUES (' +
      [id, sc.role, sc.level, sc.title, sc.situation, sc.ask].map(q).join(', ') +
      `, ${sc.minutes}, ${q(sc.modelAnswer)}, ${sc.isFree ? 1 : 0}, ${q(now)});`,
    `DELETE FROM scenario_points WHERE scenario_id = ${q(id)};`,
  ];
  sc.points.forEach((pt, i) => {
    if (!pt.label?.trim() || !pt.detail?.trim()) {
      throw new Error(`scenario ${id}: point ${i + 1} is incomplete`);
    }
    lines.push(
      'INSERT INTO scenario_points (id, scenario_id, ord, label, detail) VALUES (' +
        [q(`${id}_p${i + 1}`), q(id), i + 1, q(pt.label), q(pt.detail)].join(', ') + ');',
    );
  });
  return lines.join('\n');
});

const seenTrack = new Set();
let trackQuestionLinks = 0;
const trackBlocks = TRACKS.map((tr) => {
  for (const field of ['slug', 'company', 'role', 'level', 'title', 'blurb', 'prep']) {
    if (!tr[field]?.toString().trim()) throw new Error(`track ${tr.slug || '(no slug)'}: ${field} is empty`);
  }
  if (!tr.rounds?.length) throw new Error(`track ${tr.slug}: no rounds`);
  if (!tr.focus?.length) throw new Error(`track ${tr.slug}: no focus points`);
  if (!tr.questions?.length) throw new Error(`track ${tr.slug}: no questions`);

  const id = `track_${tr.slug}`;
  if (seenTrack.has(id)) throw new Error(`duplicate track id: ${id}`);
  seenTrack.add(id);

  // Resolve [role, level, slug] triples to question ids, dropping any that no
  // longer exist in the bank so a retired question thins a track, never breaks
  // the build. Order is preserved: the track is a curated sequence.
  const ids = tr.questions
    .map(([role, level, slug]) => questionId({ role, level, slug }))
    .filter((qid) => {
      if (seen.has(qid)) return true;
      console.warn(`  track ${tr.slug}: skipping missing question ${qid}`);
      return false;
    });
  if (!ids.length) throw new Error(`track ${tr.slug}: every referenced question is missing`);
  trackQuestionLinks += ids.length;

  const tier = tr.tier === 'pro' ? 'pro' : 'free';
  return (
    'INSERT OR REPLACE INTO company_tracks ' +
    '(id, slug, company, role, level, title, blurb, tier, rounds, focus, prep, question_ids, created_at) VALUES (' +
    [id, tr.slug, tr.company, tr.role, tr.level, tr.title, tr.blurb, tier,
      JSON.stringify(tr.rounds), JSON.stringify(tr.focus), tr.prep, JSON.stringify(ids)].map(q).join(', ') +
    `, ${q(now)});`
  );
});

const seenObj = new Set();
const objectiveBlocks = OBJECTIVE_ITEMS.map((it) => {
  for (const field of ['slug', 'role', 'topic', 'type', 'prompt']) {
    if (!it[field]?.toString().trim()) throw new Error(`objective ${it.slug || '(no slug)'}: ${field} is empty`);
  }
  if (!Array.isArray(it.options) || it.options.length < 2) {
    throw new Error(`objective ${it.slug}: needs at least two options`);
  }
  // Validate the answer key so a bad item can never ship: an index for mcq/pick,
  // a full permutation of the option indices for order.
  if (it.type === 'order') {
    const want = [...it.options.keys()].sort().join(',');
    const got = Array.isArray(it.answer) ? [...it.answer].sort((a, b) => a - b).join(',') : '';
    if (want !== got) throw new Error(`objective ${it.slug}: answer must order every option exactly once`);
  } else if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= it.options.length) {
    throw new Error(`objective ${it.slug}: answer must be a valid option index`);
  }

  const id = `obj:${it.role}:${it.slug}`;
  if (seenObj.has(id)) throw new Error(`duplicate objective id: ${id}`);
  seenObj.add(id);

  return (
    'INSERT OR REPLACE INTO objective_items ' +
    '(id, role, topic, difficulty, type, prompt, body, options, answer, explain, org_id, created_at) VALUES (' +
    [id, it.role, it.topic].map(q).join(', ') +
    `, ${it.difficulty || 1}, ` +
    [it.type, it.prompt, it.body ?? '', JSON.stringify(it.options), JSON.stringify(it.answer), it.explain ?? ''].map(q).join(', ') +
    `, NULL, ${q(now)});`
  );
});

const header = '-- Generated by tools/seed.js. Edit the files under tools/bank/, not this one.\n\n';
writeFileSync(
  new URL('../seed.sql', import.meta.url),
  header + blocks.concat(labBlocks, scenarioBlocks, trackBlocks, objectiveBlocks).join('\n\n') + '\n',
);

const chunkArg = process.argv.indexOf('--chunks');
if (chunkArg > -1) {
  const n = Number(process.argv[chunkArg + 1]) || 4;
  const size = Math.ceil(blocks.length / n);
  for (let i = 0; i < n; i++) {
    const part = blocks.slice(i * size, (i + 1) * size);
    if (!part.length) continue;
    writeFileSync(new URL(`../seed.${i + 1}.sql`, import.meta.url), header + part.join('\n\n') + '\n');
  }
  console.log(`also wrote ${n} chunk files`);
}

const followUps = QUESTIONS.reduce((n, item) => n + item.followUps.length, 0);
const byRole = {};
for (const item of QUESTIONS) {
  byRole[item.role] = byRole[item.role] || { fresher: 0, mid: 0 };
  byRole[item.role][item.level] += 1;
}
const labTasks = LABS.reduce((n, l) => n + l.tasks.length, 0);
const points = SCENARIOS.reduce((n, sc) => n + sc.points.length, 0);
console.log(
  `seed.sql: ${QUESTIONS.length} questions, ${followUps} follow-ups, ${LABS.length} labs, ` +
    `${labTasks} lab tasks, ${SCENARIOS.length} scenarios, ${points} scoring points, ` +
    `${TRACKS.length} tracks (${trackQuestionLinks} curated links)`,
);
for (const [role, counts] of Object.entries(byRole)) {
  console.log(`  ${role.padEnd(8)} fresher ${counts.fresher}  mid ${counts.mid}`);
}
