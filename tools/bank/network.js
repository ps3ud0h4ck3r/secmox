// Network security. Freshers get the protocol questions; mid-level gets asked
// to make a call that costs the business something.

export const NETWORK = [
  /* ------------------------------------------------------- fresher */
  {
    slug: 'tcp-handshake', level: 'fresher', topic: 'tcp', difficulty: 1,
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
    slug: 'stateful-firewall', level: 'fresher', topic: 'firewalls', difficulty: 1,
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
    slug: 'dns-resolution', level: 'fresher', topic: 'dns', difficulty: 2,
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
    slug: 'nat-investigation', level: 'fresher', topic: 'addressing', difficulty: 2,
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
    slug: 'tls-what-it-gives', level: 'fresher', topic: 'crypto', difficulty: 2,
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
    slug: 'vpn-protects', level: 'fresher', topic: 'remote-access', difficulty: 1,
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
    slug: 'segmentation', level: 'mid', topic: 'segmentation', difficulty: 3,
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
    slug: 'dns-exfil', level: 'mid', topic: 'dns', difficulty: 2,
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
    slug: 'egress-filtering', level: 'mid', topic: 'architecture', difficulty: 3,
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
    slug: 'lateral-movement', level: 'mid', topic: 'detection', difficulty: 3,
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
    slug: 'vpn-saturated', level: 'mid', topic: 'troubleshooting', difficulty: 2,
    prompt: 'The VPN concentrator is saturated and people cannot work. Diagnose it.',
    answer: 'Separate the three candidates before touching anything: more users than capacity, one user or process consuming the link, or the device itself degraded. Check concurrent sessions against the licensed and tested limit, top talkers by volume, and CPU on the box. Then say which it is rather than restarting and hoping.',
    followUps: [
      { prompt: 'It is one host pushing enormous volume. Is that an incident?',
        answer: 'It might be a backup client, a sync tool, or exfiltration, and the destination tells you which in about a minute. Treat it as a performance issue until the destination says otherwise, but do look, because "the network was slow" is how a number of real exfiltrations were first noticed and then dismissed.' },
      { prompt: 'Leadership wants it fixed now. What do you do first?',
        answer: 'Restore service with the least destructive lever: throttle or disconnect the one offending session rather than resetting the device and dropping three hundred people. Then say what the permanent fix is, capacity or split tunnelling or both, and what it costs. Fix now, design later, but do not let later never come.' },
    ],
  },

  /* ----------------------------------------- batch 1 (added 2026-11-22) */
  {
    slug: "ports-on-a-web-server", level: "fresher", topic: "ports", difficulty: 1,
    prompt: "Which ports would you expect open on a normal web server, and which one open would make you look twice?",
    answer: "80 and 443 for the site itself, and probably 22 for the admins, ideally not from the whole internet. The one that makes me look twice is something like 3389 or a database port exposed publicly: remote desktop or a database should not be reachable from outside, and finding them open usually means a mistake or a foothold someone left.",
    followUps: [
      { prompt: "You find 3389 open to the world on it. What do you do?",
        answer: "Treat it as an exposure first: get it firewalled to admin sources or behind a VPN, then check the logs for whether anyone has already been knocking, because an open RDP port on the internet is found by scanners within minutes." },
      { prompt: "The team says it has been like that for a year with no problem. Does that reassure you?",
        answer: "No. No problem usually means no one has looked, not that no one has been in. A year of exposure is a year of opportunity, so I would want the authentication logs before I believe nothing happened." },
    ],
  },
  {
    slug: "first-look-at-a-pcap", level: "fresher", topic: "traffic-analysis", difficulty: 2,
    prompt: "I hand you a packet capture and say something is wrong, with no other context. What do you look at first?",
    answer: "The shape before the detail: the protocol hierarchy to see what is actually in there, the conversations to see who is talking to whom and how much, and whether anything is on a port that does not match its protocol. I am looking for the odd one out, not reading every packet, because a capture is too big to read and the anomaly is usually in the summary.",
    followUps: [
      { prompt: "The protocol hierarchy shows a lot of DNS. Does that interest you?",
        answer: "It can. A lot of DNS, especially long or odd query names to one domain, is a classic tunnelling or beaconing pattern. I would look at the query names and the destination before deciding it is just a busy resolver." },
      { prompt: "You spot credentials in cleartext. How bad, and what do you do?",
        answer: "Bad enough to act on: cleartext credentials on the wire mean anyone on the path has them. I note what protocol carried them, flag the application that should not be using it, and treat those credentials as compromised until rotated." },
    ],
  },
  {
    slug: "proxy-beaconing", level: "fresher", topic: "c2", difficulty: 2,
    prompt: "A proxy log shows one host requesting the same URL every thirty seconds, each time a tiny response. Your read?",
    answer: "That regularity is the tell. Humans and normal apps are bursty; a request on a fixed interval with a small, consistent response looks like a beacon checking in with a controller. I would not conclude command-and-control from one pattern, but it earns a close look at the destination and the process making the calls.",
    followUps: [
      { prompt: "The destination is a well-known cloud provider's domain. Does that clear it?",
        answer: "No. Attackers hide behind reputable infrastructure precisely because people wave it through. The domain being trusted does not change that the timing looks automated; I still want to know what on that host is calling it." },
      { prompt: "How would you confirm it is a beacon and not a legitimate poll?",
        answer: "Look at the jitter and the payloads over time: a legitimate poll usually varies and does real work, a beacon tends to be metronomic with near-identical tiny exchanges until it gets a task. And I would tie it to a process, because a legitimate poller is something you can name." },
    ],
  },
  {
    slug: "arp-for-defenders", level: "fresher", topic: "layer2", difficulty: 1,
    prompt: "What is ARP, and why should a defender care about it?",
    answer: "ARP maps an IP address to a MAC address on a local network, so devices can actually deliver frames to each other. A defender cares because it has no authentication: a host can claim to be the gateway, and others will believe it. That is ARP spoofing, and it is how someone on the same LAN quietly puts themselves in the middle of traffic.",
    followUps: [
      { prompt: "How might you notice it happening?",
        answer: "A MAC address suddenly mapping to an IP it never did, two IPs sharing a MAC, or a gateway's MAC changing. Switches and monitoring can flag it; on the wire it shows as a flurry of unsolicited ARP replies." },
      { prompt: "It is the switch's job to stop this, is it not?",
        answer: "Only if someone turned on the features: dynamic ARP inspection and DHCP snooping. Out of the box a flat LAN trusts ARP completely, so it is a configuration choice, not something you get for free." },
    ],
  },
  {
    slug: "where-to-place-a-sensor", level: "mid", topic: "monitoring", difficulty: 2,
    prompt: "Where do you place a network sensor, and what do you miss at each spot?",
    answer: "At the perimeter you see what enters and leaves but nothing host-to-host inside; in the core or at distribution you see east-west movement but can drown in volume; at the host you see everything for that host and nothing else. There is no single right spot, so the honest answer is a mix and being clear about the blind spot each one leaves.",
    followUps: [
      { prompt: "Most of your traffic is now encrypted. What does that do to the perimeter sensor?",
        answer: "It takes away the payload. You still get who-talks-to-whom, volumes, timing, and destinations, which is a lot, but you stop seeing content. That is why metadata and endpoint telemetry matter more as encryption spreads." },
      { prompt: "Given one sensor and a flat network, where do you put it?",
        answer: "At the egress point, because the thing I least want to miss is data leaving and hosts calling out to a controller. Internal movement matters, but a sensor that watches the door catches the step that turns an intrusion into a breach." },
    ],
  },
  {
    slug: "decrypt-all-tls", level: "mid", topic: "tls-inspection", difficulty: 3,
    prompt: "The business wants to decrypt all TLS so it can be inspected. Walk me through the trade-offs.",
    answer: "You gain payload visibility, which is real. You also take on the risk of holding everyone's decrypted traffic, you break anything that pins certificates or expects end-to-end trust, you create a privacy and legal question around personal and health and banking traffic, and you add latency and a single point of failure. It is a legitimate control, but it is a decision with costs, not a free upgrade.",
    followUps: [
      { prompt: "What would you refuse to decrypt, and why?",
        answer: "Traffic to banking, health, and other sensitive or regulated destinations, and anything where interception crosses a legal or privacy line. The point of inspection is defence, not building a honeypot of your own staff's private data." },
      { prompt: "Something breaks after you turn it on. Where do you look first?",
        answer: "Certificate pinning and applications that validate the chain themselves: mobile apps, updaters, and some APIs will refuse a middle certificate. The break is usually an app that was doing exactly what it was supposed to." },
    ],
  },
  {
    slug: "unassigned-ip-on-the-network", level: "mid", topic: "rogue-device", difficulty: 2,
    prompt: "A device on the network has an IP you did not assign. How do you find it, and why do you care?",
    answer: "I care because an unknown device is unknown risk: it could be a staff member's personal kit, a test box someone forgot, or something that should not be there at all. To find it I work from the IP to the MAC in the ARP or DHCP tables, then to the switch port it is plugged into, which gives me the physical location.",
    followUps: [
      { prompt: "It turns out to be a personal router someone plugged in. Still a problem?",
        answer: "Yes. An unmanaged router can hand out its own addresses, bridge an untrusted network in, and create a path around your controls. Intent does not change the exposure, so it comes off the network and the policy gets a reminder." },
      { prompt: "How would you stop unknown devices getting on in the first place?",
        answer: "Network access control: require the port to authenticate the device before it gets anything but a quarantine network. Short of that, at least switch-port security and monitoring, so a new MAC is noticed rather than trusted." },
    ],
  },
  {
    slug: "public-site-under-ddos", level: "mid", topic: "ddos", difficulty: 3,
    prompt: "Your public site looks like it is under a distributed denial-of-service. What can you actually do from the network side, and what can you not?",
    answer: "First I work out whether it is volumetric, filling the pipe, or application-layer, exhausting the server with valid-looking requests, because the answer is different. Against volume you cannot win locally: you need upstream help from the ISP or a scrubbing or CDN provider to absorb it before it reaches your link. Against application-layer you have more room with rate limiting, filtering, and caching. The hard truth is that if the pipe is full, nothing you do on your own side empties it.",
    followUps: [
      { prompt: "The business asks why you cannot just block the attacking IPs. What do you tell them?",
        answer: "Because there are too many, they change, and some are spoofed, and because blocking them still means the traffic arrived at your link and filled it. Blocking helps at the edges, but it does not solve a volumetric flood that is already saturating the connection." },
      { prompt: "It eases off after an hour. Are you done?",
        answer: "No. An hour of denial of service is sometimes cover for something else, so I check whether anything happened while attention was elsewhere, and I treat the respite as a chance to get scrubbing in place before it comes back." },
    ],
  },

];
