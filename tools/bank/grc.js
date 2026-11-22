// Governance, risk and compliance. The round here tests whether a candidate
// can hold a line with the business, not whether they can recite a standard.

export const GRC = [
  /* ------------------------------------------------------- fresher */
  {
    slug: 'policy-standard-procedure', level: 'fresher', topic: 'documents', difficulty: 1,
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
    slug: 'risk-register', level: 'fresher', topic: 'risk', difficulty: 1,
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
    slug: 'dpdp-basics', level: 'fresher', topic: 'privacy', difficulty: 2,
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
    slug: 'audit-vs-assessment', level: 'fresher', topic: 'assurance', difficulty: 1,
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
    slug: 'least-privilege-practice', level: 'fresher', topic: 'controls', difficulty: 1,
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
    slug: 'owner-refuses', level: 'fresher', topic: 'behavioural', difficulty: 2,
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
    slug: 'iso-six-months', level: 'mid', topic: 'certification', difficulty: 3,
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
    slug: 'third-party-risk', level: 'mid', topic: 'vendors', difficulty: 2,
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
    slug: 'after-breach', level: 'mid', topic: 'regulatory', difficulty: 3,
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
    slug: 'measure-programme', level: 'mid', topic: 'metrics', difficulty: 3,
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
    slug: 'soc2-vs-iso', level: 'mid', topic: 'certification', difficulty: 2,
    prompt: 'Explain SOC 2 and ISO 27001 to a CFO who wants to know which one to pay for.',
    answer: 'ISO 27001 certifies a management system against an international standard and travels well, especially in Europe and Asia. SOC 2 is an attestation report by an auditor on how your controls operated, and North American customers ask for it by name. The CFO question is not which is better, it is which one your buyers are asking for.',
    followUps: [
      { prompt: 'They ask whether doing one makes the other cheap.',
        answer: 'Cheaper, not cheap. A lot of the underlying evidence overlaps, so the second costs noticeably less than the first, but the framing, scope and auditor work differ. Give them a rough ratio and say it depends on how well the first was scoped, rather than promising a number you will have to walk back.' },
      { prompt: 'They ask whether either means you cannot be breached.',
        answer: 'No, and say it directly. Both tell a customer that you run a managed programme and that an independent party checked it. Neither is a guarantee, and a certified company can still be breached. Overselling this is how security loses the room the first time something goes wrong.' },
    ],
  },

  /* ----------------------------------------- batch 1 (added 2026-11-22) */
  {
    slug: "cia-real-tradeoff", level: "fresher", topic: "fundamentals", difficulty: 1,
    prompt: "The CIA triad gets recited a lot. Give me a real decision where confidentiality and availability actually pulled against each other.",
    answer: "Locking an account after failed logins: it protects confidentiality by stopping a guesser, and it harms availability because a real user, or an attacker spraying known usernames, can lock people out. Or encryption where the only key holder leaves and the data is now safe and also unrecoverable. The triad is not a slogan, it is a set of trade-offs you have to actually choose between.",
    followUps: [
      { prompt: "How do you make that lockout decision, then?",
        answer: "By the context: how sensitive the account is, how likely an attack is, and what being locked out costs. A banking admin and a public forum get different answers, which is the point, the right control depends on what you are protecting and from whom." },
      { prompt: "Is one of the three ever simply more important?",
        answer: "Depends entirely on the business. For a hospital system, availability can be life-or-death; for a secrets vault, confidentiality wins. Anyone who says one always leads has not had to make the trade with real consequences." },
    ],
  },
  {
    slug: "control-types-stolen-laptop", level: "fresher", topic: "controls", difficulty: 2,
    prompt: "Preventive, detective, corrective: give me one real control of each for a stolen laptop, and which you would fund first.",
    answer: "Preventive is full-disk encryption, so the thief gets a brick. Detective is an alert when the device checks in from somewhere new or is reported missing. Corrective is a remote wipe and re-issue. I fund encryption first, because detection and response after a loss are cold comfort if the data was readable the moment it left the building.",
    followUps: [
      { prompt: "Why not fund detection first, so you at least know?",
        answer: "Because knowing a readable laptop is gone does not protect the data on it; it just tells you the breach already happened. Prevention changes the outcome, detection changes only your awareness of it, so for a loss you cannot undo, prevention earns the first rupee." },
      { prompt: "The laptop was encrypted but the password was on a sticky note on it. Now what?",
        answer: "Then the control did not operate, which is the whole lesson: a control on paper is not a control in practice. It becomes an awareness and enforcement problem, and in a report I would record it as a control that existed but failed to operate, which is different from one that was missing." },
    ],
  },
  {
    slug: "compliance-vs-risk", level: "fresher", topic: "risk", difficulty: 2,
    prompt: "A control is required by a standard but makes no sense for your actual risk. What do you do?",
    answer: "I do not just ignore it, and I do not blindly implement theatre either. I document why it does not fit, put a compensating control in place if the underlying intent still matters, and record a risk acceptance with an owner if it genuinely does not apply. Compliance and security are not the same thing, but you manage the gap openly rather than pretending it is not there.",
    followUps: [
      { prompt: "The auditor will not accept your compensating control. Then what?",
        answer: "Then it becomes a business decision with the cost on the table: implement the required control anyway for the certification, or accept not having that certification. My job is to make the trade-off and its cost visible, not to quietly fail the audit or quietly fake the control." },
      { prompt: "Where is the line between pragmatism and just dodging controls?",
        answer: "Writing it down. A documented, owned, reasoned deviation is risk management; an undocumented one you hope nobody notices is negligence. The control you skipped is only defensible if you can show the thinking and someone signed for it." },
    ],
  },
  {
    slug: "what-counts-as-evidence", level: "fresher", topic: "assurance", difficulty: 1,
    prompt: "An auditor asks for evidence that a control works. What counts, and what does not?",
    answer: "What counts is proof it actually operated: logs showing it ran, tickets showing it was followed, configurations showing it is set, samples over a period rather than one lucky day. What does not count is the policy that says it should happen. The difference an auditor is testing is between saying you do something and showing that you did.",
    followUps: [
      { prompt: "You have the policy but no records that anyone followed it. What does that tell the auditor?",
        answer: "That the control exists on paper and may not exist in practice, which is often worse than having no policy, because it shows the organisation knows what it should do and is not doing it. A policy with no evidence is a finding, not a defence." },
      { prompt: "The control ran, but only because you knew the audit was coming. Honest evidence?",
        answer: "No. A control that operates only when watched is not operating; it is a performance. Honest assurance samples across normal time, and if it only works under observation, the real finding is that it does not work." },
    ],
  },
  {
    slug: "risk-in-money-to-the-board", level: "mid", topic: "risk", difficulty: 3,
    prompt: "The board asks how much cyber risk you have, in money. How do you answer honestly?",
    answer: "In ranges with stated assumptions, not a single confident figure. I would frame it as likelihood times impact across the scenarios that actually threaten us, show the big drivers, and be explicit about what is estimated. A precise-sounding number invented to satisfy the question is worse than an honest range, because the board will treat false precision as fact and plan around it.",
    followUps: [
      { prompt: "The board wants one number, not a range. How do you handle that?",
        answer: "I give a central estimate and immediately show the range around it, because the spread is the information. Collapsing it to one number hides the uncertainty that should drive how much they spend, so I answer the question without pretending the uncertainty is not there." },
      { prompt: "Is this quantification worth doing if it is all estimates?",
        answer: "Yes, if it is honest, because it turns vague fear into a comparable number that can be weighed against the cost of fixing it. The value is in the relative comparison and the conversation, not in the decimal places, and good estimation beats no estimation and beats fake precision." },
    ],
  },
  {
    slug: "who-declares-a-breach", level: "mid", topic: "incident", difficulty: 2,
    prompt: "Who decides when an incident becomes a breach that must be reported, and why does that matter?",
    answer: "It should be decided by defined criteria and a named owner agreed before anything happens, not argued out in the heat of the moment. It matters because reporting obligations come with clocks and legal exposure, and the decision is easier to get wrong, or to delay, exactly when everyone is stressed. Deciding who calls it and on what basis is itself a control.",
    followUps: [
      { prompt: "Why is deciding this in advance so important?",
        answer: "Because in the middle of an incident there is pressure to downplay, and the regulatory clock may already be running. A criterion written in calm beats a judgement made in panic, and it protects the person who has to make the call from having to invent the rule under fire." },
      { prompt: "Who should own that decision?",
        answer: "Someone with the authority and the context to act, usually a defined incident lead with legal and leadership in the loop, named ahead of time. What you want to avoid is everyone assuming someone else is making the call while the clock runs out." },
    ],
  },
  {
    slug: "critical-vendor-wont-comply", level: "mid", topic: "vendors", difficulty: 3,
    prompt: "A critical vendor will not meet your security requirements, but the business needs them. What is your actual move?",
    answer: "I treat it as risk management, not a gate. I understand exactly what the vendor touches and what could go wrong, then reach for compensating controls on our side, contract terms that put obligations and liability in writing, and monitoring of the connection. If residual risk remains, it gets accepted explicitly by someone senior enough to own it. A flat no the business overrules anyway protects nobody.",
    followUps: [
      { prompt: "Is there a point where you do say no?",
        answer: "When the residual risk after everything you can do is still unacceptable and the owner will not accept it in writing. The no has to be defensible and specific, tied to what cannot be mitigated, not a reflex because a questionnaire came back short." },
      { prompt: "What is wrong with just refusing the vendor outright?",
        answer: "The business often needs them anyway and will go around you, which leaves the risk in place and you out of the loop. Engaging to reduce and own the risk keeps you in the decision; refusing on principle gets you ignored and the risk unmanaged." },
    ],
  },
  {
    slug: "awareness-training-doesnt-work", level: "mid", topic: "awareness", difficulty: 2,
    prompt: "Security awareness training mostly does not change behaviour. What would you do differently?",
    answer: "Stop measuring completion and start measuring behaviour: phishing-report and click rates, not slides watched. Make it targeted and role-based so finance hears about invoice fraud and developers hear about secrets, keep it short and frequent rather than an annual marathon, and most of all make the secure path the easy one, because people route around friction no matter how much they were trained.",
    followUps: [
      { prompt: "Give me an example of making the secure path the easy one.",
        answer: "A one-click report-phishing button that actually gets a response, or a password manager provided and set up so a strong unique password is less effort than reuse. When doing it right is easier than doing it wrong, behaviour changes without a lecture." },
      { prompt: "How would you prove your programme is working?",
        answer: "By movement in the behaviours over time: report rates up, click rates down, repeat offenders shrinking, and real reports arriving early. Those are outcomes; completion percentages are activity, and activity is not the same as a workforce that actually catches things." },
    ],
  },

];
