CREATE TABLE `commanders` (
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	`displayName` text NOT NULL,
	`avatar` integer DEFAULT 0 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`matches` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commanders_token_hash` ON `commanders` (`tokenHash`);--> statement-breakpoint
CREATE TABLE `online_results` (
	`matchId` text NOT NULL,
	`commanderId` text NOT NULL,
	`won` integer NOT NULL,
	`completed` integer NOT NULL,
	PRIMARY KEY(`matchId`, `commanderId`),
	FOREIGN KEY (`commanderId`) REFERENCES `commanders`(`id`) ON UPDATE no action ON DELETE no action
);
