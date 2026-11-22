// Second batch of browser labs, covering the roles the first three missed.
// Same rule as the first batch: if a task can be answered without opening the
// artifact, it is a quiz question wearing a lab costume and does not belong.

const ALERT_QUEUE = `id,time,severity,rule,host,account,src_ip,status
A-4471,08:02,High,EICAR test file detected,fin-lap-09,r.menon,-,open
A-4472,08:03,High,EICAR test file detected,fin-lap-11,s.rao,-,open
A-4473,08:04,High,EICAR test file detected,fin-lap-14,a.khan,-,open
A-4474,08:11,Low,Multiple failed logons,vpn-gw-01,-,45.148.10.77,open
A-4475,08:12,Low,Multiple failed logons,vpn-gw-01,-,45.148.10.77,open
A-4476,08:14,Medium,Impossible travel,o365,svc-reporting,196.251.88.4,open
A-4477,08:19,Low,Multiple failed logons,vpn-gw-01,-,45.148.10.77,open
A-4478,08:26,High,Port scan detected,edge-fw,-,45.148.10.77,open
A-4479,08:31,Medium,Unusual parent process,eng-wks-21,d.iyer,-,open
A-4480,08:33,Critical,Ransomware behaviour heuristic,test-vm-03,lab-admin,-,open
A-4481,08:40,Medium,MFA denied by user,o365,p.sharma,103.21.58.12,open
A-4482,08:41,Medium,MFA denied by user,o365,p.sharma,103.21.58.12,open
A-4483,08:41,Medium,MFA denied by user,o365,p.sharma,103.21.58.12,open
A-4484,08:42,Medium,MFA denied by user,o365,p.sharma,103.21.58.12,open
A-4485,08:44,Low,New inbox rule created,o365,p.sharma,196.251.88.4,open
A-4486,08:52,High,EICAR test file detected,fin-lap-22,n.gupta,-,open
A-4487,09:03,Medium,Admin group membership changed,dc-01,svc-reporting,-,open
A-4488,09:10,Low,Certificate expiring in 14 days,mx3,-,-,open`;

const WINDOWS_LOG = `11/19/2026 03:12:04 PM  4624  An account was successfully logged on.  Subject: SYSTEM  Logon Type: 3  Account Name: svc-sql  Source Network Address: 10.14.11.8  Authentication Package: NTLM  Workstation Name: ENG-WKS-21  Target: FIN-SRV-04
11/19/2026 03:12:04 PM  4672  Special privileges assigned to new logon.  Account Name: svc-sql  Privileges: SeDebugPrivilege SeImpersonatePrivilege SeTcbPrivilege  Target: FIN-SRV-04
11/19/2026 03:12:06 PM  7045  A new service was installed.  Service Name: PSEXESVC  Service File Name: %SystemRoot%\\PSEXESVC.exe  Service Type: user mode service  Start Type: demand start  Account: LocalSystem  Target: FIN-SRV-04
11/19/2026 03:12:07 PM  4688  A new process has been created.  Creator Process Name: C:\\Windows\\System32\\services.exe  New Process Name: C:\\Windows\\PSEXESVC.exe  Token Elevation Type: TokenElevationTypeDefault  Account Name: SYSTEM  Target: FIN-SRV-04
11/19/2026 03:12:09 PM  4688  A new process has been created.  Creator Process Name: C:\\Windows\\PSEXESVC.exe  New Process Name: C:\\Windows\\System32\\cmd.exe  Command Line: cmd.exe /c whoami /groups  Account Name: SYSTEM  Target: FIN-SRV-04
11/19/2026 03:12:22 PM  4688  A new process has been created.  Creator Process Name: C:\\Windows\\PSEXESVC.exe  New Process Name: C:\\Windows\\System32\\cmd.exe  Command Line: cmd.exe /c net group "Domain Admins" /domain  Account Name: SYSTEM  Target: FIN-SRV-04
11/19/2026 03:13:01 PM  4688  A new process has been created.  Creator Process Name: C:\\Windows\\PSEXESVC.exe  New Process Name: C:\\Windows\\System32\\reg.exe  Command Line: reg save HKLM\\SAM C:\\Windows\\Temp\\s.tmp  Account Name: SYSTEM  Target: FIN-SRV-04
11/19/2026 03:13:03 PM  4688  A new process has been created.  Creator Process Name: C:\\Windows\\PSEXESVC.exe  New Process Name: C:\\Windows\\System32\\reg.exe  Command Line: reg save HKLM\\SYSTEM C:\\Windows\\Temp\\y.tmp  Account Name: SYSTEM  Target: FIN-SRV-04
11/19/2026 03:14:40 PM  4624  An account was successfully logged on.  Subject: SYSTEM  Logon Type: 3  Account Name: svc-sql  Source Network Address: 10.14.11.8  Authentication Package: NTLM  Workstation Name: ENG-WKS-21  Target: HR-SRV-02
11/19/2026 03:14:41 PM  4672  Special privileges assigned to new logon.  Account Name: svc-sql  Privileges: SeDebugPrivilege SeImpersonatePrivilege SeTcbPrivilege  Target: HR-SRV-02
11/19/2026 03:16:55 PM  4624  An account was successfully logged on.  Subject: SYSTEM  Logon Type: 3  Account Name: svc-sql  Source Network Address: 10.14.11.8  Authentication Package: NTLM  Workstation Name: ENG-WKS-21  Target: DC-01
11/19/2026 03:16:58 PM  4625  An account failed to log on.  Account Name: svc-sql  Logon Type: 3  Failure Reason: Account restriction  Source Network Address: 10.14.11.8  Target: DC-01
11/19/2026 03:21:12 PM  4624  An account was successfully logged on.  Subject: SYSTEM  Logon Type: 3  Account Name: a.verma  Source Network Address: 10.14.11.8  Authentication Package: NTLM  Workstation Name: ENG-WKS-21  Target: DC-01
11/19/2026 03:21:12 PM  4672  Special privileges assigned to new logon.  Account Name: a.verma  Privileges: SeDebugPrivilege SeBackupPrivilege SeTakeOwnershipPrivilege  Target: DC-01
11/19/2026 03:21:40 PM  4688  A new process has been created.  Creator Process Name: C:\\Windows\\PSEXESVC.exe  New Process Name: C:\\Windows\\System32\\ntdsutil.exe  Command Line: ntdsutil "ac i ntds" "ifm" "create full C:\\Windows\\Temp\\d"  Account Name: SYSTEM  Target: DC-01
11/19/2026 08:30:11 AM  4624  An account was successfully logged on.  Subject: SYSTEM  Logon Type: 2  Account Name: a.verma  Source Network Address: 10.14.11.41  Authentication Package: Kerberos  Workstation Name: IT-WKS-04  Target: IT-WKS-04`;

const ACCESS_LOG = `203.0.113.44 - - [19/Nov/2026:09:02:11 +0530] "GET / HTTP/1.1" 200 5312 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0"
203.0.113.44 - - [19/Nov/2026:09:02:12 +0530] "GET /assets/app.css HTTP/1.1" 200 18442 "https://shop.northfield.co.in/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0"
198.51.100.9 - - [19/Nov/2026:09:04:50 +0530] "GET /products?q=lamp HTTP/1.1" 200 7781 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2) Safari/605.1"
91.214.76.33 - - [19/Nov/2026:09:11:02 +0530] "GET /admin HTTP/1.1" 404 162 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:11:02 +0530] "GET /administrator HTTP/1.1" 404 162 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:11:03 +0530] "GET /wp-login.php HTTP/1.1" 404 162 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:11:03 +0530] "GET /phpmyadmin HTTP/1.1" 404 162 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:11:04 +0530] "GET /.git/config HTTP/1.1" 404 162 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:11:04 +0530] "GET /.env HTTP/1.1" 200 614 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:11:05 +0530] "GET /backup.sql HTTP/1.1" 404 162 "-" "python-requests/2.32.3"
203.0.113.71 - - [19/Nov/2026:09:14:28 +0530] "GET /products/88 HTTP/1.1" 200 6120 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1"
91.214.76.33 - - [19/Nov/2026:09:22:40 +0530] "POST /api/v1/login HTTP/1.1" 200 388 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:22:44 +0530] "GET /api/v1/users?limit=500 HTTP/1.1" 200 214882 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:23:02 +0530] "GET /api/v1/orders?limit=1000 HTTP/1.1" 200 884210 "-" "python-requests/2.32.3"
198.51.100.9 - - [19/Nov/2026:09:24:19 +0530] "GET /cart HTTP/1.1" 200 3310 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2) Safari/605.1"
91.214.76.33 - - [19/Nov/2026:09:26:55 +0530] "POST /admin/media/upload HTTP/1.1" 201 142 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:27:10 +0530] "GET /uploads/2026/11/thumb_9f2a.php?c=id HTTP/1.1" 200 54 "-" "python-requests/2.32.3"
91.214.76.33 - - [19/Nov/2026:09:27:33 +0530] "GET /uploads/2026/11/thumb_9f2a.php?c=cat%20/etc/passwd HTTP/1.1" 200 1871 "-" "python-requests/2.32.3"
45.33.19.8 - - [19/Nov/2026:09:28:01 +0530] "GET /uploads/2026/11/thumb_9f2a.php?c=whoami HTTP/1.1" 200 34 "-" "curl/8.9.1"
203.0.113.44 - - [19/Nov/2026:09:31:44 +0530] "POST /api/v1/cart/add HTTP/1.1" 200 221 "https://shop.northfield.co.in/products/88" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0"
45.33.19.8 - - [19/Nov/2026:09:44:20 +0530] "GET /uploads/2026/11/thumb_9f2a.php?c=tar%20-czf%20/tmp/o.tgz%20/var/www HTTP/1.1" 200 61 "-" "curl/8.9.1"`;

const NMAP_OUT = `Starting Nmap 7.98 ( https://nmap.org ) at 2026-11-19 11:04 IST
Nmap scan report for staging.northfield.co.in (103.21.58.47)
Host is up (0.028s latency).
Not shown: 991 filtered tcp ports (no-response)

PORT     STATE SERVICE    VERSION
21/tcp   open  ftp        vsftpd 3.0.3
| ftp-anon: Anonymous FTP login allowed (FTP code 230)
|_drwxr-xr-x    2 ftp      ftp          4096 Sep 02 2026 backups
22/tcp   open  ssh        OpenSSH 8.2p1 Ubuntu 4ubuntu0.11 (Ubuntu Linux; protocol 2.0)
|_ssh-hostkey: 3072 SHA256:4mCq8vX2pLdKsR7nT1yWbE9zHfJgA3uQ (RSA)
80/tcp   open  http       nginx 1.18.0 (Ubuntu)
|_http-title: Did not follow redirect to https://staging.northfield.co.in/
443/tcp  open  ssl/http   nginx 1.18.0 (Ubuntu)
| ssl-cert: Subject: commonName=staging.northfield.co.in
| Issuer: commonName=staging.northfield.co.in
| Not valid before: 2024-03-11T00:00:00
|_Not valid after:  2025-03-11T23:59:59
|_http-title: Northfield Staging
3306/tcp open  mysql      MySQL 5.7.33-0ubuntu0.16.04.1
|_mysql-info: Protocol: 10, Capabilities flags: 65535, Auth plugin: mysql_native_password
6379/tcp open  redis      Redis key-value store 5.0.7
|_redis-info: Server responded without authentication
8080/tcp open  http       Jetty 9.4.z-SNAPSHOT
|_http-title: Jenkins [Jenkins]
|_http-auth: HTTP/1.1 403 Forbidden
9200/tcp open  http       Elasticsearch REST API 7.9.1
|_http-title: Did not follow redirect to /_cluster/health

Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel
Nmap done: 1 IP address (1 host up) scanned in 42.11 seconds`;

const HTTP_PAIRS = `### Request 1
GET /api/v2/invoices/4471 HTTP/1.1
Host: billing.northfield.co.in
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD_USER_8812.SIG
Accept: application/json

### Response 1
HTTP/1.1 200 OK
Content-Type: application/json

{"id":4471,"account_id":8812,"customer":"Rohit Menon","amount":"18400.00",
 "currency":"INR","status":"paid","pdf":"/api/v2/invoices/4471/pdf"}

### Request 2
GET /api/v2/invoices/4472 HTTP/1.1
Host: billing.northfield.co.in
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD_USER_8812.SIG
Accept: application/json

### Response 2
HTTP/1.1 200 OK
Content-Type: application/json

{"id":4472,"account_id":9043,"customer":"Sunita Rao","amount":"226500.00",
 "currency":"INR","status":"unpaid","pdf":"/api/v2/invoices/4472/pdf"}

### Request 3
GET /api/v2/accounts/9043 HTTP/1.1
Host: billing.northfield.co.in
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD_USER_8812.SIG

### Response 3
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"error":"account_scope_mismatch"}

### Request 4
PATCH /api/v2/accounts/8812 HTTP/1.1
Host: billing.northfield.co.in
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD_USER_8812.SIG
Content-Type: application/json

{"display_name":"Rohit M","role":"admin"}

### Response 4
HTTP/1.1 200 OK
Content-Type: application/json

{"id":8812,"display_name":"Rohit M","role":"admin","updated_at":"2026-11-19T11:42:08Z"}

### Request 5
GET /api/v1/invoices/4472 HTTP/1.1
Host: billing.northfield.co.in
Accept: application/json

### Response 5
HTTP/1.1 200 OK
Content-Type: application/json

{"id":4472,"account_id":9043,"customer":"Sunita Rao","amount":"226500.00","status":"unpaid"}`;

const CLOUD_TRAIL = `time,event,identity,identity_type,source_ip,region,result
2026-11-19T04:02:11Z,GetCallerIdentity,deploy-ci,AccessKey,13.233.44.9,ap-south-1,Success
2026-11-19T04:02:14Z,PutObject,deploy-ci,AccessKey,13.233.44.9,ap-south-1,Success
2026-11-19T04:02:16Z,CreateInvalidation,deploy-ci,AccessKey,13.233.44.9,ap-south-1,Success
2026-11-19T10:41:03Z,GetCallerIdentity,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:41:29Z,ListBuckets,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:41:44Z,ListUsers,deploy-ci,AccessKey,45.148.10.77,us-east-1,AccessDenied
2026-11-19T10:41:51Z,ListRoles,deploy-ci,AccessKey,45.148.10.77,us-east-1,AccessDenied
2026-11-19T10:42:08Z,GetBucketPolicy,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:42:33Z,ListObjectsV2,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:44:02Z,GetObject,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:44:05Z,GetObject,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:44:09Z,GetObject,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:51:17Z,AssumeRole,deploy-ci,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T10:51:18Z,GetCallerIdentity,ops-admin-role,AssumedRole,45.148.10.77,us-east-1,Success
2026-11-19T10:52:40Z,CreateUser,ops-admin-role,AssumedRole,45.148.10.77,us-east-1,Success
2026-11-19T10:52:44Z,AttachUserPolicy,ops-admin-role,AssumedRole,45.148.10.77,us-east-1,Success
2026-11-19T10:52:49Z,CreateAccessKey,ops-admin-role,AssumedRole,45.148.10.77,us-east-1,Success
2026-11-19T10:55:02Z,StopLogging,ops-admin-role,AssumedRole,45.148.10.77,us-east-1,Success
2026-11-19T11:02:19Z,GetCallerIdentity,svc-maintenance,AccessKey,45.148.10.77,us-east-1,Success
2026-11-19T11:30:00Z,PutObject,deploy-ci,AccessKey,13.233.44.9,ap-south-1,Success`;

const ACCESS_REVIEW = `user,full_name,department,system,entitlement,granted_on,last_login,hr_status
r.menon,Rohit Menon,Finance,ERP,AP Clerk,2024-02-11,2026-11-19,Active
s.rao,Sunita Rao,Finance,ERP,AP Approver,2023-07-02,2026-11-18,Active
s.rao,Sunita Rao,Finance,ERP,AP Clerk,2021-05-19,2026-11-18,Active
a.khan,Ayesha Khan,Marketing,CRM,Campaign Manager,2025-01-20,2026-11-17,Active
d.iyer,Deepak Iyer,Engineering,AWS Prod,PowerUser,2024-09-03,2026-11-19,Active
d.iyer,Deepak Iyer,Engineering,ERP,AP Approver,2022-03-14,2025-04-08,Active
n.gupta,Nikhil Gupta,Sales,CRM,Sales Rep,2025-06-11,2026-08-02,Left
p.sharma,Priya Sharma,HR,HRIS,HR Admin,2023-11-30,2026-11-19,Active
v.das,Vikram Das,Contractor,AWS Prod,AdministratorAccess,2026-02-01,2026-11-19,Contractor
v.das,Vikram Das,Contractor,ERP,Read Only,2026-02-01,2026-06-12,Contractor
ops-shared,Operations Shared,Operations,AWS Prod,PowerUser,2021-01-08,2026-11-19,Active
m.joshi,Meera Joshi,Engineering,AWS Prod,ReadOnly,2026-03-22,2026-11-19,Active
t.pillai,Tara Pillai,Finance,ERP,AP Approver,2024-08-15,2026-05-30,Left
k.bose,Kaushik Bose,Engineering,Jenkins,Admin,2022-06-09,2026-11-19,Active
k.bose,Kaushik Bose,Engineering,AWS Prod,PowerUser,2022-06-09,2026-11-19,Active
svc-backup,Backup Service,-,AWS Prod,AdministratorAccess,2021-03-17,2026-11-19,Service`;

export const LABS_2 = [
  {
    slug: 'alert-queue-triage',
    difficulty: 2,
    title: 'Eighteen alerts, one shift, pick your order',
    role: 'soc',
    level: 'fresher',
    is_free: 1,
    artifact_kind: 'table',
    artifact_name: 'queue-0800-0915.csv',
    artifact: ALERT_QUEUE,
    brief:
      'Your queue at the start of a shift. Nobody has triaged any of it. You will not get through all eighteen before the handover, so the question is not what each alert means, it is which ones you open first and what you can safely leave. Sort and filter as much as you like.',
    tasks: [
      {
        prompt: 'Which alert do you open first, and why that one rather than the Critical?',
        answer:
          'A-4485, the new inbox rule on p.sharma from 196.251.88.4, rated Low. Creating a mailbox rule is the standard first move after a mailbox compromise, and that source address is the same one as the impossible-travel alert at 08:14. The Critical, A-4480, is ransomware heuristics on test-vm-03 under lab-admin, which is a test machine behaving like a test machine. Severity is a property of the rule, not of your environment.',
      },
      {
        prompt: 'Four alerts chain together into one story. List them in order and say what the story is.',
        answer:
          'A-4481 to A-4484, four MFA denials on p.sharma from 103.21.58.12 between 08:40 and 08:42, then A-4485, the inbox rule from a completely different address at 08:44. Someone had the password and was pushing MFA prompts hoping she would accept one. Something then succeeded, because a rule got created two minutes later. A-4476, impossible travel on svc-reporting from that same 196.251.88.4, is the same actor on a second account.',
      },
      {
        prompt: 'Five alerts are the same rule on five different hosts. Are they an incident?',
        answer:
          'The EICAR detections, A-4471 to A-4473, A-4486. EICAR is a harmless test string every product is required to detect, so this is either someone running a deliberate test or a file circulating with the string in it. Worth one note and a question to whoever is testing, not worth your first hour. The useful instinct is noticing that five identical High alerts across unrelated users is a pattern about your tooling, not about an attacker.',
      },
      {
        prompt: 'A-4487 says the admin group changed, by svc-reporting. Why does that matter more now than it would on its own?',
        answer:
          'Because svc-reporting is the account in A-4476 with impossible travel from the same address as the inbox rule. On its own, a service account changing admin membership is a change-control question. In this queue it is the same actor arriving at privilege, roughly an hour after the first mailbox. That is the alert that turns this from a phishing incident into a domain problem.',
      },
      {
        prompt: 'Which alerts can you genuinely leave for the next shift, and how do you leave them?',
        answer:
          'The EICAR batch, the three failed-logon Lows from 45.148.10.77 with its matching port scan, and the certificate expiry. The scanner is background internet noise and the certificate is a ticket, not an alert. Leave them closed or deferred with one line each saying why, not open and untouched. An alert passed on with no note is the same as one nobody read.',
      },
    ],
  },

  {
    slug: 'psexec-lateral',
    difficulty: 3,
    title: 'One service account, three servers, ninety seconds apart',
    role: 'soc',
    level: 'mid',
    is_free: 0,
    artifact_kind: 'log',
    artifact_name: 'security-events-1119.log',
    artifact: WINDOWS_LOG,
    brief:
      'Security events from three Windows servers and one workstation, pulled after a detection fired on the domain controller and was closed as a false positive by the previous shift. Reconstruct what happened and decide what you tell the business.',
    tasks: [
      {
        prompt: 'What authentication pattern tells you this is lateral movement rather than normal administration?',
        answer:
          'Every logon is type 3 with NTLM, from one workstation, ENG-WKS-21 at 10.14.11.8, against three different servers within nine minutes, each immediately followed by 4672 granting SeDebugPrivilege and SeImpersonatePrivilege. Admins log in interactively or over RDP from a jump host; they do not hit three servers over the network in ninety-second intervals. NTLM rather than Kerberos on a domain is the tell that the hash is being used rather than a password.',
      },
      {
        prompt: 'A service was installed. What is it, and why is that line the one you would show a manager?',
        answer:
          'Event 7045, PSEXESVC installed as LocalSystem on FIN-SRV-04, then 4688 showing services.exe spawning PSEXESVC.exe which spawns cmd.exe. That is remote execution as SYSTEM. It is the line for a manager because it needs no interpretation: a remote-execution service was installed on a finance server by a SQL service account, and nobody raised a change for it.',
      },
      {
        prompt: 'Two commands are credential theft. Name them and say what the attacker walks away with.',
        answer:
          'reg save HKLM\\SAM and reg save HKLM\\SYSTEM at 03:13, which together let the local account hashes be extracted offline. Then ntdsutil ifm create full on DC-01 at 03:21, which builds a copy of the entire Active Directory database including every domain hash. After that second one, assume every credential in the domain is compromised and plan a full reset, not a targeted one.',
      },
      {
        prompt: 'The svc-sql account fails on DC-01 at 03:16:58, then a.verma succeeds at 03:21 from the same workstation. What happened in between?',
        answer:
          'The service account hit an account restriction on the domain controller, so it could not get in. Five minutes later a different and more privileged account works from the same source. The hashes dumped from the two member servers at 03:13 are the obvious bridge: a.verma had logged on somewhere the attacker could reach. Note the 08:30 entry: a.verma logs on interactively at her own workstation that morning, which is how her credential came to be on a machine at all.',
      },
      {
        prompt: 'The previous shift closed this as a false positive. What do you do about that, beyond the incident?',
        answer:
          'Handle the incident first, then find out why it was closable. Was the evidence genuinely ambiguous at the time, was the queue too deep, or did the runbook say to close it. One analyst making one call is almost never the real finding. If the runbook told them to close it, fix the runbook and say so to the team, because the alternative teaches everyone that following the process is risky.',
      },
    ],
  },

  {
    slug: 'webshell-in-access-log',
    difficulty: 1,
    title: 'The scan that found something',
    role: 'network',
    level: 'fresher',
    is_free: 1,
    artifact_kind: 'log',
    artifact_name: 'access.log',
    artifact: ACCESS_LOG,
    brief:
      'Half an hour of web server access logs from a shop front end, pulled because the hosting bill showed unusual outbound transfer. Most of what you see is ordinary. Find the part that is not, and work out how far it went.',
    tasks: [
      {
        prompt: 'A scan runs at 09:11. How do you spot it, and which single request in it matters?',
        answer:
          'Five requests in three seconds from 91.214.76.33 with the user agent python-requests, all to paths nobody links to: /admin, /wp-login.php, /phpmyadmin, /.git/config, /.env. Four return 404. The one that matters is /.env returning 200 with 614 bytes, because that file holds application credentials. One success in a wall of failures is the whole finding.',
      },
      {
        prompt: 'Eleven minutes later the same address logs in successfully. Connect the two events.',
        answer:
          'POST /api/v1/login at 09:22:40 returns 200, which means credentials worked. The credentials came from the .env file read at 09:11:04. The gap is the attacker reading what they took. Immediately after, GET /api/v1/users?limit=500 returns 214 KB and /api/v1/orders?limit=1000 returns 884 KB: that is the customer and order data leaving, and the response sizes are how you size the breach.',
      },
      {
        prompt: 'Identify the web shell and the exact moment it starts working.',
        answer:
          'POST /admin/media/upload at 09:26:55 returns 201 Created. Fifteen seconds later GET /uploads/2026/11/thumb_9f2a.php?c=id returns 200 with 54 bytes. A .php file in an uploads directory, taking a c parameter, returning short responses, is a command shell. The upload endpoint accepted a PHP file and the uploads directory executes PHP, which is two separate defects.',
      },
      {
        prompt: 'A second address appears at 09:28. What does that change about your response?',
        answer:
          '45.33.19.8 with curl hits the same shell at 09:28 and again at 09:44 to tar up /var/www. Either the attacker moved address or access was handed on. Either way, blocking 91.214.76.33 alone achieves nothing: the shell is the access, not the address. Delete the file, stop PHP executing in uploads, and rotate every credential that was in that .env.',
      },
      {
        prompt: 'Write the one-paragraph summary you would send the business.',
        answer:
          'Between 09:11 and 09:44 an attacker read a configuration file exposed at /.env, used the credentials in it to sign in to the API, downloaded roughly 500 customer records and 1000 orders, uploaded a web shell through the media upload endpoint and used it to run commands and archive the web root. The server is compromised, the data in those two API responses should be treated as disclosed, and every credential in that file must be rotated now. Give times, what was taken and what you need, and leave the speculation out.',
      },
    ],
  },

  {
    slug: 'nmap-what-first',
    difficulty: 2,
    title: 'Nine ports open. Where do you start?',
    role: 'pentest',
    level: 'fresher',
    is_free: 1,
    artifact_kind: 'log',
    artifact_name: 'nmap-staging.txt',
    artifact: NMAP_OUT,
    brief:
      'A service scan of a staging host that is in scope for a week-long engagement. You have limited time and the client will judge the report by what you found that matters. Decide your order and be able to defend it.',
    tasks: [
      {
        prompt: 'Which finding would you chase first, and why it rather than the obvious ones?',
        answer:
          'Redis on 6379 responding without authentication. It is unauthenticated access to a data store, reachable now, with no exploit chain required, and on many deployments it leads straight to writing files as the service user. The obvious ones, old MySQL and an expired certificate, are findings but neither hands you access in the first ten minutes.',
      },
      {
        prompt: 'Anonymous FTP is open with a backups directory. What do you do, and what do you not do?',
        answer:
          'Log in, list the directory, and record what is exposed and its size. Do not download the backups: on an engagement you are proving exposure, not exfiltrating client data, and pulling a database backup onto your machine creates a liability you did not need. Note the filenames and dates, screenshot the listing, and describe the impact.',
      },
      {
        prompt: 'The certificate expired in March 2025 and is self-signed. How do you rate that, honestly?',
        answer:
          'Low on its own, and say so rather than padding the report. It is a staging host; self-signed is common there and the real risk is that it trains staff to click through warnings. The more interesting observation is what it implies: a certificate nobody renewed for eighteen months suggests the host is unowned, which is usually true of the rest of its patching too.',
      },
      {
        prompt: 'Jenkins on 8080 returns 403 and Elasticsearch on 9200 is open. Which is the bigger problem and why?',
        answer:
          'Elasticsearch, because 403 on Jenkins means something is refusing you while an open 9200 typically means the cluster API answers without authentication, so you can read every index. Jenkins is still worth revisiting, since 403 from the root does not mean every endpoint is protected and Jenkins is a credential store with deploy access when it is not. But start where the data is already readable.',
      },
      {
        prompt: 'The client says this is only staging, so none of it matters. Respond.',
        answer:
          'Ask one question: does staging hold production data, and can staging reach production. Both are usually yes, and the answer to either turns this into a production finding. Staging is where the controls are relaxed and the data is real, which is exactly why it gets attacked. Put the answer in the report in their words rather than arguing in the room.',
      },
    ],
  },

  {
    slug: 'idor-and-mass-assignment',
    difficulty: 3,
    title: 'Same token, someone else\'s invoice',
    role: 'pentest',
    level: 'mid',
    is_free: 0,
    artifact_kind: 'log',
    artifact_name: 'proxy-history.http',
    artifact: HTTP_PAIRS,
    brief:
      'Five request and response pairs from your proxy during an authenticated API test. You are signed in as account 8812 throughout and never change the token. Work out what you have, and what you would write.',
    tasks: [
      {
        prompt: 'Requests 1 and 2 are the finding. State it precisely enough for a developer to act on.',
        answer:
          'GET /api/v2/invoices/{id} returns any invoice to any authenticated caller. The same bearer token for account 8812 returns invoice 4471 belonging to account 8812 and invoice 4472 belonging to account 9043. The endpoint authenticates the caller but never checks that the invoice belongs to them. Broken object-level authorisation, and the fix is an ownership check on the record, not on the route.',
      },
      {
        prompt: 'Request 3 returns 403. Why does that make the finding stronger rather than weaker?',
        answer:
          'Because it proves the application knows how to do this. /api/v2/accounts/9043 correctly refuses with account_scope_mismatch, so the authorisation model exists and was simply not applied to the invoices endpoint. That removes the "we never designed for this" defence and turns it from an architecture discussion into a missed check on one route, which is both more embarrassing and much easier to fix.',
      },
      {
        prompt: 'Request 4 is a second, different vulnerability. Name it and say what it costs.',
        answer:
          'Mass assignment. The PATCH to the caller\'s own account sends a role field, which a client should never be able to set, and the response confirms role is now admin. Self-service privilege escalation from a normal account. Rate it above the invoice read: one discloses data, this one makes the attacker an administrator.',
      },
      {
        prompt: 'Request 5 drops the Authorization header entirely and still returns data. What have you actually found?',
        answer:
          'An old API version left routable with no authentication at all. /api/v1/invoices/4472 returns the record unauthenticated, which means the v2 access control conversation is beside the point while v1 is reachable. Retired versions that were never actually retired are one of the most common ways a well-secured API leaks, and nobody is monitoring them because nobody remembers they exist.',
      },
      {
        prompt: 'How do you order these three in the report, and what do you say about remediation sequence?',
        answer:
          'Unauthenticated v1 first, because it needs no account at all. Mass assignment second, because it gives an attacker admin. Invoice object access third. On sequence, say that fixing v2 while v1 is still routable fixes nothing, so turning off v1 is the immediate action and the authorisation work follows. Giving a remediation order rather than a severity list is what makes a report usable.',
      },
    ],
  },

  {
    slug: 'leaked-key-in-the-trail',
    difficulty: 2,
    title: 'The deploy key woke up in another country',
    role: 'cloud',
    level: 'mid',
    is_free: 0,
    artifact_kind: 'table',
    artifact_name: 'audit-trail-1119.csv',
    artifact: CLOUD_TRAIL,
    brief:
      'Control-plane audit events from one cloud account for a single day, pulled after the billing alert showed data transfer out of a region you do not use. The deploy pipeline is supposed to be the only thing using automation credentials here.',
    tasks: [
      {
        prompt: 'Two things about the 10:41 events say compromise before you read a single API call. What are they?',
        answer:
          'The source address and the region. The deploy-ci key operates from 13.233.44.9 in ap-south-1 in the morning and again at 11:30, but at 10:41 the same key is used from 45.148.10.77 in us-east-1. One credential, two origins, and a region the account does not use. Identity plus location plus region is the fastest triage you have in a cloud account.',
      },
      {
        prompt: 'The attacker gets two AccessDenied results. Why are failures useful to you here?',
        answer:
          'ListUsers and ListRoles both fail, which tells you the key was reasonably scoped and that they were enumerating rather than acting with knowledge. It also dates their reconnaissance precisely. Denied calls are evidence of intent and of what your least-privilege work actually bought you, which is worth saying out loud when someone asks whether the controls helped.',
      },
      {
        prompt: 'AssumeRole at 10:51 is the pivot. Explain what changes after it and why the identity column matters.',
        answer:
          'Before it, the actor is the deploy-ci key with limited permissions. After it, the identity becomes ops-admin-role as an AssumedRole and everything succeeds. The deploy key was allowed to assume an operations role, so the blast radius was never the key\'s own policy, it was whatever it could assume. Trust relationships, not attached policies, are what decide how far a leaked credential reaches.',
      },
      {
        prompt: 'Three events in ninety seconds set up long-term access. Name them and say what you do about each.',
        answer:
          'CreateUser, AttachUserPolicy and CreateAccessKey between 10:52:40 and 10:52:49, and the new identity svc-maintenance appears using its key at 11:02. Delete the user and its key rather than just disabling it, audit everything it did in that window, and check for any other identity created that day. Revoking deploy-ci alone leaves the attacker signed in under a name that looks like it belongs.',
      },
      {
        prompt: 'StopLogging at 10:55 is the last thing they do. What does that mean for everything after it?',
        answer:
          'Your trail ends there, so you cannot treat 11:02 as the last activity and you cannot say what happened between the stop and whenever logging came back. Say that plainly. Then check whether anything was shipping these events elsewhere, a log archive or a sibling account, because a copy outside the compromised account is the only thing that survives this move. If there is none, that is the finding to fix first.',
      },
    ],
  },

  {
    slug: 'access-review-extract',
    difficulty: 1,
    title: 'Sign here to say this access is correct',
    role: 'grc',
    level: 'fresher',
    is_free: 0,
    artifact_kind: 'table',
    artifact_name: 'access-review-q4.csv',
    artifact: ACCESS_REVIEW,
    brief:
      'The quarterly access review extract for three systems. A manager is about to approve all of it in one click, which is what happened last quarter. Read it properly and find what should not be there. Sort by any column.',
    tasks: [
      {
        prompt: 'Two rows should have been removed by the leaver process. Find them and say what the real finding is.',
        answer:
          'n.gupta in CRM and t.pillai in ERP, both marked Left in HR status and both still holding entitlements. The real finding is not two accounts, it is that the leaver process does not reach these systems, so the number is however many people have left since it last worked. Report the control failure with these two as evidence, not the two as the issue.',
      },
      {
        prompt: 'One row is a segregation-of-duties problem. Which, and why does it matter in a finance system?',
        answer:
          's.rao holds both AP Clerk and AP Approver in the ERP. The same person can raise a payment and approve it, which is the classic fraud path and the first thing an auditor tests in accounts payable. Note also d.iyer, an engineer still holding AP Approver from 2022 with no ERP login since April 2025: not a conflict, but an engineer who can approve payments.',
      },
      {
        prompt: 'Two entitlements grant administrator rights in production. Say what you would ask about each.',
        answer:
          'v.das, a contractor with AdministratorAccess to AWS Prod since February, and svc-backup, a service identity with AdministratorAccess since 2021. For the contractor: what does the contract end date say, and why administrator rather than scoped. For the service: what does a backup job actually need, because it is almost never everything, and who holds its credentials. Service accounts skip reviews precisely because no human owns them.',
      },
      {
        prompt: 'What is wrong with the ops-shared row, independent of what it can do?',
        answer:
          'It is a shared account, so no action taken with it can be attributed to a person. That breaks accountability for every other control: logging, review, and any investigation that lands on it. Granted in 2021 and used yesterday, so it is live. The recommendation is named accounts with a role, and if the shared one must survive, a checkout process with a named owner at minimum.',
      },
      {
        prompt: 'The manager says everyone on the list needs their access. How do you make the review mean something?',
        answer:
          'Stop asking them to confirm a list and start asking a specific question per row, in business terms: does this person still need to approve payments. Show what the entitlement permits rather than its name, pre-flag the rows that contradict HR data or have not been used in ninety days, and require a reason to keep anything flagged. A review where everything is approved in one click is a signature, not a control, and it will not survive an audit.',
      },
    ],
  },
];
