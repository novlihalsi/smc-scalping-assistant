import {
	assertValidCandle,
	getCandleIdentity,
	getTimeframeDurationMilliseconds,
	type Candle
} from '../market/index.js';
import type { SetupReason } from '../scoring/index.js';
import type { SMCStrategyConfig, TradingSetup } from '../strategy/index.js';
import type { BacktestInput, BacktestTrade } from './models.js';

export interface BacktestExecutionConfig {
	feeBps: number;
	slippageBps: number;
}

export const DEFAULT_BACKTEST_EXECUTION_CONFIG: BacktestExecutionConfig = {
	feeBps: 0,
	slippageBps: 0
};

export interface ClosedCandlePipelineResult<State> {
	state: State;
	setups: readonly TradingSetup[];
}

export interface ClosedCandlePipeline<State> {
	createInitialState(): State;
	processClosedCandle(
		state: State,
		candle: Candle,
		config: SMCStrategyConfig
	): ClosedCandlePipelineResult<State>;
}

export interface PendingBacktestTrade {
	setupId: string;
	direction: TradingSetup['direction'];
	entry: number;
	stopLoss: number;
	takeProfit: number;
	queuedAt: number;
}

export interface OpenBacktestTrade extends PendingBacktestTrade {
	id: string;
	entryTimestamp: number;
	filledEntry: number;
}

export interface BacktestRunResult<State> {
	trades: BacktestTrade[];
	pendingTrades: PendingBacktestTrade[];
	openTrades: OpenBacktestTrade[];
	finalState: State;
	processedCandles: number;
	executionConfig: BacktestExecutionConfig;
}

export interface RunBacktestOptions<State> {
	input: BacktestInput;
	candles: readonly Candle[];
	pipeline: ClosedCandlePipeline<State>;
	executionConfig?: BacktestExecutionConfig;
}

export type BacktestErrorCode =
	| 'INVALID_INPUT'
	| 'INVALID_EXECUTION_CONFIG'
	| 'INVALID_CANDLE'
	| 'DUPLICATE_CANDLE'
	| 'INVALID_PIPELINE_RESULT'
	| 'FUTURE_SETUP'
	| 'INVALID_SETUP';

export class BacktestError extends Error {
	constructor(
		public readonly code: BacktestErrorCode,
		message: string
	) {
		super(message);
		this.name = 'BacktestError';
	}
}

interface PendingTradeState extends PendingBacktestTrade {
	setupScore: number;
	setupReasons: SetupReason[];
}

interface OpenTradeState extends OpenBacktestTrade {
	setupScore: number;
	setupReasons: SetupReason[];
	plannedRisk: number;
	entrySlippage: number;
	entryCandleAmbiguous: boolean;
}

interface ExitDecision {
	reason: BacktestTrade['exitReason'];
	rawExitPrice: number;
	intrabarAmbiguous: boolean;
}

const BASIS_POINTS_DIVISOR = 10_000;

export function runBacktest<State>(options: RunBacktestOptions<State>): BacktestRunResult<State> {
	validateBacktestInput(options.input);
	const executionConfig = options.executionConfig ?? DEFAULT_BACKTEST_EXECUTION_CONFIG;
	validateExecutionConfig(executionConfig);
	const candles = prepareCandles(options.candles, options.input);

	let domainState = options.pipeline.createInitialState();
	let processedCandles = 0;
	const pendingTrades = new Map<string, PendingTradeState>();
	const openTrades = new Map<string, OpenTradeState>();
	const closedSetupIds = new Set<string>();
	const trades: BacktestTrade[] = [];

	for (const candle of candles) {
		if (candle.timeframe === options.input.config.entryTimeframe) {
			processExistingOpenTrades(candle, openTrades, closedSetupIds, trades, executionConfig);
			processPendingTrades(
				candle,
				pendingTrades,
				openTrades,
				closedSetupIds,
				trades,
				executionConfig
			);
		}

		const processingResult = options.pipeline.processClosedCandle(
			domainState,
			{ ...candle },
			options.input.config
		);
		validatePipelineResult(processingResult);
		domainState = processingResult.state;
		processedCandles += 1;
		reconcileSetups(processingResult.setups, candle, pendingTrades, openTrades, closedSetupIds);
	}

	return {
		trades,
		pendingTrades: [...pendingTrades.values()].map(toPendingTrade),
		openTrades: [...openTrades.values()].map(toOpenTrade),
		finalState: domainState,
		processedCandles,
		executionConfig: { ...executionConfig }
	};
}

function prepareCandles(candles: readonly Candle[], input: BacktestInput): Candle[] {
	const seen = new Set<string>();
	const prepared: Candle[] = [];

	for (const candle of candles) {
		try {
			assertValidCandle(candle);
		} catch {
			throw new BacktestError('INVALID_CANDLE', 'Backtests require valid historical candles.');
		}
		if (!candle.closed) {
			throw new BacktestError('INVALID_CANDLE', 'Backtests may only replay closed candles.');
		}
		if (candle.symbol !== input.symbol) {
			throw new BacktestError(
				'INVALID_CANDLE',
				`Candle symbol ${candle.symbol} does not match backtest symbol ${input.symbol}.`
			);
		}
		const identity = getCandleIdentity(candle);
		if (seen.has(identity)) {
			throw new BacktestError('DUPLICATE_CANDLE', `Duplicate candle ${identity}.`);
		}
		seen.add(identity);

		if (candle.openTimestamp >= input.startDate && candle.openTimestamp <= input.endDate) {
			prepared.push({ ...candle });
		}
	}

	return prepared.sort(
		(left, right) =>
			left.closeTimestamp - right.closeTimestamp ||
			getTimeframeDurationMilliseconds(right.timeframe) -
				getTimeframeDurationMilliseconds(left.timeframe) ||
			left.openTimestamp - right.openTimestamp ||
			left.timeframe.localeCompare(right.timeframe)
	);
}

function processExistingOpenTrades(
	candle: Candle,
	openTrades: Map<string, OpenTradeState>,
	closedSetupIds: Set<string>,
	trades: BacktestTrade[],
	config: BacktestExecutionConfig
): void {
	for (const [setupId, trade] of openTrades) {
		const decision = decideOpenTradeExit(trade, candle);
		if (!decision) continue;
		trades.push(closeTrade(trade, candle, decision, config));
		openTrades.delete(setupId);
		closedSetupIds.add(setupId);
	}
}

function processPendingTrades(
	candle: Candle,
	pendingTrades: Map<string, PendingTradeState>,
	openTrades: Map<string, OpenTradeState>,
	closedSetupIds: Set<string>,
	trades: BacktestTrade[],
	config: BacktestExecutionConfig
): void {
	for (const [setupId, pending] of pendingTrades) {
		// A setup confirmed at this timestamp was not actionable during another candle
		// that closed at the same instant.
		if (pending.queuedAt >= candle.closeTimestamp) continue;
		if (!touchesPrice(candle, pending.entry)) continue;

		const filledEntry = applyEntrySlippage(pending.entry, pending.direction, config.slippageBps);
		const openTrade: OpenTradeState = {
			...pending,
			id: JSON.stringify(['BACKTEST_TRADE', setupId, candle.closeTimestamp]),
			entryTimestamp: candle.closeTimestamp,
			filledEntry,
			plannedRisk: Math.abs(pending.entry - pending.stopLoss),
			entrySlippage: Math.abs(filledEntry - pending.entry),
			entryCandleAmbiguous: false
		};
		pendingTrades.delete(setupId);

		const stopTouched = touchesStop(openTrade, candle);
		const targetTouched = touchesTarget(openTrade, candle);
		if (stopTouched) {
			const entryStopOrderingAmbiguous =
				(openTrade.direction === 'LONG' && candle.open < openTrade.entry) ||
				(openTrade.direction === 'SHORT' && candle.open > openTrade.entry);
			trades.push(
				closeTrade(
					openTrade,
					candle,
					{
						reason: 'STOP_LOSS',
						rawExitPrice: openTrade.stopLoss,
						intrabarAmbiguous: targetTouched || entryStopOrderingAmbiguous
					},
					config
				)
			);
			closedSetupIds.add(setupId);
			continue;
		}

		// A target touched on the entry candle may have occurred before the limit entry.
		// Keep the trade open rather than awarding an unprovable same-candle win.
		openTrade.entryCandleAmbiguous = targetTouched;
		openTrades.set(setupId, openTrade);
	}
}

function decideOpenTradeExit(trade: OpenTradeState, candle: Candle): ExitDecision | null {
	const stopTouched = touchesStop(trade, candle);
	const targetTouched = touchesTarget(trade, candle);

	if (stopTouched) {
		return {
			reason: 'STOP_LOSS',
			rawExitPrice: stopExitPrice(trade, candle),
			intrabarAmbiguous: targetTouched
		};
	}
	if (targetTouched) {
		return {
			reason: 'TAKE_PROFIT',
			rawExitPrice: trade.takeProfit,
			intrabarAmbiguous: false
		};
	}
	return null;
}

function closeTrade(
	trade: OpenTradeState,
	candle: Candle,
	decision: ExitDecision,
	config: BacktestExecutionConfig
): BacktestTrade {
	const exitPrice = applyExitSlippage(decision.rawExitPrice, trade.direction, config.slippageBps);
	const exitSlippage = Math.abs(exitPrice - decision.rawExitPrice);
	const feesPaid = (trade.filledEntry + exitPrice) * (config.feeBps / BASIS_POINTS_DIVISOR);
	const grossProfit =
		trade.direction === 'LONG' ? exitPrice - trade.filledEntry : trade.filledEntry - exitPrice;
	const rMultiple = (grossProfit - feesPaid) / trade.plannedRisk;

	return {
		id: trade.id,
		setupId: trade.setupId,
		direction: trade.direction,
		entry: trade.filledEntry,
		stopLoss: trade.stopLoss,
		takeProfit: trade.takeProfit,
		exitPrice,
		result: rMultiple > 0 ? 'WIN' : 'LOSS',
		rMultiple,
		entryTimestamp: trade.entryTimestamp,
		exitTimestamp: candle.closeTimestamp,
		setupScore: trade.setupScore,
		setupReasons: trade.setupReasons.map((reason) => ({ ...reason })),
		exitReason: decision.reason,
		intrabarAmbiguous: decision.intrabarAmbiguous || trade.entryCandleAmbiguous,
		feesPaid,
		slippagePaid: trade.entrySlippage + exitSlippage
	};
}

function reconcileSetups(
	setups: readonly TradingSetup[],
	candle: Candle,
	pendingTrades: Map<string, PendingTradeState>,
	openTrades: Map<string, OpenTradeState>,
	closedSetupIds: Set<string>
): void {
	const seenThisCandle = new Set<string>();
	for (const setup of setups) {
		validateSetup(setup, candle);
		if (seenThisCandle.has(setup.id)) {
			throw new BacktestError('INVALID_SETUP', `Pipeline emitted duplicate setup ${setup.id}.`);
		}
		seenThisCandle.add(setup.id);

		if (setup.status === 'INVALIDATED' || setup.status === 'TP' || setup.status === 'SL') {
			pendingTrades.delete(setup.id);
			continue;
		}
		if (setup.status !== 'VALID' && setup.status !== 'TRIGGERED' && setup.status !== 'FORMING') {
			continue;
		}
		if (setup.status === 'FORMING' || openTrades.has(setup.id) || closedSetupIds.has(setup.id)) {
			continue;
		}

		pendingTrades.set(setup.id, {
			setupId: setup.id,
			direction: setup.direction,
			entry: (setup.entryZone.min + setup.entryZone.max) / 2,
			stopLoss: setup.stopLoss,
			takeProfit: setup.takeProfit,
			queuedAt: candle.closeTimestamp,
			setupScore: setup.score,
			setupReasons: setup.reasons.map((reason) => ({ ...reason }))
		});
	}
}

function validateSetup(setup: TradingSetup, candle: Candle): void {
	if (setup.createdAt > candle.closeTimestamp || setup.updatedAt > candle.closeTimestamp) {
		throw new BacktestError(
			'FUTURE_SETUP',
			`Setup ${setup.id} contains information confirmed after the replay candle.`
		);
	}
	if (setup.symbol !== candle.symbol) {
		throw new BacktestError('INVALID_SETUP', `Setup ${setup.id} has a mismatched symbol.`);
	}
	const entry = (setup.entryZone.min + setup.entryZone.max) / 2;
	const validNumbers = [
		setup.createdAt,
		setup.updatedAt,
		setup.entryZone.min,
		setup.entryZone.max,
		setup.stopLoss,
		setup.takeProfit,
		setup.riskReward,
		setup.score
	].every(Number.isFinite);
	const validGeometry =
		Number.isSafeInteger(setup.createdAt) &&
		setup.createdAt >= 0 &&
		Number.isSafeInteger(setup.updatedAt) &&
		setup.updatedAt >= setup.createdAt &&
		setup.entryZone.min <= setup.entryZone.max &&
		(setup.direction === 'LONG'
			? setup.stopLoss < entry && setup.takeProfit > entry
			: setup.stopLoss > entry && setup.takeProfit < entry);
	if (!setup.id || !validNumbers || !validGeometry) {
		throw new BacktestError('INVALID_SETUP', `Setup ${setup.id} has invalid trade geometry.`);
	}
}

function validatePipelineResult<State>(
	result: ClosedCandlePipelineResult<State>
): asserts result is ClosedCandlePipelineResult<State> {
	if (!result || !Array.isArray(result.setups)) {
		throw new BacktestError(
			'INVALID_PIPELINE_RESULT',
			'The closed-candle pipeline must return state and a setups array.'
		);
	}
}

function validateBacktestInput(input: BacktestInput): void {
	if (
		!input.symbol ||
		!Number.isSafeInteger(input.startDate) ||
		input.startDate < 0 ||
		!Number.isSafeInteger(input.endDate) ||
		input.endDate < input.startDate
	) {
		throw new BacktestError('INVALID_INPUT', 'Backtest symbol and date range are invalid.');
	}
}

function validateExecutionConfig(config: BacktestExecutionConfig): void {
	if (
		!Number.isFinite(config.feeBps) ||
		config.feeBps < 0 ||
		config.feeBps >= BASIS_POINTS_DIVISOR ||
		!Number.isFinite(config.slippageBps) ||
		config.slippageBps < 0 ||
		config.slippageBps >= BASIS_POINTS_DIVISOR
	) {
		throw new BacktestError(
			'INVALID_EXECUTION_CONFIG',
			'Fee and slippage basis points must be finite values from 0 (inclusive) to 10000 (exclusive).'
		);
	}
}

function touchesPrice(candle: Candle, price: number): boolean {
	return candle.low <= price && candle.high >= price;
}

function touchesStop(trade: PendingBacktestTrade, candle: Candle): boolean {
	return trade.direction === 'LONG' ? candle.low <= trade.stopLoss : candle.high >= trade.stopLoss;
}

function touchesTarget(trade: PendingBacktestTrade, candle: Candle): boolean {
	return trade.direction === 'LONG'
		? candle.high >= trade.takeProfit
		: candle.low <= trade.takeProfit;
}

function stopExitPrice(trade: PendingBacktestTrade, candle: Candle): number {
	if (trade.direction === 'LONG' && candle.open < trade.stopLoss) return candle.open;
	if (trade.direction === 'SHORT' && candle.open > trade.stopLoss) return candle.open;
	return trade.stopLoss;
}

function applyEntrySlippage(
	price: number,
	direction: TradingSetup['direction'],
	slippageBps: number
): number {
	const factor = slippageBps / BASIS_POINTS_DIVISOR;
	return direction === 'LONG' ? price * (1 + factor) : price * (1 - factor);
}

function applyExitSlippage(
	price: number,
	direction: TradingSetup['direction'],
	slippageBps: number
): number {
	const factor = slippageBps / BASIS_POINTS_DIVISOR;
	return direction === 'LONG' ? price * (1 - factor) : price * (1 + factor);
}

function toPendingTrade(trade: PendingTradeState): PendingBacktestTrade {
	return {
		setupId: trade.setupId,
		direction: trade.direction,
		entry: trade.entry,
		stopLoss: trade.stopLoss,
		takeProfit: trade.takeProfit,
		queuedAt: trade.queuedAt
	};
}

function toOpenTrade(trade: OpenTradeState): OpenBacktestTrade {
	return {
		...toPendingTrade(trade),
		id: trade.id,
		entryTimestamp: trade.entryTimestamp,
		filledEntry: trade.filledEntry
	};
}
