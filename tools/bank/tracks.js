// Company interview tracks. Each one shapes the existing question bank into a
// company-flavoured run: what that kind of employer tends to put the weight on,
// the rounds you usually meet, and a curated, ordered set of questions to drill
// against it.
//
// Honesty line that must stay true: these reflect commonly reported hiring
// patterns for each company and role, gathered from public accounts. They are
// not insider knowledge and not a promise that a given interview will follow
// this shape. The questions are the point; the company framing is the lens.
//
// `questions` are [role, level, slug] triples into the main bank. seed.js
// resolves them to ids and drops any that no longer exist, so a retired
// question just thins a track rather than breaking the build.
//
// `role` and `level` are the primary tags used for filtering and the badge; a
// track may still curate a few questions from a neighbouring role where the
// real interview does.
//
// `tier` is 'free' for every track in this first set. The column exists so that
// when paid plans land, some tracks can move behind one without a schema change.
// Until then nothing here is locked.

export const TRACKS = [
  {
    slug: 'tcs-soc-analyst',
    company: 'TCS',
    role: 'soc',
    level: 'fresher',
    title: 'SOC Analyst',
    tier: 'free',
    blurb:
      'A services giant hiring freshers into a security operations centre. The bar is not depth, it is whether you have the fundamentals straight and can stay calm and methodical when an alert lands.',
    rounds: [
      { name: 'Online test', what: 'Aptitude and basic technical multiple choice before anyone talks to you. Clear it by not being careless, not by being brilliant.' },
      { name: 'Technical interview', what: 'Fundamentals and a scenario or two. They want to hear a structured way of thinking, not a memorised definition.' },
      { name: 'Managerial and HR', what: 'Why security, why TCS, can you work shifts, will you stay. Attitude and fit, lightly technical.' },
    ],
    focus: [
      'Clear fundamentals over clever answers: what a SIEM does, IDS versus IPS, the difference between a threat, a vulnerability and a risk.',
      'A calm, stepwise response to an alert rather than jumping to a conclusion.',
      'Reading a log line and saying what it tells you and what it does not.',
      'Shift work and process discipline: they run a 24x7 floor and are hiring for reliability.',
    ],
    prep:
      'Get the vocabulary exact and be able to walk an alert end to end out loud. For a services SOC role, a composed "here is how I would approach it" beats a half-remembered fact every time.',
    questions: [
      ['soc', 'fresher', 'why-soc'],
      ['soc', 'fresher', 'what-siem-does'],
      ['soc', 'fresher', 'threat-vuln-risk'],
      ['soc', 'fresher', 'ids-vs-ips'],
      ['soc', 'fresher', 'read-auth-line'],
      ['soc', 'fresher', 'phishing-report'],
      ['soc', 'fresher', 'ssh-bruteforce'],
      ['soc', 'fresher', 'unknown-alert'],
      ['soc', 'fresher', 'beaconing-host'],
      ['soc', 'fresher', 'severity-gut-vs-tool'],
    ],
  },

  {
    slug: 'infosys-security-analyst',
    company: 'Infosys',
    role: 'soc',
    level: 'fresher',
    title: 'Security Analyst',
    tier: 'free',
    blurb:
      'A broad fresher security role at a large services firm. The net is wider than pure SOC: expect security basics mixed with networking, because they slot you where the project needs you.',
    rounds: [
      { name: 'Online assessment', what: 'Aptitude, logical reasoning and some technical multiple choice. A filter, not the interview.' },
      { name: 'Technical interview', what: 'A sweep across security and networking fundamentals. Breadth matters more than any one deep dive.' },
      { name: 'HR', what: 'Fit, flexibility, and whether you will go where the bench sends you.' },
    ],
    focus: [
      'Security and networking basics together: the handshake, ports, what a firewall actually does, alongside SOC fundamentals.',
      'Breadth. They are not testing one specialism, they are checking you are not shallow anywhere.',
      'Explaining a concept plainly, which is a tell for whether you understand it or memorised it.',
      'Adaptability, because the role is defined by the project you land on, not a fixed job.',
    ],
    prep:
      'Spread your prep across security and networking rather than going deep on one. The failure mode here is a candidate strong on SOC who freezes on a basic networking question, or the reverse.',
    questions: [
      ['soc', 'fresher', 'why-soc'],
      ['soc', 'fresher', 'what-siem-does'],
      ['network', 'fresher', 'tcp-handshake'],
      ['network', 'fresher', 'ports-on-a-web-server'],
      ['network', 'fresher', 'stateful-firewall'],
      ['soc', 'fresher', 'url-to-render'],
      ['pentest', 'fresher', 'owasp-most-common'],
      ['network', 'fresher', 'dns-resolution'],
      ['soc', 'fresher', 'phishing-report'],
      ['soc', 'fresher', 'unknown-alert'],
    ],
  },

  {
    slug: 'wipro-vapt',
    company: 'Wipro',
    role: 'pentest',
    level: 'fresher',
    title: 'VAPT / Pentest',
    tier: 'free',
    blurb:
      'A vulnerability-assessment and penetration-testing role leaning more hands-on than a generic analyst seat. They want to know you can actually test something, not just name the OWASP Top Ten.',
    rounds: [
      { name: 'Online test', what: 'Technical multiple choice and aptitude. Web and network security basics show up here.' },
      { name: 'Technical interview', what: 'Hands-on leaning: how you would test a thing, how you confirm a finding, how you rate it. Expect to be pushed past the definition.' },
      { name: 'HR', what: 'Standard fit and availability round.' },
    ],
    focus: [
      'The difference between running a scanner and actually testing, and what you do when the tool finds nothing.',
      'The common web bugs explained to a developer: XSS, CSRF, SQL injection, not as names but as what goes wrong and how you would prove it.',
      'Confirming a finding rather than reporting a scanner guess.',
      'Method and honesty: a tester who over-claims is a liability, and interviewers probe for it.',
    ],
    prep:
      'Be ready to say how you would confirm, not just detect, each bug. The strongest signal in a VAPT interview is a candidate who distinguishes "the tool flagged it" from "I proved it", and who is comfortable saying a finding was a false positive.',
    questions: [
      ['pentest', 'fresher', 'scan-vs-test'],
      ['pentest', 'fresher', 'owasp-most-common'],
      ['pentest', 'fresher', 'what-recon-gets-you'],
      ['pentest', 'fresher', 'ran-the-tool-found-nothing'],
      ['pentest', 'fresher', 'explain-xss-to-a-dev'],
      ['pentest', 'fresher', 'explain-csrf'],
      ['pentest', 'fresher', 'sqli-confirm'],
      ['pentest', 'fresher', 'app-lets-you-upload-files'],
      ['pentest', 'fresher', 'default-creds'],
      ['pentest', 'fresher', 'test-session-handling'],
    ],
  },

  {
    slug: 'accenture-cloud-security',
    company: 'Accenture',
    role: 'cloud',
    level: 'mid',
    title: 'Cloud Security',
    tier: 'free',
    blurb:
      'A cloud security seat at a consulting-heavy firm, pitched at someone with a little experience. The weight is on shared responsibility, identity, and reasoning through a misconfiguration the way a client would need you to.',
    rounds: [
      { name: 'Online assessment', what: 'Technical and aptitude screen. Cloud and security fundamentals appear.' },
      { name: 'Technical interview', what: 'Shared responsibility, IAM, and a misconfiguration scenario. They want applied reasoning, not a certification recital.' },
      { name: 'Client-fit / HR', what: 'Communication and consulting fit, because you may sit in front of a client.' },
    ],
    focus: [
      'Shared responsibility in practice, and what a public bucket or an over-broad IAM policy actually exposes.',
      'Identity as the real perimeter: least privilege, wildcard permissions, stopping self-escalation.',
      'Finding what is internet-facing and handling secrets properly.',
      'Walking an incident clearly, since a consultant has to explain it to a client who is not technical.',
    ],
    prep:
      'Practise reasoning out loud from a misconfiguration to its blast radius. In a consulting cloud interview, how clearly you explain the risk matters as much as spotting it, because explaining it to the client is the job.',
    questions: [
      ['cloud', 'fresher', 'shared-responsibility'],
      ['cloud', 'fresher', 'public-bucket'],
      ['cloud', 'fresher', 'security-groups'],
      ['cloud', 'mid', 'find-everything-internet-facing'],
      ['cloud', 'mid', 'wildcard-iam'],
      ['cloud', 'mid', 'secrets-handling'],
      ['cloud', 'mid', 'vpc-peering-expanded-what'],
      ['cloud', 'mid', 'stop-self-escalation'],
      ['cloud', 'mid', 'cloud-incident'],
    ],
  },

  {
    slug: 'deloitte-grc-risk-advisory',
    company: 'Deloitte',
    role: 'grc',
    level: 'mid',
    title: 'GRC / Risk Advisory',
    tier: 'free',
    blurb:
      'A governance, risk and compliance role in a Big Four advisory practice. It is as much about communication and client credibility as technical control knowledge, and the interview reflects that.',
    rounds: [
      { name: 'Aptitude / case', what: 'A reasoning or case-style screen. They are checking structured thinking before anything else.' },
      { name: 'Technical interview', what: 'Frameworks, risk, and controls, with scenarios. Expect to connect a control to a real business risk, not just name it.' },
      { name: 'Partner / HR', what: 'Client readiness, communication, and maturity. In advisory, you represent the firm in the room.' },
    ],
    focus: [
      'Fundamentals that advisors live on: the CIA trade-off, the risk register, policy versus standard versus procedure, audit versus assessment.',
      'Frameworks and how they overlap, so you are not re-doing the same work three times for three standards.',
      'Translating risk into money and into language a board will act on.',
      'Measuring whether a programme actually works, rather than whether it exists on paper.',
    ],
    prep:
      'Rehearse explaining risk to a non-technical executive in plain, confident language. In Big Four advisory, the candidate who can turn a control into a business consequence stands out, because that is what clients pay for.',
    questions: [
      ['grc', 'fresher', 'cia-real-tradeoff'],
      ['grc', 'fresher', 'risk-register'],
      ['grc', 'fresher', 'audit-vs-assessment'],
      ['grc', 'fresher', 'policy-standard-procedure'],
      ['grc', 'mid', 'soc2-type-1-vs-2'],
      ['grc', 'mid', 'third-party-risk'],
      ['grc', 'mid', 'overlapping-frameworks'],
      ['grc', 'mid', 'risk-in-money-to-the-board'],
      ['grc', 'mid', 'measure-programme'],
    ],
  },

  {
    slug: 'hcltech-network-security',
    company: 'HCLTech',
    role: 'network',
    level: 'fresher',
    title: 'Network Security',
    tier: 'free',
    blurb:
      'A fresher network security role at a large services firm with heavy infrastructure work. The fundamentals of how traffic moves and how it is controlled are the whole game here.',
    rounds: [
      { name: 'Online test', what: 'Technical multiple choice and aptitude, networking-leaning.' },
      { name: 'Technical interview', what: 'Core networking and where security sits on top of it. They want the model clear in your head, not recited.' },
      { name: 'HR', what: 'Fit, shifts, and willingness to work across infrastructure projects.' },
    ],
    focus: [
      'How traffic actually moves: the handshake, ports, DNS, and what each OSI layer is for in a real incident.',
      'What controls the traffic: stateful firewalls, VPNs, and why VLANs alone are not segmentation.',
      'Reading a capture and knowing what to look at first.',
      'The honest limits of wireless security versus the theatre of it.',
    ],
    prep:
      'Make sure the networking model is second nature, then layer the security on top. The common failure in a network security interview is a candidate who knows the security buzzwords but fumbles the plumbing underneath them.',
    questions: [
      ['network', 'fresher', 'tcp-handshake'],
      ['network', 'fresher', 'ports-on-a-web-server'],
      ['network', 'fresher', 'which-osi-layer-attacks-live'],
      ['network', 'fresher', 'dns-resolution'],
      ['network', 'fresher', 'stateful-firewall'],
      ['network', 'fresher', 'vpn-protects'],
      ['network', 'fresher', 'arp-for-defenders'],
      ['network', 'fresher', 'vlan-is-not-segmentation'],
      ['network', 'fresher', 'first-look-at-a-pcap'],
      ['network', 'fresher', 'corporate-wifi-real-vs-theatre'],
    ],
  },
];
