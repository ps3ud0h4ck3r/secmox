// The question bank, one file per role.
//
// Each entry needs: slug (permanent), level, topic, prompt, answer, followUps.
// The role comes from which file it lives in. Ids are built as
// q_<role>_<level>_<slug>, so reordering a file renames nothing and never
// orphans a recorded attempt.
//
// Regenerate seed.sql after editing:  node tools/seed.js

import { SOC } from './bank/soc.js';
import { NETWORK } from './bank/network.js';
import { PENTEST } from './bank/pentest.js';
import { CLOUD } from './bank/cloud.js';
import { GRC } from './bank/grc.js';

const BY_ROLE = { soc: SOC, network: NETWORK, pentest: PENTEST, cloud: CLOUD, grc: GRC };

export const QUESTIONS = Object.entries(BY_ROLE).flatMap(([role, items]) =>
  items.map((item) => ({ ...item, role })),
);

export function questionId(item) {
  return `q_${item.role}_${item.level}_${item.slug}`;
}
