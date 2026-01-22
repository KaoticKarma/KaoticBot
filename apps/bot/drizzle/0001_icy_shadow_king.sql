CREATE TABLE `discord_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`webhook_url` text NOT NULL,
	`channel_name` text DEFAULT 'stream-announcements',
	`ping_everyone` integer DEFAULT true,
	`custom_message` text DEFAULT 'Come hang out! 🎮',
	`go_live_enabled` integer DEFAULT true,
	`offline_enabled` integer DEFAULT true,
	`embed_color` text DEFAULT '#53fc18',
	`offline_color` text DEFAULT '#ff6b6b',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `stream_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stream_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`title` text,
	`category` text,
	`thumbnail_url` text,
	`screenshot_path` text,
	`peak_viewers` integer DEFAULT 0,
	`total_messages` integer DEFAULT 0,
	`unique_chatters` integer DEFAULT 0,
	`new_followers` integer DEFAULT 0,
	`new_subs` integer DEFAULT 0,
	`gifted_subs` integer DEFAULT 0,
	`discord_message_id` text,
	`discord_channel_id` text,
	`vod_url` text
);
