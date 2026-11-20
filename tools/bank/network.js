// Network security. Freshers get the protocol questions; mid-level gets asked
// to make a call that costs the business something.

export const NETWORK = [
  /* ------------------------------------------------------- fresher */
  {
    slug: 'tcp-handshake', level: 'fresher', topic: 'tcp',
    prompt: 'Explain the TCP three-way handshake.',
    answer: 'The client sends SYN with its initial sequence number, the server replies SYN-ACK acknowledging it and offering its own, the client replies ACK. The point is that both sides agree on sequence numbers and both prove they can receive, which is what makes blind spoofing hard. Say why it exists, not just the three words.',
    followUps: [
      { prompt: 'You see thousands of SYNs with no completing ACKs. What is happening?',
        answer: 'Half-open connections, so either a SYN flood or a scan. A flood is trying to exhaust the backlog; a scan is looking for open ports and usually comes with RSTs. Tell them apart by volume, how spread the sources are, and whether the destination ports vary or stay fixed.' },
      { prompt: 'How would you confirm it, and what would you actually do?',
        answer: 'Confirm with a capture and the host\'s own connection-state counters rather than trusting the alert. Mitigation is SYN cookies, rate limiting at the edge, and upstream filtering once the volume exceeds your link. If it is a scan rather than a flood, the answer is blocking and investigating the source, not tuning the stack.' },
    ],
  },
  {
    slug: 'stateful-firewall', level: 'fresher', topic: 'firewalls',
    prompt: 'What is the difference between a stateful and a stateless firewall?',
    answer: 'A stateless firewall judges each packet in isolation. A stateful one tracks connections, so return traffic for an established session is allowed without a matching inbound rule. Stateful is why you do not have to write a rule for every ephemeral port on the way back.',
    followUps: [
      { prompt: 'Which goes at the perimeter, and why?',
        answer: 'Stateful, because the perimeter is exactly where you need to tell solicited return traffic from unsolicited inbound traffic. A stateless filter there either blocks legitimate replies or forces rules so broad they stop meaning anything.' },
      { prompt: 'What does stateful inspection cost you that stateless does not?',
        answer: 'Memory and a finite connection table, which is itself a target: fill the table and the device starts dropping or fails open. It costs per-connection processing at high throughput, and it makes failover harder, because state has to be synchronised or every session breaks on cutover.' },
    ],
  },
  {
    slug: 'dns-resolution', level: 'fresher', topic: 'dns',
    prompt: 'Walk me through how a name gets resolved, and tell me where you would tamper with it if you were an attacker.',
    answer: 'Browser cache, OS cache, configured resolver, then recursion from root to TLD to authoritative, with the answer cached at each hop by TTL. An attacker goes for whichever step is softest: the host file, the resolver setting, a registrar account, or cache poisoning. The caching is the interesting part, because it is what makes a bad answer stick.',
    followUps: [
      { prompt: 'A user says one site is wrong but everyone else is fine. Where do you look?',
        answer: 'Start local, because that is where the difference is. Host file, the resolver that machine is actually using, and any proxy or VPN in the path. Compare their answer against a known-good resolver from the same network, which tells you in one step whether it is the machine or the network.' },
      { prompt: 'What does DNSSEC actually protect against, and what does it not?',
        answer: 'It gives you integrity: the answer came from the zone owner and was not altered. It does not give you confidentiality, so the query is still visible, and it says nothing about whether the domain is trustworthy. A signed answer from a malicious domain is still perfectly valid.' },
    ],
  },
  {
    slug: 'nat-investigation', level: 'fresher', topic: 'addressing',
    prompt: 'What is NAT, and why does it make your job harder?',
    answer: 'NAT rewrites addresses so many internal hosts share one public address. The investigative cost is that an external log showing your public address identifies the company, not the machine. Without NAT translation logs correlated by source port and exact timestamp, an abuse report is unactionable.',
    followUps: [
      { prompt: 'You get an abuse report naming your public IP at 14:32. What do you need to find the host?',
        answer: 'The translation logs for that window, plus the source port and ideally the destination, because the public address alone maps to hundreds of machines. If those logs are not kept, say so plainly: the honest answer is that you cannot identify the host, and the finding is the missing log.' },
      { prompt: 'CGNAT at the ISP sits in front of you too. What does that change?',
        answer: 'The same problem one layer up, and now it is someone else\'s logs. It also means an external address in your own logs may be shared by many unrelated subscribers, so blocking or attributing on that address alone hits bystanders. Weight address-based indicators accordingly.' },
    ],
  },
  {
    slug: 'tls-what-it-gives', level: 'fresher', topic: 'crypto',
    prompt: 'HTTP versus HTTPS: what exactly does TLS give you, and what does it not?',
    answer: 'Confidentiality in transit, integrity so content cannot be altered undetected, and authentication of the server through its certificate. What it does not give you is a safe site, a safe endpoint, or hidden metadata: the destination address and the hostname in SNI are still visible, and the data is plaintext again the moment it arrives.',
    followUps: [
      { prompt: 'A phishing site has a valid padlock. Explain that to a user.',
        answer: 'The padlock means the connection to that site is private, not that the site is honest. Certificates are free and issued in minutes to anyone who controls a domain, including attackers. Tell users to read the domain, not the lock, and stop teaching the lock as a safety signal.' },
      { prompt: 'Your company inspects TLS at the proxy. What are you giving up?',
        answer: 'You break end-to-end encryption on purpose, so the proxy becomes a single place where all plaintext exists and a very high-value target. You also create legal and privacy obligations around what is inspected, and you break certificate pinning in some apps. It is a real trade, and the honest answer names both sides.' },
    ],
  },
  {
    slug: 'vpn-protects', level: 'fresher', topic: 'remote-access',
    prompt: 'What is a VPN actually protecting against?',
    answer: 'It protects traffic in transit across a network you do not trust, and for corporate use it puts the device inside a network boundary. That is it. It does not make the endpoint safe, it does not make you anonymous to the sites you visit, and a compromised laptop on a VPN is a compromised laptop with a route into the office.',
    followUps: [
      { prompt: 'Everyone is remote. Is a VPN still the right model?',
        answer: 'It is one model, and it has a known weakness: once you are in, you are inside. The alternative is per-application access with identity and device posture checked on every request, which removes the all-or-nothing boundary. Name the trade rather than reciting a buzzword, because most organisations end up running both for years.' },
      { prompt: 'Split tunnelling: good or bad?',
        answer: 'It depends on what you give up. Split tunnelling saves bandwidth and keeps the concentrator alive, but it means the device\'s general internet traffic never passes your inspection, so you lose that visibility. If the endpoint has its own telemetry you can live with it. If the VPN was your only visibility, you cannot.' },
    ],
  },

  /* ----------------------------------------------------------- mid */
  {
    slug: 'segmentation', level: 'mid', topic: 'segmentation',
    prompt: 'You are asked to segment a flat corporate network. Where do you start?',
    answer: 'With what talks to what, not with the diagram you wish you had. Collect flow data long enough to cover monthly jobs, group assets by function and sensitivity, then design the fewest zones that separate what must not reach each other. Enforce in monitor mode before you enforce for real.',
    followUps: [
      { prompt: 'Finance says segmentation will break their reporting tool.',
        answer: 'Get the actual flows rather than the claim: source, destination, port, frequency. It is usually a handful you can allow explicitly. If the tool genuinely needs broad access, that becomes a documented exception with a compensating control and a named owner, not a reason to abandon the zone.' },
      { prompt: 'How do you prove the segmentation holds?',
        answer: 'Test from inside each zone: attempt the connections that should fail and confirm they fail at the enforcement point, not just that nobody complained. Keep it as a repeatable check, because rule sprawl quietly re-flattens a network inside a year and nobody notices until an incident.' },
    ],
  },
  {
    slug: 'dns-exfil', level: 'mid', topic: 'dns',
    prompt: 'You see repeated TXT queries to a domain registered three days ago. What is your read?',
    answer: 'That shape fits DNS tunnelling or beaconing: TXT carries more than A records, and a newly registered domain is a standard indicator. Look at query volume, subdomain entropy, how regular the timing is, and which host is asking. Clockwork intervals mean a process, not a person.',
    followUps: [
      { prompt: 'How do you tell exfiltration from a misconfigured tool?',
        answer: 'Content and direction. Tunnelling shows long, high-entropy subdomain labels and sustained two-way volume; a misbehaving security or telemetry agent queries a vendor domain with predictable labels. Identifying the process on the host settles it faster than any amount of packet analysis.' },
      { prompt: 'What do you block, and what breaks if you are wrong?',
        answer: 'Sinkhole that domain, not TXT records and not the resolver. If you are wrong you break one tool and hear about it in minutes, which is recoverable. Blocking at the resolver breaks name resolution for everyone, which is an outage you caused while chasing a maybe.' },
    ],
  },
  {
    slug: 'egress-filtering', level: 'mid', topic: 'architecture',
    prompt: 'Design egress filtering for an office of three hundred people. Where do you start and where do you stop?',
    answer: 'Start by learning what actually leaves, then default-deny the protocols nobody should be using outbound directly, such as DNS to anything but your resolvers, SMTP, and arbitrary high ports. Force web traffic through a proxy you can see. Stop short of a full allowlist of destinations unless the business is one that can live with it.',
    followUps: [
      { prompt: 'Engineering says default-deny will break their builds hourly.',
        answer: 'They are probably right, and that is an argument about sequencing, not direction. Run in log-only mode long enough to capture the real destination set, give them a documented path to request additions with a fast turnaround, and enforce per segment rather than everywhere at once. Enforcement without a working exception process always gets rolled back.' },
      { prompt: 'What does this actually buy you against a determined attacker?',
        answer: 'Not prevention. It buys constraint and signal: it pushes them onto the few channels you watch closely, and it turns a silent exfiltration into a blocked connection that fires an alert. Claiming it stops a capable attacker is the answer that loses credibility in the room.' },
    ],
  },
  {
    slug: 'lateral-movement', level: 'mid', topic: 'detection',
    prompt: 'You cannot segment the network this quarter. How do you detect lateral movement anyway?',
    answer: 'Watch for the behaviours segmentation would have blocked: workstation-to-workstation SMB or RDP, which almost never happens legitimately, authentication from one account across many hosts in a short window, and admin tools running where no admin works. Detection cannot replace segmentation, but it shortens the time you are blind.',
    followUps: [
      { prompt: 'Your IT team does exactly that all day with remote support tools.',
        answer: 'Then baseline them and alert on the exception: the named support accounts from their jump hosts are normal, and the same behaviour from a finance laptop is not. The work is identifying the legitimate pattern precisely enough that everything outside it is interesting, which is most of the effort in any detection like this.' },
      { prompt: 'What is the single highest-value log source here?',
        answer: 'Authentication, specifically where each account signs in and from what. Lateral movement is an identity story before it is a network story, and account-to-host mapping catches techniques that never generate distinctive network traffic at all.' },
    ],
  },
  {
    slug: 'vpn-saturated', level: 'mid', topic: 'troubleshooting',
    prompt: 'The VPN concentrator is saturated and people cannot work. Diagnose it.',
    answer: 'Separate the three candidates before touching anything: more users than capacity, one user or process consuming the link, or the device itself degraded. Check concurrent sessions against the licensed and tested limit, top talkers by volume, and CPU on the box. Then say which it is rather than restarting and hoping.',
    followUps: [
      { prompt: 'It is one host pushing enormous volume. Is that an incident?',
        answer: 'It might be a backup client, a sync tool, or exfiltration, and the destination tells you which in about a minute. Treat it as a performance issue until the destination says otherwise, but do look, because "the network was slow" is how a number of real exfiltrations were first noticed and then dismissed.' },
      { prompt: 'Leadership wants it fixed now. What do you do first?',
        answer: 'Restore service with the least destructive lever: throttle or disconnect the one offending session rather than resetting the device and dropping three hundred people. Then say what the permanent fix is, capacity or split tunnelling or both, and what it costs. Fix now, design later, but do not let later never come.' },
    ],
  },
];
