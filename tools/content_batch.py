#!/usr/bin/env python3
"""Question bank additions, batch 1. Data plus a generator.

Run modes:
  python3 tools/content_batch.py sql   -> SQL inserts on stdout
  python3 tools/content_batch.py md <role> -> markdown for one role

Each question: role, level, difficulty (1 easy/2 medium/3 hard, not loaded yet),
topic, slug, prompt, model_answer, and two (prompt, answer) follow-ups. Written
in the existing SecMox voice; non-overlapping with what the bank already holds.
"""
import sys

CREATED = "2026-11-22T03:00:00.000Z"

# role, level, difficulty, topic, slug, prompt, model, [ (fu_prompt, fu_answer), (fu_prompt, fu_answer) ]
Q = [
    # ---------------------------------------------------------------- SOC
    ("soc","fresher",1,"log-reading","read-auth-line",
     "Here is one line from an auth log: `Failed password for invalid user admin from 203.0.113.5`. What does it tell you, and what does it not?",
     "It tells you someone tried to log in as admin, that the account does not exist on this host, that it came from that IP, and that it failed. It does not tell you whether this is one stray attempt or one of thousands, whether it is automated or aimed at you, or whether anything succeeded. A candidate who has read logs separates the fact in the line from the story they want to put around it.",
     [("The same IP has four hundred of these in ten minutes. Does your read change?",
       "The volume says spray or brute force, not a targeted human, and invalid user says they are guessing account names that do not exist. Still low severity on its own. The thing I now look for is a line that is not a failure."),
      ("There is one Accepted password line in the middle of them. Now what?",
       "That flips it. A success in the middle of a brute force is the whole event. I scope that account, that source, and that session, and I start looking for what they did after they were in, not at the failures before.")]),

    ("soc","fresher",1,"network","internet-is-slow",
     "A user says the internet is slow. From a SOC seat, what could that mean to you that it does not mean to them?",
     "To them it is an annoyance. To a SOC it is a possible symptom: a link saturated by exfiltration, a host beaconing hard, a denial-of-service, or a proxy failing. I do not diagnose the complaint, I ask what the traffic looks like, because slow is sometimes the only thing a user notices when something is leaving the network.",
     [("Where do you look first?",
       "Egress: the proxy, firewall, or netflow for throughput and top talkers, and whether anything is going somewhere it should not. The complaint points at the link; the answer is in what is using it."),
      ("The top talker is one internal host sending to one external IP, a steady two megabytes a second for an hour. Your read?",
       "A steady, long, one-to-one transfer is exfiltration-shaped, not browsing. I scope the host, check the destination's reputation and who it belongs to, and find the process doing it before I decide it is backup traffic.")]),

    ("soc","fresher",2,"encoding","encoded-powershell",
     "You see `powershell -enc SQBFAFgA...` in a process-creation log. What is it, and what do you do?",
     "The -enc flag runs base64-encoded PowerShell, where the base64 decodes to UTF-16LE text. It is a common obfuscation but not proof of anything on its own, since admins and installers use it too. I decode it and judge it on what it actually does, rather than reacting to the flag.",
     [("Decoded, it is `IEX (New-Object Net.WebClient).DownloadString('http://...')`. Severity?",
       "High. That is download-and-execute from an external URL: pull code off the internet and run it in memory. I isolate the host, grab the URL and what it served, and work out what ran and under whose account."),
      ("The user is a developer who does this every day. Still high?",
       "The context lowers it but does not zero it. I confirm it is their known pattern and not a lookalike, because a thing this user does daily is also exactly how a real one hides in plain sight.")]),

    ("soc","fresher",2,"windows","windows-event-ids",
     "Which Windows event IDs do you actually watch, and why those?",
     "The ones that show access, privilege, and persistence, not a memorised list: 4625 and 4624 for failed and successful logons with their type, 4672 for a logon granted special privileges, 4688 for process creation, 4720 for a new account, 7045 for a new service. I would rather know cold why each of those matters than recite twenty I have never alerted on.",
     [("You see 4672 for a service account at three in the morning. Interesting?",
       "Potentially. A special-privilege logon for a service account off-hours is worth a look, but it depends on whether that account is meant to run scheduled or interactive work. The question is whether this matches how it normally behaves."),
      ("How do you tell a scheduled task from someone logging in at the keyboard?",
       "The logon type: 2 is interactive, 3 network, 4 batch, 5 service, 10 remote desktop. The type is the tell, and it is why I said with their type rather than just the event number.")]),

    ("soc","mid",2,"mitre","mitre-day-to-day",
     "How do you actually use MITRE ATT&CK day to day, beyond putting it on a slide?",
     "As a coverage map and a shared language. I map detections to techniques to find the gaps, and I tag alerts with the technique so triage knows what stage it is. What I do not do is treat it as a checklist to cover everything, which is how you end up with a wall of weak detections. Someone who has used it talks about gaps and trade-offs, not completeness.",
     [("Your manager wants a hundred percent ATT&CK coverage. Your response?",
       "Coverage is not a percentage. Some techniques your telemetry cannot see, some are not worth the noise, and a detection that exists only to tick a box is worse than an honest gap. I would prioritise by the threats that actually target us and the data we already have."),
      ("A technique you genuinely cannot detect: what do you do with it?",
       "Document the gap, decide whether the telemetry to close it is worth adding, and compensate elsewhere in the chain if it is not. A written, known gap is an asset. A fake detection over it is a liability, because it tells you you are safe when you are not.")]),

    ("soc","mid",3,"lateral-movement","lateral-in-logs",
     "What does lateral movement actually look like in your logs, as opposed to in a diagram?",
     "A pattern across hosts, not a single event: one account authenticating to many machines in a short window, type-3 network logons to systems it never normally touches, use of admin shares, PsExec or WMI, and new service installs appearing on the targets. The arrow in the diagram is, in the data, a spray of ordinary-looking logons that are wrong only in aggregate.",
     [("If you could weight one signal above the rest, which?",
       "An account authenticating to hosts outside its normal set, especially with administrative rights. The specific tool matters less than the deviation from what that account usually touches."),
      ("You have no baseline of what is normal. Now what?",
       "I build a rough one from the data I do have, who normally logs into what, or I lean on the structural tells that are suspicious regardless: a service install on a workstation, PsExec between peers, a brand-new admin account. Some things do not need a baseline to look wrong.")]),

    ("soc","mid",2,"triage","two-alerts-one-minute",
     "Same minute, one analyst: a malware detection auto-quarantined on a finance laptop, and a single failed VPN login for the CFO. Which do you take first, and why?",
     "The VPN one, briefly. Auto-quarantine means the EDR has already acted, so that laptop is probably contained; a failed login on a high-value account could be the front edge of something that is not contained yet. I prioritise by what is still live and who it touches, not by which label sounds scarier.",
     [("The failed VPN login was the CFO mistyping their password, confirmed. Back to the malware?",
       "Yes, and now I treat it properly: what the sample was, how it arrived, whether it ran before quarantine caught it, and whether anything else on that host is affected."),
      ("How do you know the quarantine actually held?",
       "I check the EDR action succeeded, the file is neutralised, no child processes spawned before it was caught, and there were no network callouts. Quarantined in the console is a claim; I want to see it was quarantined in time.")]),

    ("soc","mid",3,"metrics","soc-board-metrics",
     "You are asked for SOC metrics for a board deck. What do you report, and what do you refuse to report?",
     "I report things that reflect outcomes: how fast we detect and respond, our true-positive rate, gaps we have closed. I refuse vanity numbers like alerts processed or threats blocked, which reward noise and sound impressive while saying nothing. Part of the job is protecting the board from a number that would mislead them.",
     [("The board loves threats blocked: two million. You know it is mostly firewall noise. What do you do?",
       "I reframe it honestly: that figure is traffic, not threats, and I offer a metric that means something, even if the number is smaller and less flattering. A true small number beats an impressive false one."),
      ("Your mean-time-to-respond looks bad this quarter because of one long incident. Report it?",
       "Yes, with the context. Hiding it is how metrics lose trust. One explained outlier is more credible than a smooth average someone quietly massaged, and the board can handle the truth better than finding out later.")]),

    # ------------------------------------------------------------ NETWORK
    ("network","fresher",1,"ports","ports-on-a-web-server",
     "Which ports would you expect open on a normal web server, and which one open would make you look twice?",
     "80 and 443 for the site itself, and probably 22 for the admins, ideally not from the whole internet. The one that makes me look twice is something like 3389 or a database port exposed publicly: remote desktop or a database should not be reachable from outside, and finding them open usually means a mistake or a foothold someone left.",
     [("You find 3389 open to the world on it. What do you do?",
       "Treat it as an exposure first: get it firewalled to admin sources or behind a VPN, then check the logs for whether anyone has already been knocking, because an open RDP port on the internet is found by scanners within minutes."),
      ("The team says it has been like that for a year with no problem. Does that reassure you?",
       "No. No problem usually means no one has looked, not that no one has been in. A year of exposure is a year of opportunity, so I would want the authentication logs before I believe nothing happened.")]),

    ("network","fresher",2,"traffic-analysis","first-look-at-a-pcap",
     "I hand you a packet capture and say something is wrong, with no other context. What do you look at first?",
     "The shape before the detail: the protocol hierarchy to see what is actually in there, the conversations to see who is talking to whom and how much, and whether anything is on a port that does not match its protocol. I am looking for the odd one out, not reading every packet, because a capture is too big to read and the anomaly is usually in the summary.",
     [("The protocol hierarchy shows a lot of DNS. Does that interest you?",
       "It can. A lot of DNS, especially long or odd query names to one domain, is a classic tunnelling or beaconing pattern. I would look at the query names and the destination before deciding it is just a busy resolver."),
      ("You spot credentials in cleartext. How bad, and what do you do?",
       "Bad enough to act on: cleartext credentials on the wire mean anyone on the path has them. I note what protocol carried them, flag the application that should not be using it, and treat those credentials as compromised until rotated.")]),

    ("network","fresher",2,"c2","proxy-beaconing",
     "A proxy log shows one host requesting the same URL every thirty seconds, each time a tiny response. Your read?",
     "That regularity is the tell. Humans and normal apps are bursty; a request on a fixed interval with a small, consistent response looks like a beacon checking in with a controller. I would not conclude command-and-control from one pattern, but it earns a close look at the destination and the process making the calls.",
     [("The destination is a well-known cloud provider's domain. Does that clear it?",
       "No. Attackers hide behind reputable infrastructure precisely because people wave it through. The domain being trusted does not change that the timing looks automated; I still want to know what on that host is calling it."),
      ("How would you confirm it is a beacon and not a legitimate poll?",
       "Look at the jitter and the payloads over time: a legitimate poll usually varies and does real work, a beacon tends to be metronomic with near-identical tiny exchanges until it gets a task. And I would tie it to a process, because a legitimate poller is something you can name.")]),

    ("network","fresher",1,"layer2","arp-for-defenders",
     "What is ARP, and why should a defender care about it?",
     "ARP maps an IP address to a MAC address on a local network, so devices can actually deliver frames to each other. A defender cares because it has no authentication: a host can claim to be the gateway, and others will believe it. That is ARP spoofing, and it is how someone on the same LAN quietly puts themselves in the middle of traffic.",
     [("How might you notice it happening?",
       "A MAC address suddenly mapping to an IP it never did, two IPs sharing a MAC, or a gateway's MAC changing. Switches and monitoring can flag it; on the wire it shows as a flurry of unsolicited ARP replies."),
      ("It is the switch's job to stop this, is it not?",
       "Only if someone turned on the features: dynamic ARP inspection and DHCP snooping. Out of the box a flat LAN trusts ARP completely, so it is a configuration choice, not something you get for free.")]),

    ("network","mid",2,"monitoring","where-to-place-a-sensor",
     "Where do you place a network sensor, and what do you miss at each spot?",
     "At the perimeter you see what enters and leaves but nothing host-to-host inside; in the core or at distribution you see east-west movement but can drown in volume; at the host you see everything for that host and nothing else. There is no single right spot, so the honest answer is a mix and being clear about the blind spot each one leaves.",
     [("Most of your traffic is now encrypted. What does that do to the perimeter sensor?",
       "It takes away the payload. You still get who-talks-to-whom, volumes, timing, and destinations, which is a lot, but you stop seeing content. That is why metadata and endpoint telemetry matter more as encryption spreads."),
      ("Given one sensor and a flat network, where do you put it?",
       "At the egress point, because the thing I least want to miss is data leaving and hosts calling out to a controller. Internal movement matters, but a sensor that watches the door catches the step that turns an intrusion into a breach.")]),

    ("network","mid",3,"tls-inspection","decrypt-all-tls",
     "The business wants to decrypt all TLS so it can be inspected. Walk me through the trade-offs.",
     "You gain payload visibility, which is real. You also take on the risk of holding everyone's decrypted traffic, you break anything that pins certificates or expects end-to-end trust, you create a privacy and legal question around personal and health and banking traffic, and you add latency and a single point of failure. It is a legitimate control, but it is a decision with costs, not a free upgrade.",
     [("What would you refuse to decrypt, and why?",
       "Traffic to banking, health, and other sensitive or regulated destinations, and anything where interception crosses a legal or privacy line. The point of inspection is defence, not building a honeypot of your own staff's private data."),
      ("Something breaks after you turn it on. Where do you look first?",
       "Certificate pinning and applications that validate the chain themselves: mobile apps, updaters, and some APIs will refuse a middle certificate. The break is usually an app that was doing exactly what it was supposed to.")]),

    ("network","mid",2,"rogue-device","unassigned-ip-on-the-network",
     "A device on the network has an IP you did not assign. How do you find it, and why do you care?",
     "I care because an unknown device is unknown risk: it could be a staff member's personal kit, a test box someone forgot, or something that should not be there at all. To find it I work from the IP to the MAC in the ARP or DHCP tables, then to the switch port it is plugged into, which gives me the physical location.",
     [("It turns out to be a personal router someone plugged in. Still a problem?",
       "Yes. An unmanaged router can hand out its own addresses, bridge an untrusted network in, and create a path around your controls. Intent does not change the exposure, so it comes off the network and the policy gets a reminder."),
      ("How would you stop unknown devices getting on in the first place?",
       "Network access control: require the port to authenticate the device before it gets anything but a quarantine network. Short of that, at least switch-port security and monitoring, so a new MAC is noticed rather than trusted.")]),

    ("network","mid",3,"ddos","public-site-under-ddos",
     "Your public site looks like it is under a distributed denial-of-service. What can you actually do from the network side, and what can you not?",
     "First I work out whether it is volumetric, filling the pipe, or application-layer, exhausting the server with valid-looking requests, because the answer is different. Against volume you cannot win locally: you need upstream help from the ISP or a scrubbing or CDN provider to absorb it before it reaches your link. Against application-layer you have more room with rate limiting, filtering, and caching. The hard truth is that if the pipe is full, nothing you do on your own side empties it.",
     [("The business asks why you cannot just block the attacking IPs. What do you tell them?",
       "Because there are too many, they change, and some are spoofed, and because blocking them still means the traffic arrived at your link and filled it. Blocking helps at the edges, but it does not solve a volumetric flood that is already saturating the connection."),
      ("It eases off after an hour. Are you done?",
       "No. An hour of denial of service is sometimes cover for something else, so I check whether anything happened while attention was elsewhere, and I treat the respite as a chance to get scrubbing in place before it comes back.")]),

    # -------------------------------------------------------------- CLOUD
    ("cloud","fresher",1,"logging","first-logging-service",
     "What is the one logging service you turn on first in a new cloud account, and why?",
     "The account's audit trail, the service that records who did what: every API call, who made it, from where, and whether it succeeded. I turn it on first because without it you are blind to your own account, and after an incident it is the difference between reconstructing what happened and guessing. It is also the thing attackers try to turn off.",
     [("An attacker disables it. How would you know?",
       "The act of disabling it is itself a logged event, right up until it stops, so the last entry is a tell. That is why the logs should be delivered somewhere the account being watched cannot reach, so turning them off locally does not erase the trail."),
      ("Logging everything gets expensive. How do you decide what to keep?",
       "Keep the management-plane trail, who-did-what, essentially forever and cheaply in cold storage, and be selective about high-volume data-plane logs. The audit trail is small and priceless; the per-object access logs are large and you keep what you would actually investigate.")]),

    ("cloud","fresher",2,"incident","leaked-access-key",
     "A developer pasted a cloud access key into a public code repository. Walk me through the next hour.",
     "Rotate and revoke the key first, before anything else, because it is public and bots scrape for exactly this within minutes. Then work out what that key could do, how over-privileged it was, and pull the audit log to see whether it was already used and for what. Removing it from the repository is last and almost beside the point, since it is already copied.",
     [("You revoke it and the audit log shows it was used from an unknown IP ten minutes ago. Now what?",
       "It is an incident, not a near miss. I scope what that key touched in those ten minutes, assume anything it could reach is compromised, and widen from there: new resources, new keys, changed permissions. The key being dead now does not undo what it did while alive."),
      ("How do you stop the next one reaching the repo at all?",
       "Secret scanning on commits so a key is caught before it lands, short-lived credentials instead of long-lived keys, and making the easy path the safe one so developers are not tempted to paste a static key in the first place.")]),

    ("cloud","fresher",1,"iam","lock-down-root-account",
     "The root or owner account of a cloud organisation: what do you lock down on day one?",
     "Hardware or app multi-factor on it, no daily use so it is reserved for the few things only it can do, no access keys attached to it, and alerting whenever it is used at all. The root account can undo every other control, so it is the one account where a compromise is total, and it should be boring and rarely touched.",
     [("Why does it matter that root has no access keys?",
       "Because an access key is a long-lived credential that can be leaked, and on the root account that is catastrophic. A human logging in with MFA for a rare task is defensible; a static all-powerful key sitting in a config somewhere is not."),
      ("You get an alert that root just logged in. What is your first question?",
       "Was it us? I want to know who, from where, and for what planned task, because a legitimate root login is a scheduled, announced, rare event. An unexplained one is treated as a compromise until proven otherwise.")]),

    ("cloud","fresher",2,"storage","public-disk-snapshot",
     "A disk snapshot is shared publicly. Why does that matter more than it sounds?",
     "Because a snapshot is a copy of a whole disk: the operating system, the application, and whatever secrets, keys, and data were on it at the moment it was taken. A public snapshot is not a misconfigured setting, it is a data breach waiting for someone to mount it, and people do scan for them.",
     [("How is this worse than a public storage bucket?",
       "A bucket exposes the objects someone put in it; a disk snapshot exposes everything, including the things nobody meant to be data: credentials in config files, tokens in memory dumps, private keys. The blast radius is the whole machine, not a folder."),
      ("You make it private again. Is the incident over?",
       "No. If it was public you have to assume it was copied, so you rotate every credential that was on that disk and investigate what the exposed data could unlock. Making it private stops new access; it does not recall what already left.")]),

    ("cloud","mid",3,"privilege-escalation","cloud-privesc",
     "In the cloud, how does an attacker turn a low-privilege foothold into admin, and how would you spot it?",
     "Usually through the identity layer, not an exploit: a role that can pass a more privileged role to a service, attach a policy to itself, create access keys for another identity, or update a function that already runs with high permissions. You spot it in the audit trail, where these are all logged API calls that look wrong for the identity making them, like a low-privilege user suddenly editing IAM.",
     [("Which single permission would worry you most to hand out loosely?",
       "The ability to modify IAM itself, such as attaching policies or passing roles. It is the master key: anything that can change permissions can grant itself everything, so it is the one I watch and scope hardest."),
      ("Your detection is only the audit log. Is that enough here?",
       "For this it is strong, because cloud privilege escalation is made of API calls and the log records them. The gap is speed: the log tells you after the fact, so the value is in alerting on the dangerous calls in near real time, not reading it next week.")]),

    ("cloud","mid",2,"exposure","find-everything-internet-facing",
     "How do you find everything in a cloud account that is reachable from the internet?",
     "Not by looking at one thing: public IPs on instances, load balancers, storage buckets and their policies, managed databases with public access, API gateways, and functions with public URLs. It is an inventory problem more than a scanning problem, because the account can expose things in a dozen ways, and the one you forget is the one that bites.",
     [("Why not just run an external port scan and call it done?",
       "A scan finds open ports on IPs you point it at, but it misses the managed services with their own endpoints, the buckets that are not ports at all, and anything that spun up after you scanned. The cloud exposes things a port scan never sees."),
      ("How do you keep this current as the account changes daily?",
       "Make it continuous, not a one-off: query the provider's own inventory and configuration data on a schedule and alert on new public exposure. In a cloud that changes by the hour, a quarterly audit is a snapshot of a thing that has already moved.")]),

    ("cloud","mid",3,"architecture","why-many-cloud-accounts",
     "Why do mature organisations use many cloud accounts instead of one big one, from a security view?",
     "To bound the blast radius. If production, development, and each team live in separate accounts, a compromise or a mistake in one does not reach the others, permissions stay scoped, and billing and ownership are clear. The cost is complexity: more to manage, and you need a way to govern them centrally, so it is a trade of simplicity for containment.",
     [("What is the risk of getting the central governance wrong?",
       "You recreate the single big account through the back door: one over-powerful management account or role that can reach into all the others. If that is compromised, separation buys you nothing, so the governing layer is the thing you protect hardest."),
      ("A small startup with one account asks if they are doing it wrong. Your answer?",
       "No, not yet. Many accounts earns its complexity at scale; for a small team one well-run account with clear separation inside it is fine. The mistake is copying a big company's structure before you have the size or the people to run it.")]),

    ("cloud","mid",2,"serverless","serverless-security-shift",
     "What changes about security when the application is serverless functions instead of servers?",
     "You stop patching hosts, which is a real win, but the risk moves to the identity and the glue: each function has its own permissions that are easy to over-grant, functions are triggered by events that can be poisoned, and your dependencies and third-party packages become a larger part of your attack surface. You trade operating-system patching for permission hygiene and supply-chain care.",
     [("Where do over-permissioned functions come from, and why do they matter?",
       "From copying a broad policy because it was easy and it worked. They matter because a compromised function inherits its permissions, so a function that only needed to read one bucket but was granted the account becomes a full foothold."),
      ("What is event injection in this world?",
       "Trusting the trigger. A function fired by a file upload, a queue message, or an HTTP call is processing attacker-influenced input, and if it treats that input as trusted, the same injection problems you had on servers come back through the event instead of a form.")]),

    # ------------------------------------------------------------ PENTEST
    ("pentest","fresher",1,"recon","what-recon-gets-you",
     "Before you touch anything, what does reconnaissance actually get you on an external engagement?",
     "A map and some cheap findings. You learn the real attack surface, the technology in use, exposed services and old forgotten hosts, and often the people and the naming conventions that make later steps easier. Good recon means you spend the engagement testing the things that exist rather than guessing, and sometimes the win is already sitting in what you found.",
     [("Give me a finding that recon alone can hand you.",
       "An exposed service that should not be public, a forgotten staging site with weaker controls, leaked credentials in a code repository, or a subdomain pointing at a service that no longer exists and can be claimed. None of that needed an exploit, just looking carefully."),
      ("How do you keep recon from tipping off the client's defenders too early?",
       "Favour passive sources first, public records and third-party data, before active scanning, and pace the active work. Whether being noisy matters depends on the engagement's goals, so it is a scope conversation, not a default.")]),

    ("pentest","fresher",2,"web","explain-xss-to-a-dev",
     "Explain cross-site scripting to me as if I am the developer who has to fix it, not as a slide.",
     "Your page takes something a user controls and puts it into the page without neutralising it, so their input becomes script that runs in someone else's browser, as your site. If it is stored, every visitor runs it; if it is reflected, a crafted link does. The fix is to encode output for the context it lands in and to use a content security policy, not to try to blocklist bad input, because you will never list it all.",
     [("I already strip out the word script. Am I safe?",
       "No. There are many ways to run code that never contain that word: event handlers, other tags, encoded forms. Blocklisting specific strings is a game you lose; encoding on output is the move because it neutralises whatever the input was."),
      ("Where exactly do I encode, given I show the value in HTML and also in a bit of JavaScript?",
       "In both, but differently: HTML-encode where it lands in the page body, and use the JavaScript-string context rules where it lands in script. The encoding has to match the context, which is why one blanket escape sometimes still leaves a hole.")]),

    ("pentest","fresher",2,"authorization","test-acting-as-someone-else",
     "You can log in as yourself. How do you test whether you can act as someone else?",
     "I look for places where the application trusts an identifier the client can change: an account or object id in a URL or body, a role or privilege carried in a token or a hidden field, a request that should check who you are but only checks that you are logged in. Then I change my id to someone else's and see if the server lets me, which is the heart of broken access control.",
     [("You change the id and get someone else's invoice. Big deal or not?",
       "Big deal. That is a direct object reference the server did not authorise: if one id works, all of them probably do, so it is not one leaked invoice, it is everyone's, retrievable by counting. The impact is the whole dataset, not the one record."),
      ("The developer says the id is a long random string, so it is fine. Convinced?",
       "Less worried, more careful. A hard-to-guess id raises the bar but is not authorisation: if the string leaks in a log, a referrer, or a shared link, access is still granted. Unguessable is not the same as checked.")]),

    ("pentest","fresher",1,"methodology","ran-the-tool-found-nothing",
     "A junior says they ran the scanner and it found nothing, so the target is secure. What is your response?",
     "That the tool found nothing it knows how to find, which is not the same thing. Automated tools catch the known and the obvious; the findings that matter on real engagements are usually logic flaws, access-control gaps, and chained issues that no scanner understands. Empty output is a starting point, not a verdict.",
     [("So what do you do that the scanner cannot?",
       "Understand what the application is for and test the ways it can be abused: can I act as another user, skip a step, change a price, replay a request, reach something I should not. That reasoning about intent and flow is exactly what a signature-based tool has no model of."),
      ("Is there any value in the scanner, then?",
       "Yes, as a fast sweep of the known so I do not spend human time on the obvious. It clears the floor; it does not search the room. The mistake is treating the floor being clear as the room being empty.")]),

    ("pentest","mid",3,"privilege-escalation","linux-privesc-first-checks",
     "You have a low-privilege shell on a Linux box. Walk me through getting higher, and what you check first.",
     "I enumerate before I exploit, because the box usually tells you how it falls. First the easy wins: what can this user run with sudo, any SUID binaries that should not be there, writable files or scripts that run as root, cron jobs, and stored credentials. Only after that do I reach for a kernel exploit, which is the loud, fragile option, not the first one.",
     [("Why not go straight for a kernel exploit?",
       "Because it is the riskiest move: it can crash the box, it is version-specific, and on a real engagement knocking over a production server is a bad day for everyone. A misconfiguration is quieter, more reliable, and far more common, so it is where I start."),
      ("sudo -l shows you can run one specific editor as root. Useful?",
       "Very. Many ordinary programs can spawn a shell or write a file once they run as root, so a single allowed command is often a full escalation. The lesson for the defender is that a narrow sudo grant on the wrong binary is a wide-open door.")]),

    ("pentest","mid",2,"cryptography","dumped-hashes-how-bad",
     "You dumped a set of password hashes. What determines whether that is a big deal or not?",
     "The algorithm and how it was used. Modern, slow, salted hashes like bcrypt or argon2 resist cracking and a strong policy helps; fast or unsalted hashes like plain MD5 or NTLM fall quickly, and reused or weak passwords fall faster. The same dump can be a non-event or a full account takeover depending entirely on how the passwords were stored.",
     [("Why does salting matter so much?",
       "Because without it, identical passwords produce identical hashes, so you crack once and unlock everyone who used that password, and precomputed tables do the work for you. A per-user salt forces the attacker to attack each hash separately, which is the whole point."),
      ("The hashes are bcrypt with a good work factor. Do you just move on?",
       "Not entirely. Strong hashing buys time, not immunity: weak and reused passwords can still fall to a targeted guess, and the dump itself shows a database was reachable. I report the exposure and the real-world risk, not just bcrypt is fine.")]),

    ("pentest","mid",3,"pivoting","pivot-from-dmz-host",
     "You have compromised a host in the DMZ with a route into the internal network. How do you reach further without getting caught?",
     "Carefully and within scope. Technically I use the foothold to pivot, tunnelling or routing through it to reach internal systems I could not touch directly, and I prefer the tools already on the host over dropping my own, to stay quiet. But the real first question is whether reaching further is in scope and agreed, because the line between a thorough test and causing an incident is the engagement rules, not my curiosity.",
     [("What makes pivoting noisy, and how do you keep it quiet?",
       "New tools on disk, unusual internal connections from a host that never makes them, and spikes of scanning. Quiet means living off what is there, moving at a human pace, and touching only what the objective needs rather than mapping the whole network loudly."),
      ("The scope is ambiguous about internal access. What do you do?",
       "Stop and ask, in writing, before I cross the line. Reaching deeper than agreed is how a penetration test becomes a real incident and a legal problem, so an ambiguous scope is a conversation to have, not a gap to exploit.")]),

    ("pentest","mid",2,"reporting","client-dismisses-your-finding",
     "Your critical finding is waved off by the client's developers as not exploitable in practice. How do you handle it?",
     "I separate my ego from the evidence and make the impact concrete: show the exploit path, the data or access it yields, and the conditions it needs, rather than arguing severity labels. If after a real demonstration they still choose to accept the risk, that is their call to make, but it gets written down as an accepted risk with an owner, not quietly dropped.",
     [("They still will not budge after the demo. Have you failed?",
       "No. My job is to find and prove the risk clearly; the decision to fix or accept it is the business's. A finding that is understood and formally accepted is a success of the process. What would be a failure is letting it vanish because someone was uncomfortable."),
      ("How do you tell a real not exploitable from a defensive brush-off?",
       "By testing the claim. If they say a control blocks it, I try to show it does not, or I acknowledge it if it genuinely does. Real mitigations survive a demonstration; brush-offs are usually assertions that fold the moment you actually try the path.")]),

    # --------------------------------------------------------------- GRC
    ("grc","fresher",1,"fundamentals","cia-real-tradeoff",
     "The CIA triad gets recited a lot. Give me a real decision where confidentiality and availability actually pulled against each other.",
     "Locking an account after failed logins: it protects confidentiality by stopping a guesser, and it harms availability because a real user, or an attacker spraying known usernames, can lock people out. Or encryption where the only key holder leaves and the data is now safe and also unrecoverable. The triad is not a slogan, it is a set of trade-offs you have to actually choose between.",
     [("How do you make that lockout decision, then?",
       "By the context: how sensitive the account is, how likely an attack is, and what being locked out costs. A banking admin and a public forum get different answers, which is the point, the right control depends on what you are protecting and from whom."),
      ("Is one of the three ever simply more important?",
       "Depends entirely on the business. For a hospital system, availability can be life-or-death; for a secrets vault, confidentiality wins. Anyone who says one always leads has not had to make the trade with real consequences.")]),

    ("grc","fresher",2,"controls","control-types-stolen-laptop",
     "Preventive, detective, corrective: give me one real control of each for a stolen laptop, and which you would fund first.",
     "Preventive is full-disk encryption, so the thief gets a brick. Detective is an alert when the device checks in from somewhere new or is reported missing. Corrective is a remote wipe and re-issue. I fund encryption first, because detection and response after a loss are cold comfort if the data was readable the moment it left the building.",
     [("Why not fund detection first, so you at least know?",
       "Because knowing a readable laptop is gone does not protect the data on it; it just tells you the breach already happened. Prevention changes the outcome, detection changes only your awareness of it, so for a loss you cannot undo, prevention earns the first rupee."),
      ("The laptop was encrypted but the password was on a sticky note on it. Now what?",
       "Then the control did not operate, which is the whole lesson: a control on paper is not a control in practice. It becomes an awareness and enforcement problem, and in a report I would record it as a control that existed but failed to operate, which is different from one that was missing.")]),

    ("grc","fresher",2,"risk","compliance-vs-risk",
     "A control is required by a standard but makes no sense for your actual risk. What do you do?",
     "I do not just ignore it, and I do not blindly implement theatre either. I document why it does not fit, put a compensating control in place if the underlying intent still matters, and record a risk acceptance with an owner if it genuinely does not apply. Compliance and security are not the same thing, but you manage the gap openly rather than pretending it is not there.",
     [("The auditor will not accept your compensating control. Then what?",
       "Then it becomes a business decision with the cost on the table: implement the required control anyway for the certification, or accept not having that certification. My job is to make the trade-off and its cost visible, not to quietly fail the audit or quietly fake the control."),
      ("Where is the line between pragmatism and just dodging controls?",
       "Writing it down. A documented, owned, reasoned deviation is risk management; an undocumented one you hope nobody notices is negligence. The control you skipped is only defensible if you can show the thinking and someone signed for it.")]),

    ("grc","fresher",1,"assurance","what-counts-as-evidence",
     "An auditor asks for evidence that a control works. What counts, and what does not?",
     "What counts is proof it actually operated: logs showing it ran, tickets showing it was followed, configurations showing it is set, samples over a period rather than one lucky day. What does not count is the policy that says it should happen. The difference an auditor is testing is between saying you do something and showing that you did.",
     [("You have the policy but no records that anyone followed it. What does that tell the auditor?",
       "That the control exists on paper and may not exist in practice, which is often worse than having no policy, because it shows the organisation knows what it should do and is not doing it. A policy with no evidence is a finding, not a defence."),
      ("The control ran, but only because you knew the audit was coming. Honest evidence?",
       "No. A control that operates only when watched is not operating; it is a performance. Honest assurance samples across normal time, and if it only works under observation, the real finding is that it does not work.")]),

    ("grc","mid",3,"risk","risk-in-money-to-the-board",
     "The board asks how much cyber risk you have, in money. How do you answer honestly?",
     "In ranges with stated assumptions, not a single confident figure. I would frame it as likelihood times impact across the scenarios that actually threaten us, show the big drivers, and be explicit about what is estimated. A precise-sounding number invented to satisfy the question is worse than an honest range, because the board will treat false precision as fact and plan around it.",
     [("The board wants one number, not a range. How do you handle that?",
       "I give a central estimate and immediately show the range around it, because the spread is the information. Collapsing it to one number hides the uncertainty that should drive how much they spend, so I answer the question without pretending the uncertainty is not there."),
      ("Is this quantification worth doing if it is all estimates?",
       "Yes, if it is honest, because it turns vague fear into a comparable number that can be weighed against the cost of fixing it. The value is in the relative comparison and the conversation, not in the decimal places, and good estimation beats no estimation and beats fake precision.")]),

    ("grc","mid",2,"incident","who-declares-a-breach",
     "Who decides when an incident becomes a breach that must be reported, and why does that matter?",
     "It should be decided by defined criteria and a named owner agreed before anything happens, not argued out in the heat of the moment. It matters because reporting obligations come with clocks and legal exposure, and the decision is easier to get wrong, or to delay, exactly when everyone is stressed. Deciding who calls it and on what basis is itself a control.",
     [("Why is deciding this in advance so important?",
       "Because in the middle of an incident there is pressure to downplay, and the regulatory clock may already be running. A criterion written in calm beats a judgement made in panic, and it protects the person who has to make the call from having to invent the rule under fire."),
      ("Who should own that decision?",
       "Someone with the authority and the context to act, usually a defined incident lead with legal and leadership in the loop, named ahead of time. What you want to avoid is everyone assuming someone else is making the call while the clock runs out.")]),

    ("grc","mid",3,"vendors","critical-vendor-wont-comply",
     "A critical vendor will not meet your security requirements, but the business needs them. What is your actual move?",
     "I treat it as risk management, not a gate. I understand exactly what the vendor touches and what could go wrong, then reach for compensating controls on our side, contract terms that put obligations and liability in writing, and monitoring of the connection. If residual risk remains, it gets accepted explicitly by someone senior enough to own it. A flat no the business overrules anyway protects nobody.",
     [("Is there a point where you do say no?",
       "When the residual risk after everything you can do is still unacceptable and the owner will not accept it in writing. The no has to be defensible and specific, tied to what cannot be mitigated, not a reflex because a questionnaire came back short."),
      ("What is wrong with just refusing the vendor outright?",
       "The business often needs them anyway and will go around you, which leaves the risk in place and you out of the loop. Engaging to reduce and own the risk keeps you in the decision; refusing on principle gets you ignored and the risk unmanaged.")]),

    ("grc","mid",2,"awareness","awareness-training-doesnt-work",
     "Security awareness training mostly does not change behaviour. What would you do differently?",
     "Stop measuring completion and start measuring behaviour: phishing-report and click rates, not slides watched. Make it targeted and role-based so finance hears about invoice fraud and developers hear about secrets, keep it short and frequent rather than an annual marathon, and most of all make the secure path the easy one, because people route around friction no matter how much they were trained.",
     [("Give me an example of making the secure path the easy one.",
       "A one-click report-phishing button that actually gets a response, or a password manager provided and set up so a strong unique password is less effort than reuse. When doing it right is easier than doing it wrong, behaviour changes without a lecture."),
      ("How would you prove your programme is working?",
       "By movement in the behaviours over time: report rates up, click rates down, repeat offenders shrinking, and real reports arriving early. Those are outcomes; completion percentages are activity, and activity is not the same as a workforce that actually catches things.")]),
]


def esc(s):
    return s.replace("'", "''")


def emit_sql():
    out = []
    for role, level, diff, topic, slug, prompt, model, fus in Q:
        qid = f"q_{role}_{level}_{slug}"
        out.append(
            "INSERT OR REPLACE INTO questions (id, role, topic, level, prompt, model_answer, created_at) "
            f"VALUES ('{qid}', '{role}', '{esc(topic)}', '{level}', '{esc(prompt)}', '{esc(model)}', '{CREATED}');"
        )
        for i, (fp, fa) in enumerate(fus, 1):
            out.append(
                "INSERT OR REPLACE INTO follow_ups (id, question_id, position, prompt, model_answer) "
                f"VALUES ('{qid}_f{i}', '{qid}', {i}, '{esc(fp)}', '{esc(fa)}');"
            )
    return "\n".join(out)


def emit_md(role):
    DIFF = {1: "easy", 2: "medium", 3: "hard"}
    out = [f"# {role.upper()} — question batch 1 (loaded)\n"]
    n = 0
    for r, level, diff, topic, slug, prompt, model, fus in Q:
        if r != role:
            continue
        n += 1
        out.append(f"## {n}. {prompt}")
        out.append(f"**{level} · {DIFF[diff]} · {topic}**\n")
        out.append(f"**Model answer:** {model}\n")
        for i, (fp, fa) in enumerate(fus, 1):
            out.append(f"**Follow-up {i} — Q:** {fp}  ")
            out.append(f"**A:** {fa}\n")
        out.append("---\n")
    return "\n".join(out)


def emit_bankjs(role):
    """JS object literals for one role, ready to splice before the array's `];`.
    Strings use JSON (double-quoted) escaping, which is valid JS."""
    import json
    out = []
    for r, level, diff, topic, slug, prompt, model, fus in Q:
        if r != role:
            continue
        fu = ",\n".join(
            f"      {{ prompt: {json.dumps(fp)},\n        answer: {json.dumps(fa)} }}"
            for fp, fa in fus
        )
        out.append(
            "  {\n"
            f"    slug: {json.dumps(slug)}, level: {json.dumps(level)}, topic: {json.dumps(topic)},\n"
            f"    prompt: {json.dumps(prompt)},\n"
            f"    answer: {json.dumps(model)},\n"
            "    followUps: [\n"
            f"{fu},\n"
            "    ],\n"
            "  },"
        )
    return "\n".join(out)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "sql"
    if mode == "sql":
        print(emit_sql())
    elif mode == "md":
        print(emit_md(sys.argv[2]))
    elif mode == "bankjs":
        print(emit_bankjs(sys.argv[2]))
    elif mode == "count":
        from collections import Counter
        print(Counter(q[0] for q in Q), "total", len(Q))
