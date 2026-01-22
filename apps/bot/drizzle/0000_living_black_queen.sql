CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`min_amount` integer DEFAULT 1 NOT NULL,
	`max_amount` integer,
	`message` text NOT NULL,
	`sound` text,
	`image_url` text,
	`video_url` text,
	`duration` integer DEFAULT 5000 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`response` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`cooldown` integer DEFAULT 5 NOT NULL,
	`user_level` text DEFAULT 'everyone' NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commands_name_unique` ON `commands` (`name`);--> statement-breakpoint
CREATE TABLE `cooldowns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`command_name` text NOT NULL,
	`used_by` integer NOT NULL,
	`used_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `counters_name_unique` ON `counters` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stream_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stream_id` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer,
	`peak_viewers` integer DEFAULT 0 NOT NULL,
	`total_messages` integer DEFAULT 0 NOT NULL,
	`unique_chatters` integer DEFAULT 0 NOT NULL,
	`new_followers` integer DEFAULT 0 NOT NULL,
	`new_subscribers` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`message` text NOT NULL,
	`interval` integer DEFAULT 300 NOT NULL,
	`min_chat_lines` integer DEFAULT 5 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_triggered` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timers_name_unique` ON `timers` (`name`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` integer NOT NULL,
	`scope` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`watch_time` integer DEFAULT 0 NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`is_follower` integer DEFAULT false NOT NULL,
	`is_subscriber` integer DEFAULT false NOT NULL,
	`followed_at` integer,
	`subscribed_at` integer
);
