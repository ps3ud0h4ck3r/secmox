// Cloud security. Written provider-neutral on purpose: candidates get asked
// the same questions whichever platform the company runs, and naming one
// vendor's service is not the same as understanding the control.

export const CLOUD = [
  /* ------------------------------------------------------- fresher */
  {
    slug: 'shared-responsibility', level: 'fresher', topic: 'fundamentals', difficulty: 1,
    prompt: 'Explain the shared responsibility model.',
    answer: 'The provider secures the infrastructure the service runs on; the customer secures what they put in it and how they configure it. The line moves by service type, with managed services taking more of the stack, but identity, access and data configuration stay with the customer in every model.',
    followUps: [
      { prompt: 'Who is responsible for a storage bucket left public?',
        answer: 'The customer. The provider supplies the controls and increasingly defaults them to private, but the configuration is the customer\'s. Nearly every public-bucket incident is a decision somebody made, not a provider failure.' },
      { prompt: 'Name two things people assume the provider handles but it does not.',
        answer: 'Backups and retention for managed data stores, which are usually opt-in and the customer\'s to configure and actually test. And logging: control-plane and data-plane logs often need enabling and paying for, and if nobody turned them on there is no investigation after an incident.' },
    ],
  },
  {
    slug: 'public-bucket', level: 'fresher', topic: 'storage', difficulty: 2,
    prompt: 'A storage bucket is publicly readable. Walk me through the fix.',
    answer: 'Establish exposure first: what is in it, for how long, and whether access logs show reads from outside. Then remove public access at the account level rather than object by object. Only after that work out how it happened, because the same mechanism has usually produced others you have not found yet.',
    followUps: [
      { prompt: 'It serves a static website that genuinely must stay public.',
        answer: 'Separate what must be public from what must not: one bucket holding only published assets, everything else moved out. Serve it through a CDN with the origin locked to the CDN rather than exposing the bucket, and keep account-level blocks on every other bucket.' },
      { prompt: 'How do you stop the next one?',
        answer: 'Enforcement, not a reminder: account-level public access blocks, a policy that refuses to create public buckets, and a check in the pipeline so it fails before it ships. Then alert on changes to that configuration, because a control is only as good as the notice you get when someone turns it off.' },
    ],
  },
  {
    slug: 'iam-basics', level: 'fresher', topic: 'iam', difficulty: 1,
    prompt: 'What is cloud IAM, and how is it different from a username and a password?',
    answer: 'It is policy-based authorisation over every API call, for people and for workloads. The difference is granularity and reach: a policy says which identity may take which action on which resource under which conditions, and machines get identities too. A control-plane permission can be far more dangerous than a login, because it rewrites the environment.',
    followUps: [
      { prompt: 'Which is more dangerous, a leaked user password or a leaked access key?',
        answer: 'Usually the key. It carries whatever the identity can do, it works from anywhere without a browser, it does not prompt for a second factor, and keys rarely expire. A password often sits behind MFA and conditional access, while a key quietly works until somebody revokes it.' },
      { prompt: 'What does an identity policy not protect you from?',
        answer: 'Anything done with legitimate permissions, which is most of what goes wrong. A correctly scoped identity used by the wrong person looks exactly like normal activity, which is why least privilege narrows the blast radius but logging and anomaly detection are what notice.' },
    ],
  },
  {
    slug: 'security-groups', level: 'fresher', topic: 'network', difficulty: 2,
    prompt: 'What does a cloud security group actually do, and what does it not?',
    answer: 'It is a stateful virtual firewall attached to an instance or interface, allowing traffic by port, protocol and source. It does not inspect content, it does not stop anything already running on the host, and on most platforms it cannot express a deny rule, only an absence of allow.',
    followUps: [
      { prompt: 'You find one with 0.0.0.0/0 on port 22. Is that always a finding?',
        answer: 'Practically always, but check before calling it, because the fix depends on why. Sometimes it is a jump host nobody cleaned up after; sometimes a real administrative path that should be going through a bastion or a managed session service. The finding is the open path, the recommendation depends on the reason.' },
      { prompt: 'They say it is fine because the instance has no public IP.',
        answer: 'Then verify it, because that changes the exposure. A rule that is broad but unreachable is lower priority, not a non-issue: the next change that attaches a public address or a load balancer makes it live, with nobody re-reading the rule. Narrow it anyway and say why.' },
    ],
  },
  {
    slug: 'first-three-cloud', level: 'fresher', topic: 'strategy', difficulty: 2,
    prompt: 'A company is moving to cloud. Name the three things you would secure first, and defend the order.',
    answer: 'Identity, then logging, then network exposure. Identity because the control plane is the new perimeter and a compromised admin identity is total loss. Logging second because without it you cannot investigate anything, including whether the first item already failed. Exposure third because it is the one you can keep fixing after the fact.',
    followUps: [
      { prompt: 'Why logging before fixing open ports?',
        answer: 'Because a missing control can be closed next week, but a missing log is gone for good. Turn on control-plane logging on day one and you can reconstruct what happened during the messy migration. Leave it until later and the whole early period is permanently unexaminable.' },
      { prompt: 'Leadership says that is too slow. What do you drop?',
        answer: 'Nothing on that list, but you can shrink it: MFA on privileged identities rather than a full identity redesign, logging on at default settings rather than a tuned pipeline, and public exposure only on internet-facing accounts. Offer a smaller version with a date rather than agreeing to skip a layer.' },
    ],
  },

  /* ----------------------------------------------------------- mid */
  {
    slug: 'secrets-handling', level: 'mid', topic: 'secrets', difficulty: 2,
    prompt: 'How do you handle secrets in a cloud application?',
    answer: 'In a managed secret store, injected at runtime, never in the repository, the image, or environment variables baked at build. Access scoped by identity, reads logged, rotation automated. Where the platform supports workload identity, use it and delete the long-lived credential entirely, because the best secret is the one that does not exist.',
    followUps: [
      { prompt: 'A developer committed a key to a public repository. What is your first hour?',
        answer: 'Rotate first, investigate second. Revoke immediately, because removing the commit does not remove it from forks, caches or anyone who scraped it within seconds. Then pull the audit log for everything that key did from the moment it was pushed. The repository history and the conversation with the developer come after.' },
      { prompt: 'How do you know it was not used before you rotated?',
        answer: 'The audit log filtered by that credential, from push to revocation: unfamiliar addresses, unusual regions, enumeration patterns, changes to identity or logging configuration. If logging was not on for that service, say so plainly. You cannot prove a negative, and the honest answer is that you do not know.' },
    ],
  },
  {
    slug: 'wildcard-iam', level: 'mid', topic: 'iam', difficulty: 2,
    prompt: 'An IAM role has wildcard permissions. How do you fix it without breaking production?',
    answer: 'Do not guess a replacement policy. Determine what the role actually uses from access logs over a period long enough to include monthly jobs, build least privilege from observed calls, then run it in a mode that reports denials before enforcing. Narrow in stages, not in one change at the end of a sprint.',
    followUps: [
      { prompt: 'Nobody knows what the role uses. How do you find out?',
        answer: 'Query the control-plane audit log for calls made by that role, grouped by service and action, over at least a full reporting cycle. Most providers also expose last-accessed data per service, which hands you the unused surface immediately. Use both: one shows what is used, the other shows what safely is not.' },
      { prompt: 'How do you stop it drifting back to wildcards?',
        answer: 'Policy as code with review, an organisation-level guardrail that refuses wildcard actions on sensitive services, and an alert on policy changes. Drift happens at 2am during an outage, so the control has to be a refusal at deploy time rather than a quarterly audit that finds it months later.' },
    ],
  },
  {
    slug: 'cloud-incident', level: 'mid', topic: 'incident-response', difficulty: 3,
    prompt: 'You suspect a compromise in a cloud account. How is the investigation different from an on-premises one?',
    answer: 'The control plane is both the crime scene and the toolkit. Your primary evidence is the API audit log rather than disk, and the attacker\'s most valuable moves are configuration changes: new identities, new keys, policy edits, logging disabled. You can also snapshot and isolate instantly, which is a real advantage if you use it before you start poking.',
    followUps: [
      { prompt: 'What do you preserve first, and how?',
        answer: 'The audit log, exported out of the account to somewhere the attacker\'s identity cannot reach, because an attacker with control-plane access can stop or delete logging. Then snapshot affected volumes and capture instance metadata. Preservation comes before eradication: rebuilding first destroys the only account of what happened.' },
      { prompt: 'The attacker created a new access key on an existing role. What else do you check?',
        answer: 'Everything that key touched, and then everything else they may have planted: other new keys and identities, trust policy edits that let an outside account assume a role, new regions suddenly in use, and changes to logging or alerting. Revoking one key and declaring victory is the standard mistake.' },
    ],
  },
  {
    slug: 'container-root', level: 'mid', topic: 'containers', difficulty: 2,
    prompt: 'A container is running as root. How bad is it, and what do you do?',
    answer: 'On its own it is a weakness, not a breach: root in the container is not root on the host unless something else gives way. It matters because it removes a layer, so a code execution bug becomes a much better position, and it combines badly with a privileged flag, a mounted socket or a host path. Judge it with what is next to it.',
    followUps: [
      { prompt: 'It also mounts the container runtime socket. Now how bad?',
        answer: 'Now it is effectively host compromise, because that socket lets you start a new container with the host filesystem mounted. That combination is one of the most reliable escapes there is. This stops being a hardening item and becomes something you fix this week, with the nodes it ran on treated as suspect.' },
      { prompt: 'The team says the image will not run as non-root.',
        answer: 'Usually it is file ownership or a low port, and both have standard fixes: adjust ownership in the build, or bind higher and map the port. Ask them to show what fails rather than accepting the claim. If it genuinely cannot change, it needs isolation, a user namespace and a documented exception, not a shrug.' },
    ],
  },
  {
    slug: 'secure-cicd', level: 'mid', topic: 'pipeline', difficulty: 3,
    prompt: 'How do you secure a CI/CD pipeline, and why is it worth the effort?',
    answer: 'Because the pipeline deploys to production, so compromising it beats compromising production. Secure it as a production system: short-lived credentials from workload identity rather than stored keys, no secrets in logs, pinned third-party actions, review required on the pipeline definition itself, and separate credentials per environment.',
    followUps: [
      { prompt: 'What is the most commonly missed one?',
        answer: 'The pipeline definition being editable by anyone who can push, which means a branch can rewrite how production is deployed. The other is a workflow that runs on pull requests from forks with access to real secrets, which hands credentials to anyone on the internet who opens a PR.' },
      { prompt: 'How would you detect a compromised pipeline?',
        answer: 'Alert on the pipeline\'s own identity doing something outside its pattern: deploying from an unusual branch, touching resources it never touches, or running at an odd hour. Also watch for edits to the pipeline definition outside the normal review path. The build identity is usually highly privileged and almost never monitored.' },
    ],
  },

  /* ----------------------------------------- batch 1 (added 2026-11-22) */
  {
    slug: "first-logging-service", level: "fresher", topic: "logging", difficulty: 1,
    prompt: "What is the one logging service you turn on first in a new cloud account, and why?",
    answer: "The account's audit trail, the service that records who did what: every API call, who made it, from where, and whether it succeeded. I turn it on first because without it you are blind to your own account, and after an incident it is the difference between reconstructing what happened and guessing. It is also the thing attackers try to turn off.",
    followUps: [
      { prompt: "An attacker disables it. How would you know?",
        answer: "The act of disabling it is itself a logged event, right up until it stops, so the last entry is a tell. That is why the logs should be delivered somewhere the account being watched cannot reach, so turning them off locally does not erase the trail." },
      { prompt: "Logging everything gets expensive. How do you decide what to keep?",
        answer: "Keep the management-plane trail, who-did-what, essentially forever and cheaply in cold storage, and be selective about high-volume data-plane logs. The audit trail is small and priceless; the per-object access logs are large and you keep what you would actually investigate." },
    ],
  },
  {
    slug: "leaked-access-key", level: "fresher", topic: "incident", difficulty: 2,
    prompt: "A developer pasted a cloud access key into a public code repository. Walk me through the next hour.",
    answer: "Rotate and revoke the key first, before anything else, because it is public and bots scrape for exactly this within minutes. Then work out what that key could do, how over-privileged it was, and pull the audit log to see whether it was already used and for what. Removing it from the repository is last and almost beside the point, since it is already copied.",
    followUps: [
      { prompt: "You revoke it and the audit log shows it was used from an unknown IP ten minutes ago. Now what?",
        answer: "It is an incident, not a near miss. I scope what that key touched in those ten minutes, assume anything it could reach is compromised, and widen from there: new resources, new keys, changed permissions. The key being dead now does not undo what it did while alive." },
      { prompt: "How do you stop the next one reaching the repo at all?",
        answer: "Secret scanning on commits so a key is caught before it lands, short-lived credentials instead of long-lived keys, and making the easy path the safe one so developers are not tempted to paste a static key in the first place." },
    ],
  },
  {
    slug: "lock-down-root-account", level: "fresher", topic: "iam", difficulty: 1,
    prompt: "The root or owner account of a cloud organisation: what do you lock down on day one?",
    answer: "Hardware or app multi-factor on it, no daily use so it is reserved for the few things only it can do, no access keys attached to it, and alerting whenever it is used at all. The root account can undo every other control, so it is the one account where a compromise is total, and it should be boring and rarely touched.",
    followUps: [
      { prompt: "Why does it matter that root has no access keys?",
        answer: "Because an access key is a long-lived credential that can be leaked, and on the root account that is catastrophic. A human logging in with MFA for a rare task is defensible; a static all-powerful key sitting in a config somewhere is not." },
      { prompt: "You get an alert that root just logged in. What is your first question?",
        answer: "Was it us? I want to know who, from where, and for what planned task, because a legitimate root login is a scheduled, announced, rare event. An unexplained one is treated as a compromise until proven otherwise." },
    ],
  },
  {
    slug: "public-disk-snapshot", level: "fresher", topic: "storage", difficulty: 2,
    prompt: "A disk snapshot is shared publicly. Why does that matter more than it sounds?",
    answer: "Because a snapshot is a copy of a whole disk: the operating system, the application, and whatever secrets, keys, and data were on it at the moment it was taken. A public snapshot is not a misconfigured setting, it is a data breach waiting for someone to mount it, and people do scan for them.",
    followUps: [
      { prompt: "How is this worse than a public storage bucket?",
        answer: "A bucket exposes the objects someone put in it; a disk snapshot exposes everything, including the things nobody meant to be data: credentials in config files, tokens in memory dumps, private keys. The blast radius is the whole machine, not a folder." },
      { prompt: "You make it private again. Is the incident over?",
        answer: "No. If it was public you have to assume it was copied, so you rotate every credential that was on that disk and investigate what the exposed data could unlock. Making it private stops new access; it does not recall what already left." },
    ],
  },
  {
    slug: "cloud-privesc", level: "mid", topic: "privilege-escalation", difficulty: 3,
    prompt: "In the cloud, how does an attacker turn a low-privilege foothold into admin, and how would you spot it?",
    answer: "Usually through the identity layer, not an exploit: a role that can pass a more privileged role to a service, attach a policy to itself, create access keys for another identity, or update a function that already runs with high permissions. You spot it in the audit trail, where these are all logged API calls that look wrong for the identity making them, like a low-privilege user suddenly editing IAM.",
    followUps: [
      { prompt: "Which single permission would worry you most to hand out loosely?",
        answer: "The ability to modify IAM itself, such as attaching policies or passing roles. It is the master key: anything that can change permissions can grant itself everything, so it is the one I watch and scope hardest." },
      { prompt: "Your detection is only the audit log. Is that enough here?",
        answer: "For this it is strong, because cloud privilege escalation is made of API calls and the log records them. The gap is speed: the log tells you after the fact, so the value is in alerting on the dangerous calls in near real time, not reading it next week." },
    ],
  },
  {
    slug: "find-everything-internet-facing", level: "mid", topic: "exposure", difficulty: 2,
    prompt: "How do you find everything in a cloud account that is reachable from the internet?",
    answer: "Not by looking at one thing: public IPs on instances, load balancers, storage buckets and their policies, managed databases with public access, API gateways, and functions with public URLs. It is an inventory problem more than a scanning problem, because the account can expose things in a dozen ways, and the one you forget is the one that bites.",
    followUps: [
      { prompt: "Why not just run an external port scan and call it done?",
        answer: "A scan finds open ports on IPs you point it at, but it misses the managed services with their own endpoints, the buckets that are not ports at all, and anything that spun up after you scanned. The cloud exposes things a port scan never sees." },
      { prompt: "How do you keep this current as the account changes daily?",
        answer: "Make it continuous, not a one-off: query the provider's own inventory and configuration data on a schedule and alert on new public exposure. In a cloud that changes by the hour, a quarterly audit is a snapshot of a thing that has already moved." },
    ],
  },
  {
    slug: "why-many-cloud-accounts", level: "mid", topic: "architecture", difficulty: 3,
    prompt: "Why do mature organisations use many cloud accounts instead of one big one, from a security view?",
    answer: "To bound the blast radius. If production, development, and each team live in separate accounts, a compromise or a mistake in one does not reach the others, permissions stay scoped, and billing and ownership are clear. The cost is complexity: more to manage, and you need a way to govern them centrally, so it is a trade of simplicity for containment.",
    followUps: [
      { prompt: "What is the risk of getting the central governance wrong?",
        answer: "You recreate the single big account through the back door: one over-powerful management account or role that can reach into all the others. If that is compromised, separation buys you nothing, so the governing layer is the thing you protect hardest." },
      { prompt: "A small startup with one account asks if they are doing it wrong. Your answer?",
        answer: "No, not yet. Many accounts earns its complexity at scale; for a small team one well-run account with clear separation inside it is fine. The mistake is copying a big company's structure before you have the size or the people to run it." },
    ],
  },
  {
    slug: "serverless-security-shift", level: "mid", topic: "serverless", difficulty: 2,
    prompt: "What changes about security when the application is serverless functions instead of servers?",
    answer: "You stop patching hosts, which is a real win, but the risk moves to the identity and the glue: each function has its own permissions that are easy to over-grant, functions are triggered by events that can be poisoned, and your dependencies and third-party packages become a larger part of your attack surface. You trade operating-system patching for permission hygiene and supply-chain care.",
    followUps: [
      { prompt: "Where do over-permissioned functions come from, and why do they matter?",
        answer: "From copying a broad policy because it was easy and it worked. They matter because a compromised function inherits its permissions, so a function that only needed to read one bucket but was granted the account becomes a full foothold." },
      { prompt: "What is event injection in this world?",
        answer: "Trusting the trigger. A function fired by a file upload, a queue message, or an HTTP call is processing attacker-influenced input, and if it treats that input as trusted, the same injection problems you had on servers come back through the event instead of a form." },
    ],
  },

];
