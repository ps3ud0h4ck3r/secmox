// Scenario writing.
//
// A scenario has no artifact to open. It is a situation, and the candidate
// writes how they would handle it end to end. Then they score what they wrote
// against the points a panel actually listens for.
//
// What makes a scenario worth writing: it has to have a wrong answer that
// sounds right. Every one of these rewards a candidate who notices the thing
// under the question, and catches the one who answers the surface of it.
//
// `points` is the rubric. Each is something a panel would tick. `detail` is
// what earns the tick, written so someone who missed it learns why it mattered
// rather than just losing a mark.

export const SCENARIOS = [
  {
    slug: 'unacked-alert',
    role: 'soc',
    level: 'fresher',
    title: 'The alert nobody acknowledged',
    minutes: 20,
    isFree: true,
    situation:
      'At 03:12 an EDR alert fired on a finance workstation: WINWORD.EXE spawned rundll32.exe, ' +
      'which then made an outbound connection. Nobody acknowledged it. You arrive at 09:00 and ' +
      'the alert is still open and unassigned. The user is at their desk, working normally, and ' +
      'has no idea anything happened.',
    ask:
      'Write what you do in your first thirty minutes, in the order you would do it, and state ' +
      'what specifically would make you escalate this rather than close it.',
    modelAnswer:
      'The first question is not what happened six hours ago, it is what is true right now. ' +
      'Check whether the process is still running, whether anything was written that survives a ' +
      'reboot, and whether that outbound connection is still being made. Those three answers ' +
      'change everything that follows.\n\n' +
      'Before you touch the machine, decide that you are not going to destroy what is on it. The ' +
      'single most common way a fresher loses this incident is telling the user to restart, or ' +
      'restarting it themselves to "clear" the alert. Memory is where the answer lives and a ' +
      'reboot throws it away.\n\n' +
      'The signal here is the chain, not the binary. rundll32.exe is a signed Microsoft component ' +
      'and on its own it is noise. WINWORD.EXE as its parent is the finding, because documents do ' +
      'not legitimately need to do that. Pull the full process tree, the command line, and the ' +
      'document that was open.\n\n' +
      'Then scope it. The same document almost certainly went to more than one person. Search for ' +
      'the parent chain, the file hash, the sender and the destination address across the estate ' +
      'before you convince yourself this is one machine.\n\n' +
      'Containment is a business decision with a security recommendation attached. Say what you ' +
      'recommend and who you need to approve it. On a finance workstation with payment access, ' +
      'isolating the host and keeping it powered on is usually the right call, and you should be ' +
      'able to say why you would not simply pull the network cable.\n\n' +
      'Escalate on any of: an established outbound session to infrastructure you cannot attribute, ' +
      'evidence of credential access, any sign of movement to a second host, or persistence that ' +
      'survives reboot. Also escalate on the clock: an alert that sat for six hours on a host with ' +
      'payment access is itself worth reporting, separately from whatever the alert turns out to be.\n\n' +
      'Last, be careful what you say to the user. You need them to stop working and not touch the ' +
      'machine. You do not need to tell them they have been compromised before you know it.',
    points: [
      {
        label: 'Establishes whether it is still live before anything else',
        detail:
          'Process still running, persistence written, connection still open. Six hours of lag ' +
          'does not mean it is over, and it does not mean it is not.',
      },
      {
        label: 'Preserves the host instead of clearing it',
        detail:
          'No reboot, no "just restart it" to the user, no deleting the file to make the alert go ' +
          'away. Volatile evidence is the evidence that answers this.',
      },
      {
        label: 'Reads the parent chain, not the binary name',
        detail:
          'rundll32.exe alone is signed and ordinary. WINWORD.EXE spawning it is the finding. A ' +
          'candidate who treats the binary as the indicator will chase noise forever.',
      },
      {
        label: 'Scopes beyond the one host',
        detail:
          'Same document, same sender, same hash, same destination, across the estate. A phishing ' +
          'document that reached one finance user reached others.',
      },
      {
        label: 'Separates the recommendation from the decision',
        detail:
          'Says what containment they advise and who authorises it. Isolating a finance workstation ' +
          'during month end has a cost that is not the analyst’s to absorb silently.',
      },
      {
        label: 'Names escalation triggers concretely',
        detail:
          'Unattributed outbound session, credential access, a second host, reboot-surviving ' +
          'persistence. "If it looks bad" is not a trigger.',
      },
      {
        label: 'Raises the six hours as its own finding',
        detail:
          'An unacknowledged alert overnight on a host with payment access is a coverage problem ' +
          'that exists whether or not this alert turns out to be real.',
      },
    ],
  },

  {
    slug: 'closed-as-benign',
    role: 'soc',
    level: 'mid',
    title: 'The alert that was closed as benign',
    minutes: 25,
    situation:
      'Five weeks ago an analyst closed an alert for a PowerShell download cradle on a build ' +
      'server. The closure note reads: "sysadmin confirmed this is their deployment script, ' +
      'benign true positive". Today that build server is making an outbound request to a domain ' +
      'registered eleven days ago, at a near-exact sixty second interval. The sysadmin who gave ' +
      'that confirmation left the company three weeks ago.',
    ask:
      'Write how you handle this. Include what you do about the original closure, and what you ' +
      'would say to your manager about it.',
    modelAnswer:
      'Work the live thing first. The archaeology matters and it will matter more later, but ' +
      'right now there is a host beaconing and that is the emergency.\n\n' +
      'A near-exact sixty second interval is not how software behaves when it is doing its job. ' +
      'Real polling jitters. Pull the process that owns the connection, map it to its parent, and ' +
      'get the full request: host header, URI, user agent, certificate, response size. The ' +
      'regularity itself is evidence and you should say so.\n\n' +
      'Then ask the question that makes a build server different from any other host. A build ' +
      'server holds signing material, deploy credentials, and write access to artifacts that other ' +
      'machines trust and execute. The incident is not "a server is beaconing", it is "the machine ' +
      'that signs our software is beaconing". That changes the severity, the people you wake, and ' +
      'how fast you move.\n\n' +
      'Containment on a build server stops releases, so this is a conversation, not a unilateral ' +
      'action. Have the recommendation ready and the cost understood. Isolating it from everything ' +
      'except your analysis path, while keeping it running, is usually the opening position.\n\n' +
      'Now the closure. Re-open it. A confirmation from a person, with no artifact attached, was ' +
      'never evidence, and it is certainly not evidence now that the person cannot be asked. Go ' +
      'and find the script they referred to, in version control, with a commit date. Either it ' +
      'exists and matches what fired, or the closure was a guess that happened to end the ticket.\n\n' +
      'Treat the five weeks as a scoping window, not as a fact. Ask what that host reached in that ' +
      'period, what artifacts it produced, and what consumed them.\n\n' +
      'To your manager: lead with the live incident and the build server exposure. Then name the ' +
      'process finding without naming the analyst as the problem. The failure is that a closure ' +
      'could rest on a verbal confirmation with nothing attached and nothing to re-check. The fix ' +
      'is that closures of that class require a linked artifact, and that anything touching build ' +
      'or signing infrastructure does not get closed by a single analyst at all.',
    points: [
      {
        label: 'Works the beacon before the history',
        detail:
          'There is a live finding and a stale one. Starting with the five week old ticket is the ' +
          'wrong order even though it is the more interesting story.',
      },
      {
        label: 'Reads the fixed interval as the indicator',
        detail:
          'Legitimate polling jitters. Near-exact regularity is machine-to-machine on a schedule, ' +
          'and saying so shows they know what normal looks like.',
      },
      {
        label: 'Recognises what a build server actually is',
        detail:
          'Signing material, deploy credentials, artifacts that other machines execute without ' +
          'question. This is a supply chain incident, not a server incident.',
      },
      {
        label: 'Re-opens the closure on its merits',
        detail:
          'A verbal confirmation with no artifact was never evidence. The departure makes it ' +
          'unverifiable, but it was already unverifiable.',
      },
      {
        label: 'Goes looking for the script in version control',
        detail:
          'Either the deployment script exists with a commit history that matches, or it does not. ' +
          'That is a question with an answer, and nobody asked it the first time.',
      },
      {
        label: 'Treats five weeks as a scoping window',
        detail:
          'What did the host reach, what did it build, and what ran those artifacts. The dwell ' +
          'time sets the blast radius.',
      },
      {
        label: 'Reports the process failure without blaming the analyst',
        detail:
          'The finding is that a closure could rest on nothing checkable. A candidate who makes ' +
          'this about one person’s mistake has misread what a manager needs to hear.',
      },
      {
        label: 'Prices the containment before recommending it',
        detail:
          'Isolating a build server stops releases. Knowing that, and saying it, is what separates ' +
          'a recommendation from a demand.',
      },
    ],
  },

  {
    slug: 'client-disputes-xss',
    role: 'pentest',
    level: 'fresher',
    title: 'The client says your finding is not real',
    minutes: 20,
    isFree: true,
    situation:
      'You reported a stored cross-site scripting vulnerability in an internal admin panel. The ' +
      'client has pushed back in writing: the panel is only reachable over the corporate VPN, only ' +
      'twelve people hold accounts, and all twelve are long-serving trusted staff. They would like ' +
      'it downgraded to informational so it does not appear in the executive summary.',
    ask: 'Write your reply to the client.',
    modelAnswer:
      'Start by conceding what is true, because something in their objection is. A VPN and twelve ' +
      'accounts genuinely do reduce how likely this is to be exploited. If your reply pretends ' +
      'otherwise you have lost the argument and the relationship in one message.\n\n' +
      'Then separate the two things they have merged. Likelihood is how easy it is to reach. Impact ' +
      'is what happens when someone does. Their controls act on the first and do nothing at all to ' +
      'the second. Stored XSS in an admin panel means an attacker executes code in an ' +
      'administrator’s browser session, with everything that session can do. Whatever the panel ' +
      'administers, that is the impact, and it does not change because the door is further away.\n\n' +
      'Give them the path that survives their objection, specifically. One phished VPN credential. ' +
      'One of the twelve with a compromised workstation. One contractor laptop. None of these ' +
      'require an untrusted insider, which is the thing they are really telling you does not exist, ' +
      'and they are probably right about that.\n\n' +
      'Say what you will change honestly. If your methodology rates on likelihood as well as impact, ' +
      'then reduced reachability lowers the rating, and you should lower it and show the working. ' +
      'If it moves from high to medium, say that. What you cannot do is move it to informational, ' +
      'because informational means there is nothing to fix, and there is something to fix.\n\n' +
      'Then make it easy to close. Output encoding at the point of render, a content security ' +
      'policy that refuses inline script. Usually a small change in one component. A lot of ' +
      'pushback on findings is really a dispute about cost, and quoting the actual fix dissolves it.\n\n' +
      'Finally, record their position in the report next to the finding. If they accept the risk ' +
      'that is entirely their right, and a documented acceptance is a better outcome for everyone ' +
      'than a deleted finding.',
    points: [
      {
        label: 'Concedes the true part of the objection first',
        detail:
          'The VPN and twelve accounts really do reduce likelihood. A reply that starts by ' +
          'disagreeing with everything gets read as defensive and ignored.',
      },
      {
        label: 'Separates likelihood from impact explicitly',
        detail:
          'Their controls act on reachability. The consequence of exploitation is untouched. This ' +
          'distinction is the entire answer.',
      },
      {
        label: 'Explains what stored XSS in an admin panel actually means',
        detail:
          'Code executing in an administrator session, with that session’s authority. Naming ' +
          'the consequence beats naming the vulnerability class.',
      },
      {
        label: 'Gives an attack path that does not need a malicious insider',
        detail:
          'A phished VPN credential or a compromised workstation. The client is telling you their ' +
          'staff are trustworthy, and arguing with that is both rude and unnecessary.',
      },
      {
        label: 'Adjusts the rating honestly rather than holding the line',
        detail:
          'If the methodology scores likelihood, lower it and show the working. Refusing to move at ' +
          'all is as unprofessional as caving.',
      },
      {
        label: 'Refuses informational, and says why that word is the problem',
        detail:
          'Informational means nothing to fix. There is something to fix. That is the one point not ' +
          'to concede.',
      },
      {
        label: 'Quotes the actual fix',
        detail:
          'Output encoding and a CSP without inline script. Most pushback on findings is a dispute ' +
          'about effort, and the effort here is small.',
      },
      {
        label: 'Offers documented risk acceptance instead of deletion',
        detail:
          'Their risk to accept. A recorded acceptance protects the client, the tester and the next ' +
          'person to read the report.',
      },
    ],
  },

  {
    slug: 'da-on-day-one',
    role: 'pentest',
    level: 'mid',
    title: 'Domain admin, two hours in',
    minutes: 25,
    situation:
      'Two hours into a two week internal engagement you hold domain admin, reached through an ' +
      'unconstrained delegation path. Scope is "internal network, no social engineering". The ' +
      'client is expecting two weeks of work and a report at the end of it.',
    ask:
      'Write what you do next, and what you tell the client today rather than in the report.',
    modelAnswer:
      'Tell them today. A path to domain admin in two hours is not a report finding, it is a phone ' +
      'call. If that path exists for you it exists for anything already inside, and the client ' +
      'needs the chance to act on it now rather than in a fortnight.\n\n' +
      'Before you do anything else with the access, stop and work out what it reaches. Domain admin ' +
      'in most estates means backups, virtualisation, and every system that trusts the domain. The ' +
      'risk at this moment is not that you fail to find more, it is that you break something ' +
      'expensive and the engagement becomes about that instead.\n\n' +
      'Then get authorisation in writing before you use it further. Your scope said internal ' +
      'network. It did not say "and once you are domain admin, help yourself". Confirm what you ' +
      'may touch, what is off limits, and who you call if something goes wrong. Verbal approval on ' +
      'a call is fine as long as it is followed by an email that exists afterwards.\n\n' +
      'Now reframe the engagement. The remaining time just became more valuable, not less. You ' +
      'have thirteen days to answer questions the client cannot answer themselves: how far does ' +
      'this reach, what else is broken independently of it, and above all, can they see any of it. ' +
      'Nothing you do in the next two weeks is worth more than finding out whether a single alert ' +
      'fired while you took the domain in two hours.\n\n' +
      'Document the path to the standard where someone else can reproduce it and someone else can ' +
      'fix it. Unconstrained delegation specifically, on which object, reachable from where, and ' +
      'what the remediation actually is, because the fix is not obvious and clients get it wrong.\n\n' +
      'Resist collecting trophies. Domain admin makes it trivially easy to go and read the things ' +
      'you are curious about, and none of that is in scope. The authorisation you just got is ' +
      'narrower than your access, and that gap is where testers end careers.',
    points: [
      {
        label: 'Tells the client the same day',
        detail:
          'A two hour path to domain admin does not wait for a report. Sitting on it to make the ' +
          'report impressive is the wrong instinct and clients notice.',
      },
      {
        label: 'Assesses blast radius before using the access further',
        detail:
          'Backups, virtualisation, everything that trusts the domain. The danger now is breaking ' +
          'something, not missing something.',
      },
      {
        label: 'Gets written authorisation before going further',
        detail:
          'Access is not permission. The original scope did not contemplate this, so it has to be ' +
          'extended deliberately rather than assumed.',
      },
      {
        label: 'Treats the remaining time as more valuable, not spare',
        detail:
          'Thirteen days to answer how far it reaches and what else is independently broken. A ' +
          'candidate who says "the engagement is basically done" has misunderstood what was bought.',
      },
      {
        label: 'Makes detection the headline question',
        detail:
          'Did anything fire while they took the domain in two hours? That answer is worth more to ' +
          'the client than the next five findings.',
      },
      {
        label: 'Documents the path to reproduce and to fix',
        detail:
          'Which object, which delegation, reachable from where. Unconstrained delegation ' +
          'remediation is commonly botched, so vague wording costs the client the fix.',
      },
      {
        label: 'Stays inside authorisation despite having the access',
        detail:
          'Domain admin makes everything reachable. Almost none of it is permitted. Naming that gap ' +
          'unprompted is what a panel is listening for.',
      },
    ],
  },

  {
    slug: 'rubber-stamped-review',
    role: 'grc',
    level: 'fresher',
    title: 'The access review nobody can finish',
    minutes: 20,
    situation:
      'It is the quarterly user access review. The finance application owner has 340 users to ' +
      'certify. They have now returned the same spreadsheet three times with every line marked ' +
      '"retain", including fourteen accounts belonging to people who left the company. The ' +
      'external audit fieldwork starts in two weeks.',
    ask:
      'Write how you handle this, including what you tell the auditor.',
    modelAnswer:
      'The fourteen leavers are the urgent problem. The rubber stamp is the actual finding. Deal ' +
      'with them in that order and do not confuse them.\n\n' +
      'Disable the leaver accounts now. Not at the end of the review, not once the owner responds. ' +
      'An account belonging to someone who has left is live risk and it does not need a quarterly ' +
      'process to justify closing it.\n\n' +
      'Then stop treating the owner as the problem. Three hundred and forty rows, no context, no ' +
      'last login, no indication of which entitlements are dangerous, is a task that is ' +
      'structurally impossible to do honestly in the time anyone has for it. You designed a control ' +
      'that can only be passed by lying, and they passed it.\n\n' +
      'Make the review reviewable. Pre-filter by last login so dormant accounts surface on their ' +
      'own. Flag the privileged entitlements separately, because twelve rows that grant payment ' +
      'approval deserve more attention than three hundred that grant read access. Break it up by ' +
      'team so each line goes to someone who actually knows the person. Pre-tick nothing.\n\n' +
      'Reconcile against HR leaver data as a control in its own right, not as a courtesy to the ' +
      'owner. An access review that depends entirely on human recall will always miss leavers, ' +
      'because remembering absences is the thing people are worst at.\n\n' +
      'Tell the auditor before they find it. Say that the control operated ineffectively this ' +
      'period, that you identified it, that fourteen leaver accounts were remediated on a stated ' +
      'date, and what you are changing. A self-identified control failure with evidence of ' +
      'remediation is an ordinary audit conversation. The same failure discovered by the auditor ' +
      'in a sample is a finding with your credibility attached to it.\n\n' +
      'The durable fix is joiner-mover-leaver automation so that leaving triggers deprovisioning ' +
      'without anyone remembering. Say that, and say roughly what it costs, because the reason it ' +
      'has not been done is always that nobody put a number on it.',
    points: [
      {
        label: 'Separates the urgent risk from the real finding',
        detail:
          'Fourteen live leaver accounts need closing today. The rubber stamping is the control ' +
          'failure. Both matter and they are not the same problem.',
      },
      {
        label: 'Disables the leaver accounts immediately',
        detail:
          'Outside the review process, not at the end of it. Waiting for a quarterly workflow to ' +
          'close a departed employee’s access is the failure repeating itself.',
      },
      {
        label: 'Treats the control design as the cause',
        detail:
          '340 context-free rows can only be completed by ticking everything. The owner behaved ' +
          'exactly as the design invited. Blaming them fixes nothing.',
      },
      {
        label: 'Makes the review possible to do honestly',
        detail:
          'Filter by last login, flag privileged separately, split by team, pre-tick nothing. ' +
          'Concrete redesign, not "provide training".',
      },
      {
        label: 'Reconciles against HR data as a control',
        detail:
          'Human recall will always miss leavers. A system-to-system reconciliation is the only ' +
          'version of this control that works.',
      },
      {
        label: 'Discloses to the auditor rather than waiting to be caught',
        detail:
          'Self-identified with evidence of remediation is routine. Found in their sample is a ' +
          'finding plus a credibility problem.',
      },
      {
        label: 'Names the structural fix with a cost attached',
        detail:
          'Joiner-mover-leaver automation. The reason it has not happened is that nobody priced it, ' +
          'so pricing it is part of the recommendation.',
      },
    ],
  },

  {
    slug: 'vendor-refuses-questionnaire',
    role: 'grc',
    level: 'mid',
    title: 'The vendor who will not fill in your questionnaire',
    minutes: 25,
    situation:
      'A SaaS vendor that will process customer personal data has declined your security ' +
      'questionnaire. They will provide their SOC 2 Type II report and a signed summary letter, ' +
      'and nothing else. Procurement wants to sign this week. The business owner says this vendor ' +
      'is the only one that does what the team needs.',
    ask: 'Write your assessment and your recommendation.',
    modelAnswer:
      'Do not reject this reflexively. A SOC 2 Type II is independently tested evidence over a ' +
      'period of time. Your questionnaire is a vendor describing themselves in their own words. ' +
      'In evidentiary terms the thing they offered is stronger than the thing you asked for, and a ' +
      'candidate who treats the refusal as obstruction has it backwards.\n\n' +
      'Read the report properly, which most people do not. Check the period it covers and whether ' +
      'it has lapsed. Check which trust services criteria are in scope, because security alone does ' +
      'not tell you anything about availability or confidentiality. Check the system description ' +
      'and confirm the service you are buying is actually the system that was audited, which is ' +
      'frequently is not. Check the subservice organisations and whether they are carved out, ' +
      'because a carve-out means a chunk of the stack was never examined.\n\n' +
      'Then go to the exceptions and read them slowly. The exceptions are the report. A clean ' +
      'opinion with three exceptions around access revocation tells you more than the entire ' +
      'control narrative, and it is the part people skip.\n\n' +
      'Now do the work that the report cannot do for you: map their controls to your actual ' +
      'requirements rather than to your form. The questionnaire was only ever a vehicle for those ' +
      'requirements, and if the report answers one you can stop asking.\n\n' +
      'Whatever it does not answer goes into the contract instead of into another spreadsheet. ' +
      'Breach notification within a defined number of hours. Data location and whether it can ' +
      'change. Deletion on exit with evidence. Notice before a new subprocessor. Right to audit or ' +
      'to receive the next report. These are enforceable in a way a questionnaire answer never was.\n\n' +
      'Recommend a conditional yes with those terms, a defined review date, and the residual risk ' +
      'written down and formally accepted by the business owner who told you there is no ' +
      'alternative. Blocking a sole-source vendor on a process objection is how security teams get ' +
      'routed around, and being routed around is worse than the risk you were trying to manage.',
    points: [
      {
        label: 'Recognises the SOC 2 as stronger evidence, not weaker',
        detail:
          'Independently tested over a period versus vendor self-description. Treating the refusal ' +
          'as obstruction is the error this scenario is built to catch.',
      },
      {
        label: 'Checks the period and whether it has lapsed',
        detail:
          'A report covering a window that ended fourteen months ago says very little about today.',
      },
      {
        label: 'Checks scope and the system description',
        detail:
          'Which criteria were covered, and whether the audited system is the product being bought. ' +
          'They are often not the same thing.',
      },
      {
        label: 'Looks for carved-out subservice organisations',
        detail:
          'A carve-out means part of the stack was never examined. What is excluded is the ' +
          'interesting part of any assurance report.',
      },
      {
        label: 'Reads the exceptions as the substance',
        detail:
          'The exceptions are where the report tells the truth. Skipping to the opinion page is the ' +
          'most common way this document gets misread.',
      },
      {
        label: 'Maps controls to requirements, not to the form',
        detail:
          'The questionnaire was a vehicle for requirements. Anything the report answers does not ' +
          'need asking again.',
      },
      {
        label: 'Moves the gaps into the contract',
        detail:
          'Breach notification time, data location, deletion on exit, subprocessor notice, right to ' +
          'the next report. Enforceable, unlike a questionnaire answer.',
      },
      {
        label: 'Recommends a conditional yes with accepted residual risk',
        detail:
          'A sole-source vendor blocked on process gets the security team routed around. Conditions ' +
          'plus a named risk owner is the outcome that actually holds.',
      },
    ],
  },

  {
    slug: 'public-bucket-no-logs',
    role: 'cloud',
    level: 'mid',
    title: 'Public for nine months, with no access logs',
    minutes: 25,
    situation:
      'An engineer reports that a storage bucket holding customer-uploaded documents has carried a ' +
      'public read policy since a platform migration nine months ago. Access logging was never ' +
      'enabled on the bucket. The business is asking you whether customer data was taken.',
    ask:
      'Write how you establish what actually happened, and what you advise the business.',
    modelAnswer:
      'Close the exposure first, but close it carefully. Change the policy, and before you do, ' +
      'check whether anything legitimate is currently reading from it anonymously, because nine ' +
      'months is long enough for something to have quietly come to depend on it. Breaking ' +
      'production while fixing an exposure turns one incident into two.\n\n' +
      'Then say the uncomfortable thing plainly, early, and in writing: with no access logs you ' +
      'cannot prove that nothing was taken. You can gather evidence that makes access more or less ' +
      'likely. You cannot produce the negative. Every hour you spend letting the business believe ' +
      'otherwise is an hour they are not spending on the decision they actually have to make.\n\n' +
      'Go after secondary evidence. Control plane logs will tell you when and by whom the policy ' +
      'was set, which is a different question from who read it, and still worth knowing. If there ' +
      'is a CDN or a load balancer in front, its logs may cover some of the window. Billing data ' +
      'is underrated here: a sustained change in egress is visible long after request logs are ' +
      'gone, and an absence of unusual egress is weak but real evidence.\n\n' +
      'Establish what was actually in the bucket and, separately, whether the names were ' +
      'discoverable. A public bucket that also permitted listing is a fundamentally different ' +
      'incident from one where an attacker would have had to guess a document name. If objects are ' +
      'named with high-entropy identifiers and listing was denied, your exposure is far narrower, ' +
      'and that distinction should be in the first paragraph of what you write.\n\n' +
      'The migration is the root cause, and the question is not how the policy got there but ' +
      'whether anything else from that migration carries the same pattern. Go and check the rest.\n\n' +
      'Advise the business on facts and uncertainty, not on a verdict. Whether this is a notifiable ' +
      'breach is a legal determination under whichever regimes apply, and your job is to give ' +
      'counsel the exposure window, the data categories, the discoverability finding and the ' +
      'honest limits of the evidence. Bring legal in early rather than after you have formed a view.\n\n' +
      'Enable access logging now even though it is nine months late, and say out loud why: so the ' +
      'next version of this conversation has an answer.',
    points: [
      {
        label: 'Closes the exposure without breaking production',
        detail:
          'Nine months is long enough for something legitimate to depend on anonymous read. Check ' +
          'before flipping it.',
      },
      {
        label: 'States plainly that absence of logs means no proof of non-access',
        detail:
          'The honest answer is that it cannot be proven. Letting the business believe otherwise is ' +
          'the real failure available in this scenario.',
      },
      {
        label: 'Goes after secondary evidence systematically',
        detail:
          'Control plane logs, CDN or load balancer logs, egress billing patterns. Weak evidence ' +
          'used carefully still narrows the picture.',
      },
      {
        label: 'Separates listing from reading',
        detail:
          'Public read with listing enabled is enumerable. Without listing, and with high-entropy ' +
          'object names, exposure is far narrower. This distinction drives everything after it.',
      },
      {
        label: 'Establishes the data categories in the bucket',
        detail:
          'What was in it determines who has to be told. Customer-uploaded documents could be ' +
          'anything, and "anything" is not an answer anyone can act on.',
      },
      {
        label: 'Checks whether the migration repeated the pattern elsewhere',
        detail:
          'The root cause is the migration, not the bucket. One instance found by accident usually ' +
          'means others not yet found.',
      },
      {
        label: 'Leaves the breach determination to legal, with facts attached',
        detail:
          'Notifiability is a legal call. Supplying the window, the categories, the discoverability ' +
          'finding and the evidential limits is the security contribution.',
      },
      {
        label: 'Enables logging now and says why',
        detail:
          'Late is better than never, and naming the reason makes it a control decision rather than ' +
          'an embarrassed reflex.',
      },
    ],
  },

  {
    slug: 'temp-any-any-rule',
    role: 'network',
    level: 'fresher',
    title: 'The temporary rule that is four years old',
    minutes: 20,
    situation:
      'During a firewall rule review you find a rule permitting any protocol on any port from the ' +
      'office VLAN to the server VLAN. It was created four years ago. The comment field reads ' +
      '"temp - printer issue - remove after testing". The network lead agrees it looks wrong but ' +
      'is nervous about removing it, because nobody knows what has grown to depend on it.',
    ask: 'Write your plan to remove it safely.',
    modelAnswer:
      'Do not delete it. Everyone can see it should not exist, and that is not the same as knowing ' +
      'what is currently flowing through it. Four years is long enough for real production traffic ' +
      'to have settled into a hole nobody meant to leave open, and deleting it blind is how a ' +
      'security improvement becomes an outage with your name on it.\n\n' +
      'Measure first. Enable logging on that rule and leave it alone. You are not trying to be ' +
      'quick here, you are trying to be right, and the output of this step is a list of actual ' +
      'source and destination pairs with ports, rather than a list of what people believe they ' +
      'need.\n\n' +
      'Watch for a period that is genuinely representative. A week is almost never enough. Month ' +
      'end has traffic that no other week has, and so do payroll runs, backup windows, patch ' +
      'cycles and quarterly reporting. If you narrow this rule based on a quiet fortnight you will ' +
      'break something on the last working day of the month, which is the worst possible day for ' +
      'it to break.\n\n' +
      'Build the replacement from what you observed, not from what you were told. Ask the owners ' +
      'too, because observation will not tell you about the annual process that has not run yet, ' +
      'but treat what they say as an addition to the measured list rather than a substitute for it.\n\n' +
      'Then narrow in stages. Replace any-any with the observed set, keep logging on, watch, and ' +
      'then tighten again. Two or three deliberate steps are much safer than one confident one, ' +
      'and each step is individually easy to reverse.\n\n' +
      'Write the rollback down so that someone who is not you can execute it at two in the morning ' +
      'without making a judgement call. A rollback that only works if the person who designed the ' +
      'change is awake is not a rollback.\n\n' +
      'The comment is the lesson worth raising. Someone wrote "remove after testing" in good faith ' +
      'and there was no mechanism to make that happen. Temporary rules need an owner and an expiry ' +
      'date enforced by the process, because a comment field has never once removed a rule.',
    points: [
      {
        label: 'Refuses to delete it blind',
        detail:
          'Obviously wrong and safe to remove are different claims. Four years of drift means ' +
          'something real is probably using it.',
      },
      {
        label: 'Turns on logging and measures before changing anything',
        detail:
          'The output needed is observed source, destination and port pairs, not a list of what ' +
          'people think they need.',
      },
      {
        label: 'Picks a representative window, not a convenient one',
        detail:
          'Month end, payroll, backups, patch windows, quarterly reporting. A quiet fortnight ' +
          'produces a rule that breaks on the worst day of the month.',
      },
      {
        label: 'Builds the replacement from observed flows',
        detail:
          'Asking owners is a supplement for the annual job that has not run yet, not a substitute ' +
          'for measurement.',
      },
      {
        label: 'Narrows in stages with logging left on',
        detail:
          'Two or three deliberate steps, each individually reversible, beats one confident change.',
      },
      {
        label: 'Writes a rollback someone else can run at 2am',
        detail:
          'A rollback that needs its author awake and thinking is not a rollback.',
      },
      {
        label: 'Raises expiry and ownership as the real fix',
        detail:
          'The comment field was written in good faith and nothing acted on it. Temporary rules ' +
          'need enforced expiry, because comments have never removed a rule.',
      },
    ],
  },
];
