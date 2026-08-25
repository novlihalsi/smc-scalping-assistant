CREATE TABLE `backtest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy_config_id` text NOT NULL,
	`symbol` text NOT NULL,
	`start_timestamp` integer NOT NULL,
	`end_timestamp` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`config_hash` text NOT NULL,
	`validation_verdict` text NOT NULL,
	`trade_count` integer NOT NULL,
	`win_rate` real NOT NULL,
	`profit_factor` real,
	`expectancy_r` real NOT NULL,
	`total_r` real NOT NULL,
	`max_drawdown_r` real NOT NULL,
	`data_json` text NOT NULL,
	`metrics_json` text NOT NULL,
	`validation_json` text NOT NULL,
	FOREIGN KEY (`strategy_config_id`) REFERENCES `strategy_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `backtest_runs_completed_at_idx` ON `backtest_runs` (`completed_at`);--> statement-breakpoint
CREATE INDEX `backtest_runs_symbol_idx` ON `backtest_runs` (`symbol`);--> statement-breakpoint
CREATE TABLE `backtest_trades` (
	`journal_id` text PRIMARY KEY NOT NULL,
	`domain_id` text NOT NULL,
	`backtest_run_id` text NOT NULL,
	`setup_id` text NOT NULL,
	`direction` text NOT NULL,
	`result` text NOT NULL,
	`r_multiple` real NOT NULL,
	`setup_score` integer NOT NULL,
	`entry_timestamp` integer NOT NULL,
	`exit_timestamp` integer NOT NULL,
	`payload_json` text NOT NULL,
	FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backtest_trades_exit_timestamp_idx` ON `backtest_trades` (`exit_timestamp`);--> statement-breakpoint
CREATE INDEX `backtest_trades_direction_idx` ON `backtest_trades` (`direction`);--> statement-breakpoint
CREATE INDEX `backtest_trades_result_idx` ON `backtest_trades` (`result`);--> statement-breakpoint
CREATE INDEX `backtest_trades_run_idx` ON `backtest_trades` (`backtest_run_id`);--> statement-breakpoint
CREATE TABLE `setup_journal` (
	`journal_id` text PRIMARY KEY NOT NULL,
	`domain_id` text NOT NULL,
	`source` text NOT NULL,
	`backtest_run_id` text,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`classification` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`invalidation_reason` text,
	`recorded_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `setup_journal_updated_at_idx` ON `setup_journal` (`updated_at`);--> statement-breakpoint
CREATE INDEX `setup_journal_source_idx` ON `setup_journal` (`source`);--> statement-breakpoint
CREATE INDEX `setup_journal_direction_idx` ON `setup_journal` (`direction`);--> statement-breakpoint
CREATE INDEX `setup_journal_status_idx` ON `setup_journal` (`status`);--> statement-breakpoint
CREATE INDEX `setup_journal_domain_id_idx` ON `setup_journal` (`domain_id`);--> statement-breakpoint
CREATE TABLE `strategy_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`strategy` text NOT NULL,
	`strategy_config_json` text NOT NULL,
	`execution_config_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL
);
