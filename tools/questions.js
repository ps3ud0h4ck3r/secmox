// The starter bank. Each question carries the follow-ups an interviewer
// actually asks next, which is the part candidates lose the room on.
//
// Regenerate seed.sql after editing:  node tools/seed.js

export const QUESTIONS = [
  /* ------------------------------------------------------------ SOC */
  {
    role: 'soc', level: 'fresher', topic: 'triage',
    prompt: 'An alert fires: several failed SSH logins from one IP, then a successful one. What do you do first?',
    answer: 'Establish scope before acting. Confirm the source IP and whether it is internal or external, which account succeeded, and whether that account normally logs in from there. Check what the session did after login, especially privilege changes. Do not close it as a brute force just because the pattern looks familiar.',
    followUps: [
      { prompt: 'The successful login was a different account from the failed ones. Does that change your read?',
        answer: 'Yes, and it makes it worse. Failures on one account and success on another suggests either credential spraying across accounts or an attacker who already held working credentials and the failures were noise. Pivot to: what else did that account touch, and were there successes elsewhere you have not alerted on.' },
      { prompt: 'The account belongs to a developer who says it was him. How do you verify?',
        answer: 'Do not take the word alone. Match the source IP against his known locations and VPN logs, check the user agent or client version, confirm the timing against his working hours, and ask what he was doing at that minute. If he was working, the failures still need explaining, because a legitimate user rarely fails three times on a different account.' },
    ],
  },
  {
    role: 'soc', level: 'fresher', topic: 'detection',
    prompt: 'What is the difference between an IDS and an IPS?',
    answer: 'An IDS observes and alerts; an IPS sits inline and can drop. The real difference is consequence: a false positive on an IDS is noise, a false positive on an IPS is an outage. That is why IPS rules are deployed in detect mode first and promoted to block only once the noise is understood.',
    followUps: [
      { prompt: 'Your IPS is dropping legitimate traffic. What do you change first?',
        answer: 'Move the offending signature to alert-only rather than disabling the whole policy or the device. That stops the damage while keeping visibility. Then identify the exact rule and the traffic it matched before you decide whether to tune the rule, exempt the source, or fix the application.' },
      { prompt: 'Who signs off on that change, and what goes in the ticket?',
        answer: 'Change goes through whoever owns the control, usually network or security engineering, with the application owner informed. The ticket records which rule, why it was changed, what traffic it was matching, what the temporary state is, when it will be reviewed, and who approved it. A tuning change with no review date becomes a permanent blind spot.' },
    ],
  },
  {
    role: 'soc', level: 'fresher', topic: 'phishing',
    prompt: 'A user reports a phishing email. Walk me through what you do.',
    answer: 'Preserve the original with headers before anything else. Pull the sender, reply-to, originating IP, authentication results, links and attachments. Detonate links and attachments in a sandbox, never on your own machine. Then determine who else received it and whether anyone interacted.',
    followUps: [
      { prompt: 'The user already clicked the link. What changes?',
        answer: 'It moves from analysis to containment. Find out what the page asked for and whether credentials were entered. If they were, reset the password and invalidate active sessions and tokens, not just the password. Check for mailbox rules created after the click, which is the usual first move after a mailbox compromise.' },
      { prompt: 'How do you find out who else received it?',
        answer: 'Search the mail gateway or mail platform by sender, subject, originating IP and URL, not just the exact subject line, because the campaign will vary it. Then check who opened and who clicked, and purge the message from remaining mailboxes. Report the delivered-versus-clicked numbers, because that is what the business will ask.' },
    ],
  },
  {
    role: 'soc', level: 'mid', topic: 'endpoint',
    prompt: 'Your EDR flags a signed binary behaving unusually. How do you triage it?',
    answer: 'A valid signature says who built it, not that the behaviour is safe. Look at what the process actually did: parent process, command line, network destinations, files written, persistence created. Signed binaries get abused for living-off-the-land execution, so the behaviour chain matters more than the reputation score.',
    followUps: [
      { prompt: 'The signature is valid and the vendor is well known. Still suspicious?',
        answer: 'Yes, if the behaviour does not match what that binary exists to do. A known-good tool launched by an unusual parent, with arguments that pull a remote payload, is a classic abuse pattern. Treat the question as whether this execution is expected on this host, not whether the file is malicious in general.' },
      { prompt: 'You decide to contain. What exactly do you contain, and what do you tell the business?',
        answer: 'Isolate the host at the network level while keeping your own access for investigation, rather than powering it off and losing memory. Block the command-and-control destination at the egress point. Tell the business which host, what it can no longer do, what the user should expect, and what you need from them, in plain terms and with a time you will next update them.' },
    ],
  },
  {
    role: 'soc', level: 'mid', topic: 'tuning',
    prompt: 'How do you tune a noisy detection rule without going blind to the thing it was built for?',
    answer: 'Start from what the rule is supposed to catch, then measure what it is actually matching. Narrow by the attribute that separates benign from malicious, usually a specific process, account or destination, rather than lowering severity or widening the time window. Record the exclusion and why, so the next analyst can see the gap you accepted.',
    followUps: [
      { prompt: 'The noise comes from one application the business will not change. Now what?',
        answer: 'Scope the exclusion as tightly as the application allows: that service account, on those hosts, to those destinations. Then add a narrower compensating rule that would still fire if the excluded pattern were abused, and document the residual risk so it is a decision on record rather than a silent hole.' },
      { prompt: 'Six months later, how do you know the tuning is still right?',
        answer: 'Review exclusions on a schedule and test them. Confirm the application still behaves the way the exclusion assumes, and validate the rule still fires on the original behaviour using an atomic test. An exclusion that nobody has revisited is a control that nobody can vouch for.' },
    ],
  },

  /* -------------------------------------------------------- network */
  {
    role: 'network', level: 'fresher', topic: 'tcp',
    prompt: 'Explain the TCP three-way handshake.',
    answer: 'The client sends SYN with its initial sequence number, the server replies SYN-ACK acknowledging it and sending its own, the client replies ACK. After that the connection is established. The point of the exchange is that both sides agree on sequence numbers and both prove they can receive, which is what makes blind spoofing hard.',
    followUps: [
      { prompt: 'You see thousands of SYNs with no completing ACKs. What is happening?',
        answer: 'Half-open connections, which is either a SYN flood or a scan. A flood aims to exhaust the backlog; a scan is looking for open ports and usually comes with RSTs. Distinguish by volume, source spread, and whether the destination ports vary or stay fixed.' },
      { prompt: 'How would you confirm it, and what would you do about it?',
        answer: 'Confirm with a capture and connection-state counters on the host, checking backlog and half-open counts rather than relying on the alert alone. Mitigation is SYN cookies, rate limiting at the edge, and upstream filtering if the volume exceeds your link. If it is a scan rather than a flood, the response is blocking and investigating the source, not tuning the stack.' },
    ],
  },
  {
    role: 'network', level: 'fresher', topic: 'firewalls',
    prompt: 'What is the difference between a stateful and a stateless firewall?',
    answer: 'A stateless firewall evaluates each packet against rules in isolation. A stateful firewall tracks connections, so return traffic for an established session is allowed without a matching inbound rule. Stateful is why you do not have to write a rule for every ephemeral port on the way back.',
    followUps: [
      { prompt: 'Which would you put at the perimeter, and why?',
        answer: 'Stateful, because the perimeter is where you need to distinguish solicited return traffic from unsolicited inbound traffic. A stateless filter at the edge either blocks legitimate replies or forces rules so broad that they stop meaning anything.' },
      { prompt: 'What does stateful inspection cost you that stateless does not?',
        answer: 'Memory and a finite connection table, which is itself a target: fill the table and the device starts dropping or failing open. It also costs per-connection processing, which matters at high throughput, and it makes failover harder because state has to be synchronised or sessions break.' },
    ],
  },
  {
    role: 'network', level: 'mid', topic: 'segmentation',
    prompt: 'You are asked to segment a flat corporate network. Where do you start?',
    answer: 'Start with what talks to what, not with the diagram you wish you had. Collect flow data for long enough to cover monthly jobs, group assets by function and sensitivity, then design the smallest number of zones that separate the things that must not reach each other. Enforce in monitor mode first.',
    followUps: [
      { prompt: 'Finance says segmentation will break their reporting tool. What now?',
        answer: 'Get the actual flows rather than the claim: which source, which destination, which port, how often. Usually it is a handful of flows that can be allowed explicitly. If the tool genuinely needs broad access, that is a documented exception with a compensating control and an owner, not a reason to abandon the zone.' },
      { prompt: 'How do you prove the segmentation actually holds?',
        answer: 'Test it from inside each zone: attempt the connections that should fail and confirm they fail at the enforcement point, not just that nobody has complained. Keep the test as a repeatable check, because firewall rule sprawl quietly re-flattens a network over a year.' },
    ],
  },
  {
    role: 'network', level: 'mid', topic: 'dns',
    prompt: 'You see repeated TXT queries to a domain registered three days ago. What is your read?',
    answer: 'That pattern fits DNS tunnelling or beaconing: TXT records carry more data than A records, and a newly registered domain is a common indicator. Look at query volume, subdomain entropy, timing regularity, and which host is asking. Regular intervals suggest automation rather than a user.',
    followUps: [
      { prompt: 'How would you confirm exfiltration rather than a misconfigured tool?',
        answer: 'Look at the content and direction. Tunnelling shows high-entropy, long subdomain labels and sustained two-way volume; a misconfigured security or telemetry tool usually queries a vendor domain with predictable labels. Identify the process making the queries on the host, which settles it faster than packet analysis alone.' },
      { prompt: 'What do you block, and what breaks if you are wrong?',
        answer: 'Sinkhole the specific domain rather than blocking TXT records or the resolver wholesale. If you are wrong, you break one tool and find out within minutes, which is recoverable. Blocking at the resolver level breaks name resolution for everyone, which is an outage you caused while chasing a maybe.' },
    ],
  },

  /* -------------------------------------------------------- pentest */
  {
    role: 'pentest', level: 'fresher', topic: 'web',
    prompt: 'Which OWASP Top 10 risk do you see most often in real applications, and why that one?',
    answer: 'Broken access control, because it is a logic problem rather than a pattern a scanner matches. Authentication is usually handled by a framework; authorisation is written per endpoint by hand, so one missing ownership check in one route is enough. Answer with the reason it recurs, not just the name.',
    followUps: [
      { prompt: 'Show me how you would test for it on a login-protected endpoint.',
        answer: 'Authenticate as a low-privilege user, capture a request that references an object you own, then replay it with another identifier while keeping your own session. If you get someone else\'s data back, that is the finding. Repeat for write operations, since read and write are often guarded differently.' },
      { prompt: 'The developer says the WAF blocks it. How do you respond?',
        answer: 'Demonstrate it through the WAF, from the same path a real user takes. A WAF matches patterns; an authorisation flaw is a valid, well-formed request that the application should have refused. If it still works end to end, the WAF argument is answered without a debate.' },
    ],
  },
  {
    role: 'pentest', level: 'fresher', topic: 'scope',
    prompt: 'What is the difference between a vulnerability scan and a penetration test?',
    answer: 'A scan enumerates known issues against signatures and reports what might be exploitable. A test attempts to prove impact by chaining findings the way an attacker would. The distinction that matters to a client is that a scan tells you what is present and a test tells you what it is worth.',
    followUps: [
      { prompt: 'A client wants a pentest but the budget fits a scan. What do you tell them?',
        answer: 'Be direct that a scan will not answer the question they are asking, then offer the honest middle: a scan plus manual validation of the highest-impact findings, scoped to the part of the estate that carries the real risk. Selling a scan as a test is how firms lose clients at the next breach.' },
      { prompt: 'What goes into the report that a scanner cannot produce?',
        answer: 'The chain and the business consequence: how three medium findings combined into access to a specific dataset, what an attacker gets at the end, and what to fix first given their constraints. A scanner produces severity; a tester produces a prioritised story the client can act on.' },
    ],
  },
  {
    role: 'pentest', level: 'mid', topic: 'engagement',
    prompt: 'You get a shell on a web server during an engagement. What do you do next?',
    answer: 'Before anything else, confirm the host is in scope and note the time, the access path and what you did, because that record is what makes the finding defensible. Then establish where you are: user context, host role, what the box can reach. Collect what proves impact rather than expanding access for its own sake.',
    followUps: [
      { prompt: 'The scope says web application only. Does that change anything?',
        answer: 'Yes. A shell on the host may already be at or past the boundary. Stop, document the access as the finding, and get written confirmation from the client before touching the host further. The impact is already proven; continuing without authorisation turns a good finding into a contract problem.' },
      { prompt: 'You find evidence someone else was already in there. Now what?',
        answer: 'Stop testing and notify the client immediately through the agreed escalation path, because this is now a live incident and not a test. Preserve what you saw, change nothing, and do not investigate further unless they ask you to. Your own actions also need to be separable from the intruder\'s in their timeline.' },
    ],
  },
  {
    role: 'pentest', level: 'mid', topic: 'reporting',
    prompt: 'How do you decide what to report as critical?',
    answer: 'Critical is about reachable impact, not CVSS alone. Ask what an attacker gets, who can reach it, and what is required to pull it off. An unauthenticated path to customer data is critical; the same bug behind an admin login on an internal network usually is not. State the reasoning so the rating can be argued with.',
    followUps: [
      { prompt: 'The client disagrees with your severity. How do you handle it?',
        answer: 'Ask what they know that you do not, because they often do: a compensating control, a network boundary, data that is not what it looks like. If their information changes the exposure, adjust and say why. If it does not, keep the rating and record their position in the report rather than quietly lowering it.' },
      { prompt: 'What makes a finding actionable rather than just alarming?',
        answer: 'A reproduction a developer can follow, the specific location in the code or configuration, the fix stated in their stack rather than in general terms, and a way to verify the fix worked. Without those, a critical finding sits in a backlog for a year.' },
    ],
  },

  /* ---------------------------------------------------------- cloud */
  {
    role: 'cloud', level: 'fresher', topic: 'fundamentals',
    prompt: 'Explain the shared responsibility model.',
    answer: 'The provider secures the infrastructure the service runs on; the customer secures what they put into it and how they configure it. The line moves by service type: with managed services the provider takes on more of the stack, but identity, access and data configuration stay with the customer in every model.',
    followUps: [
      { prompt: 'Who is responsible for a storage bucket left public?',
        answer: 'The customer. The provider gives the access controls and increasingly defaults them to private, but the configuration is the customer\'s. Nearly every public-bucket incident is a configuration decision, not a provider failure.' },
      { prompt: 'Name two things people assume the provider handles but it does not.',
        answer: 'Backups and retention for data in managed services, which are usually opt-in and the customer\'s to configure and test. And logging: control-plane and data-plane logs often need enabling and paying for, and if nobody turned them on there is no investigation after an incident.' },
    ],
  },
  {
    role: 'cloud', level: 'fresher', topic: 'storage',
    prompt: 'A storage bucket is publicly readable. Walk me through the fix.',
    answer: 'First establish exposure: what is in it, for how long, and whether access logs show reads from outside. Then remove public access at the account level rather than object by object. Only after that work out how it got that way, because the same mechanism has usually produced others.',
    followUps: [
      { prompt: 'The bucket serves a static website that genuinely must stay public. Now what?',
        answer: 'Separate what must be public from what must not: a bucket that holds only published assets, with everything else moved out. Serve it through a CDN with the origin locked to the CDN rather than exposing the bucket directly, and keep account-level blocks on every other bucket.' },
      { prompt: 'How do you stop the next one happening?',
        answer: 'Enforcement rather than a reminder: account-level public access blocks, a policy that refuses to create public buckets, and a check in the deployment pipeline so it fails before it ships. Then alert on any change to that configuration, because the control is only as good as the notice you get when someone disables it.' },
    ],
  },
  {
    role: 'cloud', level: 'mid', topic: 'secrets',
    prompt: 'How do you handle secrets in a cloud application?',
    answer: 'Secrets live in a managed secret store, injected at runtime, never in the repository, the image, or environment variables baked into a build. Access is scoped by identity, reads are logged, and rotation is automated. Where the platform supports workload identity, use it and remove the long-lived credential entirely.',
    followUps: [
      { prompt: 'A developer has committed a key to a public repository. What is your first hour?',
        answer: 'Rotate first, investigate second. Revoke the key immediately, because removing the commit does not remove it from forks, caches or anyone who already scraped it. Then pull the audit log for everything that key did from the moment it was pushed, and only then deal with the repository history and the developer.' },
      { prompt: 'How do you know the key was not used before you rotated it?',
        answer: 'The provider\'s audit log, filtered by that credential, from the push timestamp to revocation. Look for calls from unfamiliar addresses, unusual regions, enumeration patterns, and any change to identity or logging configuration. If logging was not enabled for that service, say so plainly: you cannot prove a negative, and the answer is that you do not know.' },
    ],
  },
  {
    role: 'cloud', level: 'mid', topic: 'iam',
    prompt: 'An IAM role has wildcard permissions. How do you fix it without breaking production?',
    answer: 'Do not guess at a replacement policy. Determine what the role actually uses from access logs over a period long enough to include periodic jobs, build a least-privilege policy from observed calls, then run it alongside in a mode that reports denials before enforcing. Narrow in stages rather than in one change.',
    followUps: [
      { prompt: 'Nobody knows what the role actually uses. How do you find out?',
        answer: 'Query the control-plane audit log for calls made by that role, grouped by service and action, over at least a full billing or reporting cycle. Most providers also expose last-accessed data per service, which gives you the unused surface immediately. Use both: one shows what is used, the other shows what safely is not.' },
      { prompt: 'How do you keep it from drifting back to wildcards?',
        answer: 'Policy as code with review, a guardrail at the organisation level that refuses wildcard actions on sensitive services, and an alert on policy changes. Drift happens when someone is debugging at night, so the control has to be a refusal at deploy time, not a quarterly audit.' },
    ],
  },

  /* ------------------------------------------------------------ GRC */
  {
    role: 'grc', level: 'fresher', topic: 'documents',
    prompt: 'What is the difference between a policy, a standard, and a procedure?',
    answer: 'A policy states intent and is approved by leadership. A standard makes it measurable: the specific requirement something must meet. A procedure is the steps someone follows to meet it. Policies change rarely, standards change with technology, procedures change with tooling.',
    followUps: [
      { prompt: 'An auditor asks for evidence that a policy is followed. What do you show?',
        answer: 'Not the policy. Show output from the control: configuration exports, ticket records, access review sign-offs, log samples across the audit period. Evidence is what the system produced while nobody was watching, not a document describing what should happen.' },
      { prompt: 'The evidence does not exist. What do you do?',
        answer: 'Say so rather than assembling something after the fact, which is how a finding becomes a fraud problem. Record it as a gap, start generating the evidence now, and give a remediation date. Auditors handle known gaps with a plan routinely; they handle fabricated evidence very differently.' },
    ],
  },
  {
    role: 'grc', level: 'fresher', topic: 'risk',
    prompt: 'What does a risk register do, and what makes a bad one?',
    answer: 'It records risks the organisation has decided to track, with an owner, a rating, a treatment decision and a review date. A bad one is a list of vulnerabilities with no owner, no decision and no date, which makes it an inventory nobody acts on rather than a tool for allocating attention.',
    followUps: [
      { prompt: 'A risk has been marked in progress for two years. How do you handle it?',
        answer: 'Treat the status as false and get a decision. Either it is genuinely being treated, in which case it needs a plan with dates, or the organisation has accepted it, in which case say so explicitly with a named accepting owner. A permanent in-progress entry is an unmade decision hiding as work.' },
      { prompt: 'Who should own a risk, security or the business?',
        answer: 'The business function that carries the consequence, because they are the ones who can accept it or fund the fix. Security owns the assessment, the recommendation and the follow-up. When security owns the risk itself, acceptance becomes invisible and nothing gets prioritised against revenue.' },
    ],
  },
  {
    role: 'grc', level: 'mid', topic: 'certification',
    prompt: 'You are asked to get the company ISO 27001 certified in six months. What is your first move?',
    answer: 'Define the scope, because everything else follows from it. Which entity, which locations, which systems, which data. Then run a gap assessment against the controls in that scope to find out what already exists in practice but is undocumented, which is usually more than leadership expects.',
    followUps: [
      { prompt: 'Leadership wants certification without changing how teams work. What do you say?',
        answer: 'Be straight: certification audits evidence of operating controls, so if nothing changes there is nothing to evidence. Then make it tractable by scoping tightly to the part of the business that needs the certificate commercially, rather than diluting the controls across the whole company.' },
      { prompt: 'Where do most first-time certifications actually fail?',
        answer: 'Not on the controls, on the management system: risk assessment that was done once and never revisited, internal audit that did not happen, management review with no record, and corrective actions left open. Those are the clauses auditors check first and the ones teams treat as paperwork.' },
    ],
  },
];
