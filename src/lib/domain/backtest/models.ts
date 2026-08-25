import type { SetupReason } from '../scoring/index.js';
import type { SMCStrategyConfig } from '../strategy/index.js';

export interface BacktestInput {
	symbol: string;
	startDate: number;
	endDate: number;
	config: SMCStrategyConfig;
}

export interface BacktestTrade {
	id: string;
	setupId: string;
	direction: 'LONG' | 'SHORT';
	entry: number;
	stopLoss: number;
	takeProfit: number;
	exitPrice: number;
	result: 'WIN' | 'LOSS';
	rMultiple: number;
	entryTimestamp: number;
	exitTimestamp: number;
	setupScore: number;
	setupReasons: SetupReason[];
	exitReason: 'TAKE_PROFIT' | 'STOP_LOSS';
	intrabarAmbiguous: boolean;
	feesPaid: number;
	slippagePaid: number;
}

export interface BacktestMetrics {
	totalTrades: number;
	wins: number;
	losses: number;
	winRate: number;
	profitFactor: number | null;
	expectancyR: number;
	averageR: number;
	totalR: number;
	maxDrawdownR: number;
	maxConsecutiveWins: number;
	maxConsecutiveLosses: number;
	averageRiskReward: number;
	averageTradeDurationMs: number;
}
