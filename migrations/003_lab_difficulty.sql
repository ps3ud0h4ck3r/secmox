-- Labs get a difficulty axis, independent of level (fresher/mid). A fresher
-- lab can be medium; a mid lab can be hard. 1 easy, 2 medium, 3 hard.
-- One-time migration for databases that already hold labs. New databases get
-- the column from schema.sql and the values from seed.sql.
ALTER TABLE labs ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 1;

UPDATE labs SET difficulty = 1 WHERE id = 'lab_grc_access-review-extract';
UPDATE labs SET difficulty = 1 WHERE id = 'lab_network_webshell-in-access-log';
UPDATE labs SET difficulty = 1 WHERE id = 'lab_soc_ssh-brute-to-persistence';
UPDATE labs SET difficulty = 2 WHERE id = 'lab_pentest_nmap-what-first';
UPDATE labs SET difficulty = 2 WHERE id = 'lab_soc_phish-header-read';
UPDATE labs SET difficulty = 2 WHERE id = 'lab_soc_alert-queue-triage';
UPDATE labs SET difficulty = 2 WHERE id = 'lab_cloud_leaked-key-in-the-trail';
UPDATE labs SET difficulty = 3 WHERE id = 'lab_network_dns-txt-exfil';
UPDATE labs SET difficulty = 3 WHERE id = 'lab_pentest_idor-and-mass-assignment';
UPDATE labs SET difficulty = 3 WHERE id = 'lab_soc_psexec-lateral';
