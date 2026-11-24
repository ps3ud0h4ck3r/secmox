// Per-attempt variable substitution for scenario chains. Authored scenarios use
// {{kind}} placeholders (e.g. {{ip}}, {{host}}, {{time}}); each time a chain is
// served, every unique placeholder gets a fresh generated value, consistent
// within that chain. The correct answer is concept-based, so it never changes;
// only the surface details do. This keeps a scenario from looking identical on
// every attempt and makes rote memorisation of specifics useless.

const PREFIXES = ['FIN', 'HR', 'ENG', 'OPS', 'SALES', 'DEV', 'IT', 'CORP'];
const SVC = ['backup', 'sql', 'web', 'scan', 'deploy', 'monitor', 'jenkins', 'ftp'];
const WORDS = ['exfil', 'data', 'sync', 'update', 'cdn', 'assets', 'beacon'];
const EVIL = ['attacker', 'baddomain', 'evilcorp', 'darkhost', 'threatco'];
const BUCKET = ['acme', 'globex', 'initech', 'umbrella', 'hooli', 'stark'];
const BUCKET2 = ['invoices', 'backups', 'exports', 'customer-data', 'reports', 'uploads'];
const FIRST = ['priya', 'arjun', 'sam', 'maria', 'chen', 'omar', 'lena', 'raj'];

const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, arr) => arr[rint(rng, 0, arr.length - 1)];

// Generate a value for a placeholder kind. Deterministic given rng.
export function genValue(kind, rng) {
  switch (kind) {
    case 'ip':
      // A public-looking IPv4 (avoids the usual private ranges).
      return `${pick(rng, [185, 45, 91, 194, 103, 23, 141, 212])}.${rint(rng, 0, 255)}.${rint(rng, 0, 255)}.${rint(rng, 1, 254)}`;
    case 'intip':
      // An internal IPv4.
      return `10.${rint(rng, 0, 60)}.${rint(rng, 0, 255)}.${rint(rng, 2, 254)}`;
    case 'host':
      return `${pick(rng, PREFIXES)}-WS-${String(rint(rng, 2, 99)).padStart(2, '0')}`;
    case 'srv':
      return `${pick(rng, PREFIXES)}-SRV-${String(rint(rng, 1, 9)).padStart(2, '0')}`;
    case 'svc':
      return `svc-${pick(rng, SVC)}`;
    case 'user':
      return `${pick(rng, FIRST)}.${pick(rng, ['s', 'k', 'm', 'r', 'n'])}`;
    case 'domain':
      return `${pick(rng, WORDS)}.${pick(rng, EVIL)}.com`;
    case 'bucket':
      return `${pick(rng, BUCKET)}-${pick(rng, BUCKET2)}`;
    case 'port':
      return String(pick(rng, [8080, 8443, 3389, 445, 1433, 3306, 5432, 6379]));
    case 'time': {
      const h = rint(rng, 1, 5);
      const m = String(rint(rng, 0, 59)).padStart(2, '0');
      return `${h}:${m} AM`;
    }
    default:
      return kind;
  }
}

const TOKEN = /\{\{([a-z]+)(?::([a-z0-9]+))?\}\}/g;

// One value per unique token across all the given texts.
export function buildVarMap(texts, rng = Math.random) {
  const map = {};
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(TOKEN)) {
      if (!(m[0] in map)) map[m[0]] = genValue(m[1], rng);
    }
  }
  return map;
}

export function fill(text, map) {
  return (text || '').replace(TOKEN, (tok) => (tok in map ? map[tok] : tok));
}

// Fill a served chain's visible text (scenario, step prompts, options). Answers
// and explanations are concept-based and left untouched.
export function fillChain(chain, rng = Math.random) {
  const texts = [chain.scenario, ...chain.steps.flatMap((s) => [s.prompt, ...s.options])];
  const map = buildVarMap(texts, rng);
  return {
    ...chain,
    scenario: fill(chain.scenario, map),
    steps: chain.steps.map((s) => ({
      ...s,
      prompt: fill(s.prompt, map),
      options: s.options.map((o) => fill(o, map)),
    })),
  };
}
