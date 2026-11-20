// Governance, risk and compliance. The round here tests whether a candidate
// can hold a line with the business, not whether they can recite a standard.

export const GRC = [
  /* ------------------------------------------------------- fresher */
  {
    slug: 'policy-standard-procedure', level: 'fresher', topic: 'documents',
    prompt: 'What is the difference between a policy, a standard and a procedure?',
    answer: 'A policy states intent and is approved by leadership. A standard makes it measurable: the specific requirement a thing must meet. A procedure is the steps someone follows to meet it. Policies change rarely, standards change with technology, procedures change with tooling.',
    followUps: [
      { prompt: 'An auditor asks for evidence that a policy is followed. What do you show?',
        answer: 'Not the policy. Output from the control: configuration exports, ticket records, access review sign-offs, log samples spanning the audit period. Evidence is what the system produced while nobody was watching, not a document describing what ought to happen.' },
      { prompt: 'The evidence does not exist.',
        answer: 'Say so, rather than assembling it afterwards, which is how a finding becomes a fraud problem. Record it as a gap, start generating the evidence now, and give a remediation date. Auditors handle known gaps with a plan every day. They handle fabricated evidence very differently.' },
    ],
  },
  {
    slug: 'risk-register', level: 'fresher', topic: 'risk',
    prompt: 'What does a risk register do, and what makes a bad one?',
    answer: 'It records the risks the organisation has decided to track, each with an owner, a rating, a treatment decision and a review date. A bad one is a list of vulnerabilities with no owner, no decision and no date, which makes it an inventory nobody acts on rather than a tool for allocating attention.',
    followUps: [
      { prompt: 'A risk has been "in progress" for two years.',
        answer: 'Treat the status as false and force a decision. Either it is genuinely being treated, in which case it needs a plan with dates, or the organisation has accepted it, in which case say so explicitly with a named accepting owner. A permanent in-progress entry is an unmade decision hiding as work.' },
      { prompt: 'Who should own a risk, security or the business?',
        answer: 'The function that carries the consequence, because they are the ones who can accept it or fund the fix. Security owns the assessment, the recommendation and the follow-up. When security owns the risk itself, acceptance becomes invisible and nothing ever competes with revenue for budget.' },
    ],
  },
  {
    slug: 'dpdp-basics', level: 'fresher', topic: 'privacy',
    prompt: 'What is India\'s Digital Personal Data Protection Act, and who does it apply to?',
    answer: 'It governs the processing of digital personal data of people in India, and it reaches organisations outside India that process such data to offer goods or services here. It works on consent and stated purpose, puts duties on the data fiduciary to secure data and report breaches, and gives people rights over their own data. Be clear it is principles and duties, not a technical checklist.',
    followUps: [
      { prompt: 'Your company collects phone numbers for delivery updates and later uses them for marketing. Any problem?',
        answer: 'Yes. Consent is tied to a stated purpose, so a new purpose needs fresh consent rather than a clause buried in the original notice. The practical fix is separating consent at collection and holding a record of what was agreed to and when, because the record is what you have to produce later.' },
      { prompt: 'How is that different from GDPR in practice?',
        answer: 'Same direction, different detail, and the honest answer says you would check the text rather than assuming equivalence. The shapes differ on lawful bases, on how children\'s data is handled, and on the regulator and penalty structure. A team that assumes their GDPR programme covers DPDP ends up with gaps it never looked for.' },
    ],
  },
  {
    slug: 'audit-vs-assessment', level: 'fresher', topic: 'assurance',
    prompt: 'What is the difference between an audit and an assessment?',
    answer: 'An audit tests against a defined standard and produces a formal opinion, usually by an independent party, with evidence requirements and consequences. An assessment is advisory: it tells you where you stand and what to improve, with no pass or fail. Confusing them in front of a client is a quick way to lose credibility.',
    followUps: [
      { prompt: 'Internal audit asks you to help them prepare for an external audit. Any issue?',
        answer: 'It depends how far it goes. Helping them understand requirements and find evidence is normal. Writing the evidence they will then test, or testing your own work, destroys the independence the audit exists for. Name the line and say who should do which part.' },
      { prompt: 'The external auditor raises a finding you disagree with.',
        answer: 'Ask what evidence and what clause it rests on, because often it is a scoping misunderstanding you can clear up with one document. If it stands, accept it and fix it. If it genuinely does not, there is a management response process for exactly this. Arguing informally and leaving it unrecorded helps nobody.' },
    ],
  },
  {
    slug: 'least-privilege-practice', level: 'fresher', topic: 'controls',
    prompt: 'What does least privilege mean in practice, not in theory?',
    answer: 'That access is granted for a defined need, scoped to it, and removed when the need ends. The practical work is the removal: joiners get access easily everywhere, movers accumulate it, and leavers get missed. A programme that only controls granting is not doing least privilege, it is doing paperwork at the front door.',
    followUps: [
      { prompt: 'How would you find out whether it is actually happening?',
        answer: 'Sample. Take ten people who changed roles in the last year and check whether their old access went away. Take five leavers and check every system, not just the directory. The gap between the policy and that sample is the real state, and it is usually a surprise to leadership.' },
      { prompt: 'Access reviews come back fully approved every quarter. Believable?',
        answer: 'No. A review where managers approve everything in one click is a signature, not a control. The fix is making the review smaller and more specific, showing what the access actually permits in plain terms, and requiring a reason for keeping anything unused for ninety days.' },
    ],
  },
  {
    slug: 'owner-refuses', level: 'fresher', topic: 'behavioural',
    prompt: 'A business owner refuses a control you have recommended. What do you do?',
    answer: 'Find out why, because the reason is usually cost, timing or a workflow you did not know about, and all three are negotiable. Offer a smaller version or a compensating control. If they still refuse, write it up as an accepted risk with their name on it and a review date. Then move on without sulking.',
    followUps: [
      { prompt: 'They refuse to sign the acceptance too.',
        answer: 'Then escalate, calmly and in writing, to whoever owns the risk above them. Unsigned acceptance is not refusal of the control, it is refusal of accountability for it, and that is a different and more serious problem. Record what was recommended, what was declined, and when you escalated.' },
      { prompt: 'Six months later it causes an incident. How do you handle the conversation?',
        answer: 'Without a told-you-so, which buys nothing and costs the relationship you need for the next control. Produce the record, keep the focus on fixing it now, and let the decision trail speak. The organisations that learn from this are the ones where raising it was not treated as blame.' },
    ],
  },

  /* ----------------------------------------------------------- mid */
  {
    slug: 'iso-six-months', level: 'mid', topic: 'certification',
    prompt: 'You are asked to get the company ISO 27001 certified in six months. What is your first move?',
    answer: 'Define the scope, because everything follows from it: which entity, which locations, which systems, which data. Then run a gap assessment against the controls in that scope, which usually finds more already happening in practice but undocumented than leadership expects.',
    followUps: [
      { prompt: 'Leadership wants certification without changing how teams work.',
        answer: 'Say plainly that certification audits evidence of operating controls, so if nothing changes there is nothing to evidence. Then make it tractable: scope tightly to the part of the business that needs the certificate commercially, rather than diluting controls across the whole company to keep everyone comfortable.' },
      { prompt: 'Where do first-time certifications actually fail?',
        answer: 'Not on the controls, on the management system. Risk assessment done once and never revisited, internal audit that did not happen, management review with no record, corrective actions left open. Those are the clauses auditors check first and the ones teams dismiss as paperwork.' },
    ],
  },
  {
    slug: 'third-party-risk', level: 'mid', topic: 'vendors',
    prompt: 'How do you run third-party risk assessment that is not just a questionnaire nobody reads?',
    answer: 'Tier vendors by what they can actually reach: data, network access, business criticality. Spend the effort on the top tier and let the long tail be light. Ask for evidence rather than self-attestation where it matters, and put the answers into the contract, because a questionnaire with no contractual teeth changes nothing.',
    followUps: [
      { prompt: 'A critical vendor refuses to share their audit report.',
        answer: 'Find out whether it is confidentiality or absence, because those are different problems. Confidentiality is solvable with an NDA or a summary. If the report does not exist, that is the finding, and the decision moves up to whoever is willing to accept depending on that vendor without assurance.' },
      { prompt: 'What do you do between assessments?',
        answer: 'Watch for the things that change without telling you: breach disclosures, ownership changes, certificate lapses, and your own usage growing past what was assessed. Annual assessment with nothing in between means your view of a vendor is on average six months out of date.' },
    ],
  },
  {
    slug: 'after-breach', level: 'mid', topic: 'regulatory',
    prompt: 'Your company has had a breach. What does the regulator ask for, and what will you wish you had?',
    answer: 'What happened, when you knew, what data and how many people, what you did, and how you are preventing recurrence. What you will wish you had is a timeline supported by evidence rather than recollection, and proof that your controls were operating before the incident, not just documented.',
    followUps: [
      { prompt: 'Your detection timeline has a four-day gap nobody can explain.',
        answer: 'Report the gap as a gap. An honest unexplained window is survivable; a confident timeline that later turns out to be wrong is not, because it recasts everything else you said as unreliable. Say what you know, what you cannot establish, and why.' },
      { prompt: 'Legal wants to delay notification while the investigation continues.',
        answer: 'There is a real tension and it is not yours to resolve alone, but notification clocks generally start on becoming aware, not on finishing the investigation. Your job is to make sure the decision is made knowingly, with the deadline and the facts in front of the people accountable, and recorded.' },
    ],
  },
  {
    slug: 'measure-programme', level: 'mid', topic: 'metrics',
    prompt: 'How do you measure whether a security programme is actually working?',
    answer: 'Pick measures tied to outcomes and to how fast you respond, not to activity. Time to detect and time to contain, coverage of critical assets by the controls that matter, how long high findings stay open, and how much of your estate you can actually see. Counting blocked attacks or training completions measures effort, not effect.',
    followUps: [
      { prompt: 'The board wants a single number.',
        answer: 'Give them three at most, with a trend and a plain sentence each, and refuse the single score politely. A composite number hides the thing that is getting worse inside the thing that is getting better, and the first time it does that in public it stops being believed.' },
      { prompt: 'A metric is improving but you do not believe it.',
        answer: 'Check what behaviour it created, because people optimise what is measured. Mean time to close drops beautifully when tickets get closed without fixing anything. Validate against the underlying reality by sampling, and change the measure if it has started rewarding the wrong move.' },
    ],
  },
  {
    slug: 'soc2-vs-iso', level: 'mid', topic: 'certification',
    prompt: 'Explain SOC 2 and ISO 27001 to a CFO who wants to know which one to pay for.',
    answer: 'ISO 27001 certifies a management system against an international standard and travels well, especially in Europe and Asia. SOC 2 is an attestation report by an auditor on how your controls operated, and North American customers ask for it by name. The CFO question is not which is better, it is which one your buyers are asking for.',
    followUps: [
      { prompt: 'They ask whether doing one makes the other cheap.',
        answer: 'Cheaper, not cheap. A lot of the underlying evidence overlaps, so the second costs noticeably less than the first, but the framing, scope and auditor work differ. Give them a rough ratio and say it depends on how well the first was scoped, rather than promising a number you will have to walk back.' },
      { prompt: 'They ask whether either means you cannot be breached.',
        answer: 'No, and say it directly. Both tell a customer that you run a managed programme and that an independent party checked it. Neither is a guarantee, and a certified company can still be breached. Overselling this is how security loses the room the first time something goes wrong.' },
    ],
  },
];
