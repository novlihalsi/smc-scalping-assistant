import {
	assertValidCandle,
	getCandleIdentity,
	getTimeframeDurationMilliseconds,
	type Candle
} from '../market/index.js';
import {
	classifyQualityScore,
	QUALITY_SCORE_MAX,
	QUALITY_SCORE_MIN,
	type SetupReason
} from '../scoring/index.js';
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

export interface EndOfRangeTerminalization {
	timestamp: number;
	expiredPendingSetupIds: readonly string[];
	openSetupIds: readonly string[];
}

export interface ClosedCandlePipeline<State> {
	createInitialState(): State;
	processClosedCandle(
		state: State,
		candle: Candle,
		config: SMCStrategyConfig
	): ClosedCandlePipelineResult<State>;
	terminalizeEndOfRange?(
		state: State,
		terminalization: EndOfRangeTerminalization
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

export interface ExpiredPendingBacktestTrade extends PendingBacktestTrade {
	status: 'EXPIRED_END_OF_RANGE';
	expiredAt: number;
}

export interface CensoredOpenBacktestTrade extends OpenBacktestTrade {
	status: 'OPEN_END_OF_RANGE';
	censoredAt: number;
}

export interface BacktestRunResult<State> {
	trades: BacktestTrade[];
	setupEvents: TradingSetup[];
	pendingTrades: PendingBacktestTrade[];
	openTrades: OpenBacktestTrade[];
	expiredPendingTrades: ExpiredPendingBacktestTrade[];
	censoredOpenTrades: CensoredOpenBacktestTrade[];
	finalState: State;
	processedCandles: number;
	preRollCandles: number;
	preRollTradesExcluded: number;
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
	let preRollCandles = 0;
	const pendingTrades = new Map<string, PendingTradeState>();
	const openTrades = new Map<string, OpenTradeState>();
	const closedSetupIds = new Set<string>();
	const allTrades: BacktestTrade[] = [];
	const setupEvents: TradingSetup[] = [];

	for (const candle of candles) {
		if (candle.openTimestamp < options.input.startDate) preRollCandles += 1;
		if (candle.timeframe === options.input.config.entryTimeframe) {
			processExistingOpenTrades(candle, openTrades, closedSetupIds, allTrades, executionConfig);
		}

		const processingResult = options.pipeline.processClosedCandle(
			domainState,
			{ ...candle },
			options.input.config
		);
		validatePipelineResult(processingResult);
		domainState = processingResult.state;
		processedCandles += 1;
		setupEvents.push(...processingResult.setups.map(cloneSetup));
		reconcileSetups(processingResult.setups, candle, pendingTrades, openTrades, closedSetupIds);
		if (candle.timeframe === options.input.config.entryTimeframe) {
			processPendingTrades(
				candle,
				pendingTrades,
				openTrades,
				closedSetupIds,
				allTrades,
				executionConfig
			);
		}
	}
	const rangeEndTimestamp =
		options.input.endDate +
		getTimeframeDurationMilliseconds(options.input.config.entryTimeframe) -
		1;
	const trades = allTrades.filter(
		({ entryTimestamp }) => entryTimestamp >= options.input.startDate
	);
	const expiredPendingTrades = [...pendingTrades.values()].map((trade) =>
		toExpiredPendingTrade(trade, rangeEndTimestamp)
	);
	const preRollOpenTradesExcluded = [...openTrades.values()].filter(
		({ entryTimestamp }) => entryTimestamp < options.input.startDate
	).length;
	const censoredOpenTrades = [...openTrades.values()]
		.filter(({ entryTimestamp }) => entryTimestamp >= options.input.startDate)
		.map((trade) => toCensoredOpenTrade(trade, rangeEndTimestamp));
	const endOfRangeSetupIds = {
		expiredPendingSetupIds: [...pendingTrades.keys()],
		openSetupIds: [...openTrades.keys()]
	};
	if (
		options.pipeline.terminalizeEndOfRange &&
		(endOfRangeSetupIds.expiredPendingSetupIds.length > 0 ||
			endOfRangeSetupIds.openSetupIds.length > 0)
	) {
		const terminalResult = options.pipeline.terminalizeEndOfRange(domainState, {
			timestamp: rangeEndTimestamp,
			...endOfRangeSetupIds
		});
		validatePipelineResult(terminalResult);
		validateEndOfRangeSetups(terminalResult.setups, endOfRangeSetupIds, rangeEndTimestamp);
		domainState = terminalResult.state;
		setupEvents.push(...terminalResult.setups.map(cloneSetup));
	}
	pendingTrades.clear();
	openTrades.clear();

	return {
		trades,
		setupEvents,
		pendingTrades: [],
		openTrades: [],
		expiredPendingTrades,
		censoredOpenTrades,
		finalState: domainState,
		processedCandles,
		preRollCandles,
		preRollTradesExcluded: allTrades.length - trades.length + preRollOpenTradesExcluded,
		executionConfig: { ...executionConfig }
	};
}

function validateEndOfRangeSetups(
	setups: readonly TradingSetup[],
	expected: Pick<EndOfRangeTerminalization, 'expiredPendingSetupIds' | 'openSetupIds'>,
	timestamp: number
): void {
	const expectedStatuses = new Map<string, TradingSetup['status']>([
		...expected.expiredPendingSetupIds.map((id) => [id, 'EXPIRED_END_OF_RANGE'] as const),
		...expected.openSetupIds.map((id) => [id, 'OPEN_END_OF_RANGE'] as const)
	]);
	for (const setup of setups) {
		const expectedStatus = expectedStatuses.get(setup.id);
		if (expectedStatus !== setup.status || setup.updatedAt !== timestamp) {
			throw new BacktestError(
				'INVALID_PIPELINE_RESULT',
				`Pipeline returned invalid end-of-range state for setup ${setup.id}.`
			);
		}
		expectedStatuses.delete(setup.id);
	}
	if (expectedStatuses.size > 0) {
		throw new BacktestError(
			'INVALID_PIPELINE_RESULT',
			`Pipeline did not terminalize setup ${[...expectedStatuses.keys()].sort()[0]}.`
		);
	}
}

function cloneSetup(setup: TradingSetup): TradingSetup {
	return {
		...setup,
		entryZone: { ...setup.entryZone },
		eligibility: {
			...setup.eligibility,
			failures: setup.eligibility.failures.map((failure) => ({ ...failure }))
		},
		reasons: setup.reasons.map((reason) => ({ ...reason })),
		sourceEventIds: [...setup.sourceEventIds],
		dependencies: { ...setup.dependencies }
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

		if (candle.openTimestamp <= input.endDate) {
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

		if (
			setup.status === 'INVALIDATED' ||
			setup.status === 'TP' ||
			setup.status === 'SL' ||
			setup.status === 'EXPIRED_END_OF_RANGE' ||
			setup.status === 'OPEN_END_OF_RANGE'
		) {
			pendingTrades.delete(setup.id);
			continue;
		}
		if (setup.status !== 'VALID' && setup.status !== 'TRIGGERED' && setup.status !== 'FORMING') {
			continue;
		}
		if (setup.status === 'FORMING' || openTrades.has(setup.id) || closedSetupIds.has(setup.id)) {
			continue;
		}

		const existingPending = pendingTrades.get(setup.id);
		pendingTrades.set(setup.id, {
			setupId: setup.id,
			direction: setup.direction,
			entry: setup.entryPrice,
			stopLoss: setup.stopLoss,
			takeProfit: setup.takeProfit,
			queuedAt: existingPending?.queuedAt ?? candle.closeTimestamp,
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
	const entry = setup.entryPrice;
	const validNumbers = [
		setup.createdAt,
		setup.updatedAt,
		setup.entryZone.min,
		setup.entryZone.max,
		setup.entryPrice,
		setup.stopLoss,
		setup.takeProfit,
		setup.riskReward,
		setup.score,
		setup.pendingEntryBars,
		setup.triggeredAt ?? 0
	].every(Number.isFinite);
	const validGeometry =
		Number.isSafeInteger(setup.createdAt) &&
		setup.createdAt >= 0 &&
		Number.isSafeInteger(setup.updatedAt) &&
		setup.updatedAt >= setup.createdAt &&
		setup.entryZone.min <= setup.entryZone.max &&
		entry >= setup.entryZone.min &&
		entry <= setup.entryZone.max &&
		Number.isSafeInteger(setup.pendingEntryBars) &&
		setup.pendingEntryBars >= 0 &&
		(setup.triggeredAt === undefined ||
			(Number.isSafeInteger(setup.triggeredAt) &&
				setup.triggeredAt >= setup.createdAt &&
				setup.triggeredAt <= candle.closeTimestamp)) &&
		(setup.direction === 'LONG'
			? setup.stopLoss < entry && setup.takeProfit > entry
			: setup.stopLoss > entry && setup.takeProfit < entry);
	const validDependencies =
		Boolean(setup.dependencies.sequenceId) &&
		Boolean(setup.dependencies.fvgId) &&
		Boolean(setup.dependencies.sweepId) &&
		Boolean(setup.dependencies.structureBreakId) &&
		Boolean(setup.dependencies.displacementId);
	const validEligibility = setup.eligibility.eligible && setup.eligibility.failures.length === 0;
	const validQuality =
		setup.score >= QUALITY_SCORE_MIN &&
		setup.score <= QUALITY_SCORE_MAX &&
		setup.classification === classifyQualityScore(setup.score) &&
		setup.reasons.length === 7 &&
		setup.reasons.reduce((total, reason) => total + reason.score, 0) === setup.score;
	if (
		!setup.id ||
		!validNumbers ||
		!validGeometry ||
		!validDependencies ||
		!validEligibility ||
		!validQuality
	) {
		throw new BacktestError(
			'INVALID_SETUP',
			`Setup ${setup.id} has invalid eligibility, quality, dependencies, or trade geometry.`
		);
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
	const rangeEndTimestamp =
		input.endDate + getTimeframeDurationMilliseconds(input.config.entryTimeframe) - 1;
	if (
		!input.symbol ||
		!Number.isSafeInteger(input.startDate) ||
		input.startDate < 0 ||
		!Number.isSafeInteger(input.endDate) ||
		input.endDate < input.startDate ||
		!Number.isSafeInteger(rangeEndTimestamp)
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

function toExpiredPendingTrade(
	trade: PendingTradeState,
	expiredAt: number
): ExpiredPendingBacktestTrade {
	return {
		...toPendingTrade(trade),
		status: 'EXPIRED_END_OF_RANGE',
		expiredAt
	};
}

function toCensoredOpenTrade(trade: OpenTradeState, censoredAt: number): CensoredOpenBacktestTrade {
	return {
		...toOpenTrade(trade),
		status: 'OPEN_END_OF_RANGE',
		censoredAt
	};
}
