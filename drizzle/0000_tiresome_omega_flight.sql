CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`hostHash` text NOT NULL,
	`guestHash` text,
	`hostColor` integer NOT NULL,
	`level` integer NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
