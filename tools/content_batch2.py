#!/usr/bin/env python3
"""Question bank additions, batch 2. Data plus a generator.

  python3 tools/content_batch2.py bankjs <role>  -> JS entries to splice
  python3 tools/content_batch2.py count

Same shape and voice as batch 1; non-overlapping with the 100 already loaded.
"""
import sys, json

# role, level, difficulty, topic, slug, prompt, model, [(fu_prompt, fu_answer) x2]
Q = [
    # ---------------------------------------------------------------- SOC
    ("soc","fresher",2,"severity","severity-gut-vs-tool",
     "How do you decide an alert's severity when the tool's rating and your own read disagree?",
     "I go by what is actually at stake, not the label the tool shipped with. Severity is impact times how live it still is: what the affected asset is worth, who it touches, and whether the thing is still happening or already contained. The tool's rating is a starting opinion from someone who never saw your environment, so I weigh it and then decide, and I write down why I overrode it.",
     [("The tool says critical, you think it is noise. You are junior. Do you downgrade it?",
       "I investigate enough to be sure before I touch the rating, and if I downgrade I record exactly why and leave the trail. Being junior means I show my working, not that I defer blindly, because a critical waved away without evidence is how real ones get missed."),
      ("You think it is critical, the tool says low. What do you do?",
       "Escalate on my read, not the tool's. Under-rating is the more dangerous mistake, so I would rather be wrong raising it than wrong burying it, and I make the case with what I found rather than just a feeling.")]),

    ("soc","fresher",1,"malware","handed-a-suspicious-file",
     "A user sends you a file they think is malware. What do you do with it, and what do you not do?",
     "I do not open it on my own machine, and I do not double-click it anywhere that matters. I preserve it, hash it and check the hash against known-bad, look at it in a sandbox or detonation environment rather than live, and keep it contained the whole time. The mistake that ends careers early is running the thing you are trying to analyse on the box you are analysing it from.",
     [("The hash is unknown to every feed. Is it safe, then?",
       "No. Unknown means nobody has reported it yet, which is exactly what a fresh or targeted sample looks like. I still detonate it in a sandbox and judge it by behaviour, because being new to the feeds is a reason for more caution, not less."),
      ("How do you get it off the user's machine without making things worse?",
       "Carefully and with the original preserved: copy it in a contained way rather than forwarding it around, and if the machine might already be affected I treat the whole host, not just the file. Emailing malware to your team to 'take a look' is how it spreads inside the walls.")]),

    ("soc","fresher",2,"email-auth","spf-dkim-dmarc",
     "SPF, DKIM and DMARC: what does each actually tell you when you are staring at a suspicious email?",
     "SPF says whether the sending server was allowed to send for that domain. DKIM says whether the message was signed by the domain and not altered in transit. DMARC ties the two to the visible From address and tells the receiver what to do when they fail. Together they answer did this really come from who it claims, and a fail on the From domain is a strong tell, though a pass does not make the content safe.",
     [("The email passes all three. Does that mean it is legitimate?",
       "No. It means it genuinely came from that domain, not that the domain is trustworthy or uncompromised. A real but hacked account, or a lookalike domain that set its own records up correctly, passes all three while still being an attack."),
      ("DMARC says the domain's policy is 'none'. What does that tell you?",
       "That the owner is monitoring but not enforcing, so a spoofed message still gets delivered rather than rejected or quarantined. It is a configuration gap on their side, and it is why I cannot lean on DMARC alone to have stopped the mail.")]),

    ("soc","fresher",2,"exfil","signs-of-data-leaving",
     "What are the signs of data leaving that you would actually catch, and which ones would you miss?",
     "I would catch the obvious shapes: large or steady outbound transfers, uploads to personal cloud storage, a host talking to a destination it never did, odd volumes at odd hours. I would miss slow, low exfiltration dribbled out under the noise, data hidden in protocols I do not inspect like DNS or encrypted channels, and anything that leaves on a USB stick or a phone camera, which never touches the network at all.",
     [("How would you catch the slow, low version?",
       "By baselining normal for each host and alerting on deviation over time rather than on a single big spike, and by watching cumulative volume to a destination, not just instantaneous rate. The patient attacker beats a threshold that only looks at one moment."),
      ("The data left over DNS. How would that even work?",
       "By encoding the data into the names being looked up, so a stream of long odd subdomain queries to one domain carries the payload out a channel almost nobody blocks. The tell is the volume and shape of the DNS, which is why those TXT and long-name patterns are worth alerting on.")]),

    ("soc","mid",2,"threat-intel","using-a-feed-without-drowning",
     "You are given a feed of malicious IPs and hashes. How do you use it without drowning?",
     "Not by blocking everything on sight. I prioritise by relevance and confidence: which indicators match threats that actually target us, how fresh and how reliable the source is, and whether an indicator is specific enough to act on. Then I use it to enrich and hunt rather than to auto-block a million stale IPs, because a feed treated as a blocklist becomes noise and outages, not defence.",
     [("Why not just block every IP on the list?",
       "Because the list is large, stale, and shared, so it includes recycled addresses now serving legitimate sites, and blocking them causes outages while the real attacker has already moved to a new one. Indicators age badly, so I use them to spot and investigate, not as a permanent wall."),
      ("What makes one indicator more useful than another?",
       "How specific and how durable it is. A file hash or a unique domain is precise and worth acting on; a shared IP or a common user-agent is weak and ages fast. The pyramid-of-pain idea applies: the indicators that cost the attacker the most to change are the ones worth building detection on.")]),

    ("soc","mid",3,"containment","isolate-now-or-watch",
     "An endpoint is compromised. Do you isolate it now or watch it to learn more? Walk me through the call.",
     "It is a trade between stopping the bleeding and understanding the wound. I isolate immediately when the risk of spread or data loss is live, which is most of the time. I hold off and watch only when containment is already partial, the threat is not actively moving, and the intelligence from watching is worth the risk, and even then with a hand on the switch. The default is contain, because a learning exercise that becomes a breach is a bad trade.",
     [("What would make you choose to watch rather than isolate?",
       "A contained-enough situation where isolating would tip off a sophisticated actor before I understand their scope, and where I have the monitoring to watch safely and pull the plug instantly. It is a senior call made with authority and a plan, not a junior analyst deciding to let an intrusion run."),
      ("You isolate and the attacker had a second foothold you did not know about. What does that teach you?",
       "That containment is scoping, not a single action: isolating one host is the start, and the job is to find everywhere else they are before declaring it over. One foothold almost always implies looking for others, so I widen rather than close out.")]),

    ("soc","mid",2,"operations","buried-in-alerts",
     "Your team is buried in alerts. What do you change, structurally, beyond 'tune the rules'?",
     "I treat the volume as a design problem, not a stamina problem. That means killing or tuning the detections that never produce a true positive, enriching alerts so an analyst sees context instead of hunting for it, grouping related alerts into one incident instead of fifty tickets, and automating the rote triage steps. The goal is fewer, richer alerts that each deserve a human, not a faster treadmill.",
     [("Which alerts do you kill first?",
       "The ones with a long history of firing and never being real: high volume, zero true positives, no path to tuning. Every one of those is tax on attention, and attention spent on noise is attention not spent on the alert that mattered. I kill them openly, with the data, not quietly."),
      ("Is there a risk in turning detections off?",
       "Yes, a blind spot, so I do not just delete, I decide: tune it, replace it with something that fires only on the real pattern, or accept and document the gap. The point is that a detection nobody can act on is already a blind spot pretending to be coverage.")]),

    ("soc","mid",3,"insider","hunting-an-insider",
     "How is hunting an insider different from hunting an external attacker?",
     "The insider already has legitimate access, so there is no break-in to catch and no foreign foothold to find. The signal is misuse of normal access: reaching data outside their role, at odd times, in odd volumes, staging things to leave, or behaviour that changes around an event like a resignation. It is quieter, more about deviation from a person's own baseline than about known-bad, and it carries a human and legal weight an external hunt does not.",
     [("What is the single hardest part?",
       "Telling misuse from a normal person doing their job slightly unusually. The base rate of real insiders is tiny and the false-positive cost is high, because accusing an innocent employee has real consequences, so the bar for acting has to be careful and evidence-led."),
      ("How do you keep an insider investigation from becoming a witch hunt?",
       "Tight scope, documented reasons, need-to-know handling, and HR and legal in the loop from the start rather than an analyst quietly watching a colleague. The investigation is a controlled process with oversight, precisely because the power to surveil an employee is easy to abuse.")]),

    # ------------------------------------------------------------ NETWORK
    ("network","fresher",1,"fundamentals","which-osi-layer-attacks-live",
     "The OSI model gets memorised. Which layer do most of the attacks you would actually see live at, and why?",
     "Layer 7, the application layer, because that is where the data and the logic are and where the humans interact. Most of what a defender deals with day to day, phishing, web exploits, malware, is application-layer, not clever packet craft. The lower layers matter, but the model is most useful to me as a way to say which layer a given problem and its fix live at, not as a list to recite.",
     [("Give me an attack that genuinely lives lower down.",
       "ARP spoofing at layer 2 to get in the middle of a LAN, or a SYN flood at layer 4 exhausting connection state. They are real, but they need local access or volume, which is why they are less of the daily diet than a layer-7 phishing link."),
      ("Why does knowing the layer actually help you respond?",
       "Because it tells you where the control and the fix belong: a layer-7 problem is not solved by a layer-3 firewall rule. Naming the layer stops people reaching for the wrong tool, like trying to block an application flaw at the network edge.")]),

    ("network","fresher",2,"segmentation","vlan-is-not-segmentation",
     "What is a VLAN, and why is 'we have VLANs' not the same as 'we are segmented'?",
     "A VLAN logically splits one physical switch into separate broadcast domains, so devices on different VLANs are not on the same local network. But VLANs only separate; segmentation is about controlling what is allowed to cross between them. If everything routes freely between your VLANs, you have tidy addressing and no security boundary, because the separation means nothing without rules enforcing it.",
     [("So what turns VLANs into real segmentation?",
       "Policy at the boundary: a firewall or access control between the VLANs that permits only the traffic that should cross and denies the rest. The VLAN is the line on the map; the enforcement is the fence. Without the fence, the line is decorative."),
      ("How would you test whether two segments are actually separated?",
       "Try to reach across: from a host in one segment, see what you can actually talk to in another, on which ports. If I can reach things I should not, the segmentation exists on the diagram and not in the traffic, which is the gap that matters.")]),

    ("network","fresher",2,"wireless","corporate-wifi-real-vs-theatre",
     "What actually protects a corporate wireless network, and what is theatre?",
     "Real protection is strong authentication, ideally per-user via enterprise authentication rather than one shared password, modern encryption, and treating wireless as untrusted so it does not drop straight onto the crown jewels. Theatre is hiding the network name and filtering by MAC address: the name is trivial to discover and MAC addresses are trivial to spoof, so both feel like security and stop nobody who is trying.",
     [("Why is a single shared Wi-Fi password a problem at a company?",
       "Because it never really leaves: ex-staff know it, it gets shared, and you cannot revoke one person without changing it for everyone. Per-user authentication means access is tied to an identity you can turn off, which is the whole point in an organisation."),
      ("Where should corporate Wi-Fi sit in the network?",
       "Behind the same controls as any other untrusted entry, not bridged straight into the internal network. Treat the person on Wi-Fi as outside until they authenticate to what they need, because the air does not have a wall around it.")]),

    ("network","fresher",2,"protocols","lots-of-icmp",
     "A host is sending a lot of ICMP. Innocent or not?",
     "Usually innocent, sometimes not. ICMP is normal network plumbing, pings and path messages, so volume alone is not alarming. What interests me is shape: large or oddly sized ICMP payloads, a steady stream to one external host, or ICMP where it has no business being can be a covert channel or tunnel. So I do not panic at ICMP, I look at whether this ICMP is carrying more than it should.",
     [("How would ICMP be used to smuggle data?",
       "By stuffing payload into the data field of echo packets, which many networks pass without inspecting, so a host quietly tunnels traffic or exfiltrates in and out over ping. The tell is payload size and regularity that normal diagnostics would never produce."),
      ("Would you just block ICMP to be safe?",
       "Not blanket, because some of it is load-bearing: block the wrong type and you break path MTU discovery and troubleshooting. I would restrict and monitor it rather than kill it, because the cure of blocking all ICMP causes its own quiet outages.")]),

    ("network","mid",3,"zero-trust","what-zero-trust-actually-changes",
     "Everyone says zero trust. What does it actually change about how you build a network?",
     "It drops the idea that being inside the network means being trusted. Instead of a hard perimeter and a soft inside, every request is authenticated and authorised on its own merits, per user and per device, regardless of where it comes from. In practice that means identity becomes the real boundary, internal traffic is no longer trusted by default, and access is least-privilege and verified continuously rather than granted once at the door.",
     [("What is the most common way zero trust goes wrong in practice?",
       "Buying a product and calling it done. Zero trust is an architecture and a discipline, not a box: if you still have a flat trusted internal network behind the shiny access gateway, you have the label and not the model."),
      ("Does zero trust mean the perimeter firewall is pointless now?",
       "No, it means it is no longer sufficient. The firewall still reduces exposure and noise, but you stop treating everything behind it as safe. It is one layer, not the whole strategy, which is the shift zero trust is really making.")]),

    ("network","mid",2,"forensics","netflow-but-no-pcap",
     "You have netflow but no packet capture. What can you still investigate, and what is lost?",
     "Netflow gives me the who, when, how much and how long of every conversation: which hosts talked, on what ports, in which direction, and the volumes over time. That is enough to spot beaconing, exfiltration shapes, scanning, and lateral movement. What is lost is content: I cannot see what was actually said, read a payload, or pull the exact file, so I can say this host sent a lot to that one but not what was in it.",
     [("A host exfiltrated data and you only have netflow. What can you still say?",
       "That it happened, when, to where, and roughly how much: the metadata tells the story of a transfer even without the contents. For scoping an incident that is often enough to act, even if I cannot show the exact bytes that left."),
      ("Given that gap, would you add full packet capture everywhere?",
       "No, it is expensive and storage-hungry, so I would place it selectively at high-value choke points and lean on netflow and endpoint data for the breadth. Capturing everything everywhere is a cost and a privacy liability that rarely pays for itself.")]),

    ("network","mid",2,"firewall","two-thousand-rule-base",
     "You are handed a firewall rulebase with two thousand rules. How do you find the dangerous ones?",
     "I hunt for the rules that quietly undo everything else: any-to-any or any-service permits, overly broad source or destination ranges, rules allowing inbound from the internet to internal services, and anything with no owner or comment. Then the dead weight: shadowed rules never hit, expired temporary rules that became permanent, and duplicates. Two thousand rules is usually a dozen that are dangerous and a long tail of cruft.",
     [("What makes an 'any-any' rule so bad in a long rulebase?",
       "It silently overrides the careful rules around it: a broad permit near the top means the specific denies below it never get evaluated. One lazy rule can make the other nineteen hundred decorative, which is why I look for those first."),
      ("How do you safely remove a rule you think is dead?",
       "Check the hit counters and logs to confirm it really takes no traffic, disable rather than delete first so it is reversible, and watch for fallout before removing it for good. A rule that looks dead but carries one critical flow at month-end is how a cleanup becomes an outage.")]),

    ("network","mid",3,"architecture","east-west-blind-spot",
     "Why is east-west traffic the blind spot everyone talks about, and what do you actually do about it?",
     "Because the classic defences watch the perimeter, the north-south door, while most tools and sensors never see host-to-host traffic inside. Once an attacker is in, they move sideways through that unwatched space freely. What you do about it is bring visibility and control inside: segment so lateral paths are limited, instrument internal traffic so movement is logged, and stop assuming the inside is safe just because it is behind the firewall.",
     [("Microsegmentation is the usual answer. What is the catch?",
       "Operational cost and complexity: done to the extreme it becomes a maze of policies nobody can maintain, and a policy you cannot maintain fails open. I would segment by real trust boundaries that match how the business works, not chase per-host purity that collapses under its own weight."),
      ("If you could only add one thing to see east-west, what would it be?",
       "Logging of internal authentication and connections, because lateral movement is mostly made of logons and connections between hosts that do not normally talk. Even without full packet capture, that record turns an invisible sideways crawl into something you can follow.")]),

    # -------------------------------------------------------------- CLOUD
    ("cloud","fresher",1,"compliance","why-region-matters",
     "Why does the region a cloud resource lives in matter for security and compliance?",
     "Because where the data physically sits decides which laws apply to it, who can compel access to it, and often what your own customers are contractually promised. A bucket in the wrong region can breach a data-residency requirement without anyone attacking anything. Latency and availability matter too, but the security answer is that geography is jurisdiction, and jurisdiction is not a setting you can hand-wave.",
     [("A developer spins a database up in a region you do not use. Is that a problem?",
       "Potentially a compliance one, even with no breach: it may put regulated data outside where it is allowed to live, and it is unmanaged shadow infrastructure nobody is watching. The fix is guardrails that restrict which regions can be used, not catching it after the fact."),
      ("How do you stop resources being created in the wrong region at all?",
       "Policy at the account level that denies resource creation outside approved regions, so it is prevented rather than discovered later. Relying on people to remember the rule is how the one-off exception becomes a permanent liability.")]),

    ("cloud","fresher",2,"encryption","encrypted-at-rest-protects-what",
     "'The data is encrypted at rest.' What does that actually protect you from, and what does it not?",
     "It protects against someone who gets the raw storage: a stolen disk, a leaked snapshot, a provider employee with physical access. It does not protect against someone who comes through the front door with valid access, because to the application and anyone with permission the data is transparently decrypted. Encryption at rest answers what if someone steals the drive, not what if someone steals the credentials.",
     [("So if an attacker has the app's database credentials, does encryption at rest help?",
       "No. They are asking the system that holds the keys, and it hands back plaintext as designed. At-rest encryption is invisible to an authorised query, so against stolen credentials the control that matters is access, not encryption."),
      ("When does encryption at rest genuinely save you, then?",
       "When the storage layer leaks on its own: a public snapshot, a decommissioned disk, a backup that walks out. In those cases the bytes are useless without the key, which is exactly the threat it is built for.")]),

    ("cloud","fresher",2,"exposure","instance-has-a-public-ip",
     "An instance has a public IP. Is that a problem?",
     "Not by itself, but it is a question worth asking. A public IP means reachable from the internet, so the real question is what is listening and how well it is defended: a hardened, patched web server is meant to be public, a database or an admin service is not. So I do not treat a public IP as a verdict, I treat it as a prompt to check what it exposes and whether it should.",
     [("How do you decide whether this one is fine or a risk?",
       "Look at what ports are open to the world, what is behind them, and whether that service is designed to face the internet. A public IP on a web tier is normal; the same on a management port is the finding."),
      ("The developer says they need it public to work from home. Better way?",
       "Put the access behind something that authenticates first, a VPN or a bastion or an identity-aware proxy, rather than exposing the service itself. The need is remote access, and remote access does not require the whole service to sit open on the internet.")]),

    ("cloud","fresher",2,"governance","why-tagging-matters",
     "Why do security people care about resource tagging?",
     "Because you cannot protect what you cannot find or attribute. Tags are how you know who owns a resource, what it is for, how sensitive it is, and whether it is in scope for a given control. In an environment that changes by the hour, untagged resources are the ones that get forgotten, left exposed, and discovered only in an incident. Tagging is unglamorous, but it is the backbone of knowing your own estate.",
     [("Give me a security decision that depends on a tag.",
       "Who to call when a resource is compromised at 3am: an owner tag turns a mystery instance into a phone call. Or whether a bucket is allowed to hold regulated data, driven by a data-classification tag that a policy can enforce against."),
      ("Tags are optional, so people skip them. How do you fix that?",
       "Make them non-optional where it counts: deny creation of resources without the required tags, so the estate stays attributable by construction. A tagging standard that relies on goodwill decays the moment someone is in a hurry.")]),

    ("cloud","mid",3,"iam","stop-self-escalation",
     "How do you stop a team from granting themselves more cloud permissions than they should?",
     "By putting a ceiling above them that they cannot raise: a permission boundary or equivalent that caps what any identity in their scope can do, so even an admin within the team cannot exceed it. Combine that with separating who can change permissions from who uses them, and with alerting on identity-policy changes. The principle is that the power to grant access is itself a privilege, held above the people it governs.",
     [("Why is 'just trust the team leads' not enough here?",
       "Because it is one compromised or mistaken account away from unlimited: if the people with access can also expand their own access, there is no real ceiling, only a polite agreement. A boundary enforced by the platform does not depend on everyone behaving."),
      ("How would you catch an attempt to escalate, boundary or not?",
       "Alert on the dangerous identity actions: attaching policies, creating keys for others, assuming more privileged roles. Those are logged API calls, so a low-privileged identity suddenly editing permissions is a signal you can fire on in near real time.")]),

    ("cloud","mid",2,"networking","vpc-peering-expanded-what",
     "Two cloud networks are peered. Security-wise, what did you just expand?",
     "The blast radius. Peering makes the two networks mutually reachable, so a compromise on either side now has a path to the other that it did not before. It is not transitive and it is not automatic access, but it is a new trust relationship, and the question I ask is what can now reach what, and is that limited to the few things that actually need to talk, or did you just merge two networks in effect.",
     [("So what makes a peering safe rather than a liability?",
       "Scoping it: route and security rules that allow only the specific flows that need to cross, not blanket reachability. A peering with wide-open rules quietly turns two blast radii into one; a tightly scoped one connects just the two services that had to."),
      ("A third network is peered to one of these two. Can it reach the other?",
       "Not through the peering itself, because peering is not transitive: it only connects the two directly peered networks. But people often add routes or gateways that create a path anyway, so I would check the actual routing, not assume the non-transitive rule saved me.")]),

    ("cloud","mid",3,"supply-chain","four-hundred-packages",
     "Your cloud app pulls four hundred open-source packages. How do you think about that risk?",
     "As a trust problem I cannot eliminate, only manage. Every one of those packages, and their dependencies, is code I did not write running with my app's privileges, so a malicious or compromised one is a foothold. I think about it as: know what I actually depend on, pin and verify versions, watch for known vulnerabilities and sudden maintainer changes, and reduce the count where I can. The goal is not zero dependencies, it is not being surprised by them.",
     [("What is the specific danger of a dependency's dependency?",
       "That you never chose it and may not know it is there, yet it runs with the same trust. Most of the four hundred are transitive, pulled in by something you did pick, so the risk hides a layer below the names in your own manifest."),
      ("A popular package you use ships a malicious update. How would you even catch it?",
       "By not blindly taking latest: pin versions, review changes before upgrading, and watch for the signals, a new maintainer, an unexpected release, odd new network behaviour at build or run time. The defence is that an update is a change you vet, not something that flows in automatically.")]),

    ("cloud","mid",2,"resilience","cloud-backups-vs-ransomware",
     "How do cloud backups survive ransomware, and how do they not?",
     "They survive it when they are genuinely out of reach of the thing that got compromised: a separate account or isolation boundary, immutable so they cannot be altered or deleted for a set period, and with their own access path. They do not survive when the same credentials that run production can also reach and delete the backups, because then the attacker encrypts the originals and wipes the copies in one move. A backup your attacker can delete is not a backup.",
     [("Why is immutability the feature that matters most here?",
       "Because ransomware's move against backups is deletion or encryption, and immutability makes the data un-deletable and un-alterable for its retention window regardless of credentials. It takes the backups off the table even for an attacker holding admin."),
      ("You have backups but never tried restoring. What is the risk?",
       "That they do not actually work when you need them: wrong scope, corrupt, missing a dependency, or so slow the business is down for days anyway. An untested backup is a hope, not a control, so the restore has to be rehearsed before the bad day, not during it.")]),

    # ------------------------------------------------------------ PENTEST
    ("pentest","fresher",2,"web","explain-csrf",
     "Explain CSRF, and why 'I check the referrer header' is not a great fix.",
     "CSRF tricks a logged-in user's browser into making a state-changing request they did not intend, riding on the cookies the browser sends automatically. So the server sees a valid, authenticated request that the user never meant to make. Checking the referrer is weak because it can be absent for privacy reasons, spoofable in some setups, and stripped by proxies, so you end up either blocking legitimate users or trusting a header you cannot rely on. The real fix is an anti-CSRF token the attacker cannot predict, or same-site cookies.",
     [("Why does a token work where the referrer does not?",
       "Because the token is a secret tied to the user's session that the attacker's forged request cannot know, so a request without the right token is rejected. The referrer is information the browser volunteers; the token is a secret only the real page has."),
      ("Does being a JSON API instead of a form protect you from CSRF?",
       "Partly and not reliably. It raises the bar because simple forms cannot set arbitrary content types, but misconfigured CORS or permissive endpoints can reopen it, so I would still test rather than assume the format saved me.")]),

    ("pentest","fresher",2,"web","app-lets-you-upload-files",
     "An app lets users upload files. What is the first thing you try?",
     "I test what it actually accepts versus what it claims to. Can I upload a file type it should reject, can I make a dangerous file look allowed by changing its name or declared type, and crucially what happens to it after, where does it land and can I reach it back. The prize is getting a file the server will execute, or one that becomes someone else's problem when they open it, so I probe the gap between the client-side check and what the server really does.",
     [("The app only checks the file extension. Why is that not enough?",
       "Because the extension is just a label the client controls, so I rename a dangerous file to an allowed extension, or use a double extension or a trailing trick, and the content is still what it was. The server has to judge the file by what it is and where it can run, not by its name."),
      ("You get a file uploaded but cannot execute it. Still useful?",
       "Often yes. A file that others download and open is a path to attacking them, a malicious document or a script, and an upload that overwrites something or fills storage is its own problem. Execution is the jackpot, but an upload you control is leverage even without it.")]),

    ("pentest","fresher",1,"services","port-445-open",
     "You find port 445 open on a host. What does that tell you, and what do you try?",
     "445 is SMB, Windows file sharing, so this is almost certainly a Windows host offering shares or related services. That is interesting because SMB has a long history of exposure: anonymous or guest-readable shares, weak authentication, and famous exploitable bugs. So I would enumerate what shares and information it gives up without credentials first, then test authentication, because SMB often hands over more than people realise before you even log in.",
     [("What is the risk of SMB being reachable from the internet specifically?",
       "It is a high-value, heavily targeted service that should never face the internet: internet-exposed SMB is scanned constantly and has been the vector for major worms. Finding 445 open externally is itself close to a finding, before I test anything."),
      ("You enumerate and find a readable share with no login. How bad?",
       "Depends what is in it, and often it is bad: configuration files, credentials, backups, and internal data sit on shares people assume nobody can reach. Anonymous read access is a direct information-disclosure finding and frequently the first step to something larger.")]),

    ("pentest","fresher",2,"web","test-session-handling",
     "How do you test whether an application handles sessions securely?",
     "I look at the whole lifecycle of the session token. Is it long and random enough not to be guessed, is it sent and stored safely with the right cookie flags, does it change when you log in so a fixed one cannot be planted, and does it actually die on logout and after inactivity. The failures I am hunting are a predictable token, one that survives logout, or one an attacker can set for a victim in advance.",
     [("Why does the token needing to change at login matter?",
       "Because if it does not, an attacker can plant a known session token on a victim before they log in, and once the victim authenticates, the attacker already holds a now-valid session. Rotating the token at login closes that fixation path."),
      ("You log out and the old token still works. How serious?",
       "Serious: logout that does not actually invalidate the session server-side means a stolen or logged token stays usable after the user thinks they are safe. On a shared or compromised machine that is a direct account-takeover window.")]),

    ("pentest","mid",3,"web","ssrf-in-cloud",
     "What is SSRF, and why is it so dangerous in cloud environments specifically?",
     "Server-side request forgery is when you make the server itself make a request you choose, so it reaches things you cannot reach directly, internal services behind the firewall. In the cloud that is especially dangerous because the server can often reach the platform's internal metadata service, which may hand out the instance's credentials. So an SSRF that would be a nuisance on-prem can, in a cloud, turn into stealing the machine's identity and pivoting into the whole account.",
     [("Walk me through how SSRF becomes credential theft in a cloud.",
       "You find a feature that fetches a URL you control, point it at the internal metadata endpoint, and the server, trusted from inside, retrieves the instance's temporary credentials and hands them back to you. Now you authenticate to the cloud as that instance, with whatever it was allowed to do."),
      ("How do defenders reduce the blast radius of this?",
       "Lock down the metadata service to require the newer, harder-to-abuse access method, give instances the least privilege so stolen credentials are nearly worthless, and block outbound requests to internal ranges from app servers. The SSRF may still exist; the payoff is what you starve.")]),

    ("pentest","mid",2,"wireless","what-wifi-test-is-for",
     "You are asked to test wireless. What are you actually testing for?",
     "Whether the wireless is a way into the things that matter. That means the strength of its authentication and encryption, whether a rogue or evil-twin access point could harvest credentials or get users to connect, whether the guest and corporate networks are truly separated, and where the corporate wireless lands once you are on it. The point is not can I crack a password in a vacuum, it is does the air give an attacker a foothold into the network.",
     [("Why does an evil-twin access point matter if the real Wi-Fi is encrypted?",
       "Because it attacks the human, not the crypto: a convincing fake network or captive portal gets users to connect or type credentials, and encryption on the real network does nothing about a user handing their password to a lookalike. It targets trust, which is the weaker link."),
      ("You crack onto the corporate Wi-Fi. What is the real test now?",
       "What that access reaches: if being on Wi-Fi drops you into the internal network with broad access, that is the finding, not the cracked password. Well-designed wireless treats a connected device as untrusted until it authenticates to what it needs, so I test whether that holds.")]),

    ("pentest","mid",3,"methodology","assumed-breach",
     "What is an assumed-breach test, and when is it more useful than starting from zero?",
     "An assumed-breach test starts from the premise that an attacker is already inside, so instead of spending the engagement trying to get a foothold, you are handed one and test what happens next: how far can you move, what can you reach, would the defenders notice. It is more useful when the question that matters is not can we be breached, everyone can, but what happens when we are, which is where real damage and real detection gaps live.",
     [("Why would a mature company prefer this over a traditional external test?",
       "Because they already know the perimeter is not perfect, and the expensive unknown is their internal resilience and detection. Assumed breach spends the budget on the part that actually determines how bad an incident gets, rather than re-proving that initial access is possible."),
      ("Does assumed breach let the external defences off the hook?",
       "It can if it is the only test you ever do, so it complements rather than replaces perimeter testing. The honest programme does both: can they get in, and when they do, how far do they get and who notices.")]),

    ("pentest","mid",2,"reporting","making-a-retest-worthwhile",
     "A client fixed your findings and wants a retest. How do you approach it so it is actually worth something?",
     "I verify the fix, not the ticket. For each finding I re-test the actual exploit path to confirm it is genuinely closed, not just that a setting changed, and I check they fixed the class of issue rather than the one instance I happened to report. A retest that just reads their remediation notes and marks things green is theatre; the value is in trying the attack again and failing.",
     [("They fixed the exact URL you reported but not the others like it. Pass or fail?",
       "Fail, or at least a partial: if the same flaw exists elsewhere because they patched the symptom I named rather than the cause, the risk is still live. I report that they fixed the instance and missed the class, because an attacker will not stop at the one URL I happened to list."),
      ("A fix introduced a new problem. Is that in scope for a retest?",
       "Yes, I would raise it. A retest that only looks at the old findings and ignores a hole the fix just opened gives false comfort. The honest answer is whether the system is safer now, not whether the original list is ticked.")]),

    # --------------------------------------------------------------- GRC
    ("grc","fresher",1,"assurance","gap-analysis-vs-audit",
     "What is a gap analysis, and how is it different from an audit?",
     "A gap analysis is you honestly measuring yourself against a standard to find where you fall short, so you know what to fix before anyone formal shows up. An audit is someone, often independent, formally testing whether you meet the requirement and recording the verdict. The difference is purpose and teeth: a gap analysis is a private to-do list you own; an audit is an external judgement you answer to. You do the first so the second goes well.",
     [("Can the same person do both?",
       "They can do a gap analysis, but a credible audit, especially a certification one, needs independence: you cannot objectively grade your own homework and have anyone trust the mark. For internal improvement, self-assessment is fine; for assurance to others, the separation is the point."),
      ("A gap analysis finds forty gaps. What do you do first?",
       "Rank them by risk, not by how easy they are to close: fix what actually exposes you most, not what is quickest to tick. Forty gaps sorted by convenience is how the important ones stay open while the trivial ones get the attention.")]),

    ("grc","fresher",2,"data","data-classification-why-it-fails",
     "Why does data classification matter, and why do most schemes fail?",
     "It matters because you cannot apply the right protection to everything equally, so you have to know what is sensitive to spend effort where it counts. Most schemes fail because they are too complicated for people to use: five tiers with fuzzy definitions mean nobody classifies consistently, everything gets marked low to avoid friction or high to be safe, and the labels stop meaning anything. A classification scheme lives or dies on whether an ordinary employee can apply it without thinking hard.",
     [("So what does a scheme that actually works look like?",
       "Few levels, clear examples, and defaults that make the easy path the right one. Three tiers people can tell apart beats five they cannot, because a scheme is only as good as the consistency of the humans applying it a hundred times a day."),
      ("Why is 'classify everything as confidential to be safe' a problem?",
       "Because if everything is sensitive, nothing is: you cannot prioritise protection, costs balloon, and people start ignoring the label because it is on things that plainly do not need it. Over-classification quietly destroys the signal the scheme exists to create.")]),

    ("grc","fresher",2,"resilience","bcp-vs-dr",
     "Business continuity versus disaster recovery: what is the difference, with an example?",
     "Business continuity is the whole plan for keeping the business running through a disruption; disaster recovery is the narrower, usually technical, piece about restoring systems and data. If a flood takes out your office, disaster recovery is getting the servers and data back online; business continuity is how staff keep serving customers meanwhile, from where, with what manual workarounds. DR is a subset: recovering IT is necessary but not the same as keeping the business alive.",
     [("A company has a great DR plan but no BCP. What breaks?",
       "They can restore the systems but have not worked out how people actually operate in the meantime, where staff go, how they take orders, who talks to customers, so the technology comes back to a business that seized up around it. Recovered servers do not help if nobody planned how the humans keep working."),
      ("What two numbers anchor a DR plan, and what do they mean?",
       "Recovery time objective, how fast you must be back, and recovery point objective, how much data you can afford to lose measured in time. Together they say be running again within X and lose no more than Y of data, and they drive what the recovery has to be capable of.")]),

    ("grc","fresher",2,"privacy","what-makes-consent-valid",
     "Under a privacy law like India's DPDP, what makes consent actually valid?",
     "Consent has to be a real, informed, freely given yes to a specific purpose, not a default you have to hunt to switch off. That means telling the person plainly what you will do with their data and why, in language they understand, asking for it rather than assuming it, tying it to defined purposes rather than everything forever, and letting them withdraw it as easily as they gave it. Consent buried in a wall of text or pre-ticked is not consent, it is a liability.",
     [("A pre-ticked 'I agree' box: valid consent?",
       "No. Consent has to be an affirmative act by the person, so a box they must untick is the opposite, agreement assumed rather than given. It fails the freely-given and the clear-action test at once."),
      ("Someone withdraws consent. What has to happen?",
       "You have to be able to act on it: stop the processing that relied on that consent and make withdrawal as easy as granting was. If your systems cannot actually find and stop using that person's data, the right to withdraw is only words, and that gap is itself the finding.")]),

    ("grc","mid",3,"risk","turning-risk-appetite-into-something-usable",
     "What is risk appetite, and how do you turn a board's vague answer into something usable?",
     "Risk appetite is how much risk the organisation is willing to accept to pursue its goals. Boards tend to answer in vibes, we are conservative, so my job is to translate that into thresholds people can actually apply: concrete statements about what losses, downtime, or exposure are acceptable in which areas, tied to real numbers and categories. The test is whether an analyst three levels down can look at a risk and know, from the stated appetite, whether to accept it or escalate.",
     [("The board says 'we have no appetite for risk.' What do you tell them?",
       "That zero risk means doing nothing, which is not an option, so the real question is which risks and how much, where. I help them say it in trade-offs: we will not accept risks that threaten customer data or safety, and we will accept measured operational risk to move fast. Vague absolutes are unusable; prioritised trade-offs are policy."),
      ("How does risk appetite actually change a day-to-day decision?",
       "It sets the line for who can accept what. A risk inside appetite can be signed off locally; one outside it has to escalate. Without that line, every decision is an argument, and risks get accepted by whoever is most tired, not by whoever should own them.")]),

    ("grc","mid",2,"assurance","soc2-type-1-vs-2",
     "SOC 2 Type I versus Type II: which does a customer actually want from you, and why?",
     "Type I says your controls are designed properly at a single point in time; Type II says they actually operated effectively over a period, usually several months. A customer doing real due diligence wants Type II, because design on paper is cheap and what they care about is that the controls worked day after day, not that they looked right on one Tuesday. Type I is a reasonable first step for a young company, but it is a promise, where Type II is evidence.",
     [("A startup has only a Type I. Is that a dealbreaker?",
       "Not necessarily, if they are early and have a Type II window in progress, because everyone starts somewhere. I would read it as design is in place, operation is unproven, and weigh it with where the company is, rather than reject it outright or treat it as equal to a Type II."),
      ("Why can a company not just keep renewing Type I and skip Type II?",
       "Because a serious customer will stop accepting it: repeatedly proving only the design, never the operation, starts to look like avoidance. Type I over and over says we keep checking the blueprint and never the building, and buyers notice.")]),

    ("grc","mid",3,"frameworks","overlapping-frameworks",
     "You have to comply with three overlapping frameworks. How do you avoid doing everything three times?",
     "By controlling once and mapping to many. Most frameworks ask for the same underlying things in different words, access control, logging, incident response, so I build a single set of real controls and a mapping that shows how each one satisfies the relevant requirement in each framework. Then evidence is collected once and pointed at three sets of requirements. The waste comes from treating each framework as its own universe; the saving comes from seeing that they mostly overlap.",
     [("What is the risk of mapping frameworks together carelessly?",
       "Claiming a control covers a requirement it does not quite meet, so a gap hides inside a tidy-looking map. The mapping has to be honest about where a framework asks for something extra, or you pass three audits on paper and fail the one that reads closely."),
      ("Where does the overlap approach break down?",
       "At the edges where a framework genuinely demands something specific the others do not, a particular control, a particular report. Those you handle individually, so the right model is one shared core plus a small set of framework-specific extras, not one-size-fits-all.")]),

    ("grc","mid",2,"operations","two-hundred-open-exceptions",
     "Your exception process has two hundred open exceptions. What does that tell you, and what do you do?",
     "That the policy and the reality have drifted apart: when there are two hundred standing exceptions, the exception has become the norm, and either the controls are unworkable or nobody is closing them. I would triage them by risk, find the clusters, because a hundred exceptions to one control means that control is wrong or unimplementable, and either fix the policy to match a sane reality or actually remediate and close. A pile of permanent exceptions is risk you have quietly accepted without deciding to.",
     [("A hundred of them are against the same control. What does that mean?",
       "That the control, not the hundred teams, is the problem: when everyone needs an exception to the same rule, the rule is unworkable or wrong for the environment. The fix is to redesign that control, not to keep rubber-stamping exceptions to it."),
      ("Exceptions have no expiry date. Why is that dangerous?",
       "Because a temporary exception with no end becomes permanent by default, and the risk it was meant to time-box just lives on unreviewed. Every exception needs an owner and a review date, or the backlog is really a list of risks nobody is accountable for anymore.")]),
]


def emit_bankjs(role):
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
            f"    slug: {json.dumps(slug)}, level: {json.dumps(level)}, topic: {json.dumps(topic)}, difficulty: {diff},\n"
            f"    prompt: {json.dumps(prompt)},\n"
            f"    answer: {json.dumps(model)},\n"
            "    followUps: [\n"
            f"{fu},\n"
            "    ],\n"
            "  },"
        )
    return "\n".join(out)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "count"
    if mode == "bankjs":
        print(emit_bankjs(sys.argv[2]))
    elif mode == "count":
        from collections import Counter
        print(Counter(q[0] for q in Q), "total", len(Q))
