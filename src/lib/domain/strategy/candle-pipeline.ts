import type { Candle } from '../market/index.js';
import { calculateRiskPlan, RiskCalculationError, type RiskPlan } from '../risk/index.js';
import { scoreSetup } from '../scoring/index.js';
import {
	calculateDealingRange,
	classifyPremiumDiscount,
	createAtrState,
	createBosState,
	createChochState,
	createFvgState,
	createLiquidityState,
	createMarketStructureState,
	createOrderBlockState,
	detectConfirmedSwings,
	detectDisplacement,
	processAtrCandle,
	processBosCandle,
	processChochCandle,
	processConfirmedSwing,
	processFvgCandle,
	processLiquiditySweepCandle,
	processLiquiditySwing,
	processOrderBlockCandle,
	type AtrState,
	type BosState,
	type ChochState,
	type DisplacementEvent,
	type FairValueGap,
	type FvgState,
	type LiquidityState,
	type LiquiditySweep,
	type MarketBias,
	type MarketStructureState,
	type OrderBlock,
	type OrderBlockState,
	type StructureBreak
} from '../smc/index.js';
import type { SMCStrategyConfig, TradingSetup } from './models.js';
import {
	createStrategyState,
	processStrategySignal,
	type StrategyProcessingResult,
	type StrategySignal,
	type StrategyState
} from './state-machine.js';

type PipelineTimeframe = SMCStrategyConfig['biasTimeframe'] | SMCStrategyConfig['entryTimeframe'];

export interface SMCClosedCandleTimeframeState {
	recentCandles: readonly Candle[];
	processedCandles: number;
	marketStructure: MarketStructureState;
	liquidity: LiquidityState;
	atr: AtrState;
	bos: BosState;
	choch: ChochState;
	fvg: FvgState;
	orderBlocks: OrderBlockState;
}

export interface SMCSequenceContext {
	sweep: LiquiditySweep | null;
	choch: StructureBreak | null;
	displacement: DisplacementEvent | null;
}

export interface SMCClosedCandlePipelineState {
	timeframes: Record<PipelineTimeframe, SMCClosedCandleTimeframeState>;
	strategy: StrategyState;
	sequence: SMCSequenceContext;
	htfBias: MarketBias;
	processedCandles: number;
	lastProcessedTimestamp: number | null;
}

interface TimeframeProcessingEvents {
	bos: StructureBreak | null;
	choch: StructureBreak | null;
	sweeps: readonly LiquiditySweep[];
	displacement: DisplacementEvent | null;
	createdFvg: FairValueGap | null;
}

interface TimeframeProcessingResult {
	state: SMCClosedCandleTimeframeState;
	events: TimeframeProcessingEvents;
}

const NORMALIZED_ACCOUNT_BALANCE = 1;
const NORMALIZED_RISK_PERCENT = 1;

export function createSmcClosedCandlePipeline(config: SMCStrategyConfig) {
	return {
		createInitialState: (): SMCClosedCandlePipelineState => createSmcClosedCandleState(config),
		processClosedCandle: (
			state: SMCClosedCandlePipelineState,
			candle: Candle,
			processingConfig: SMCStrategyConfig
		) => processSmcClosedCandle(state, candle, processingConfig)
	};
}

export function createSmcClosedCandleState(
	config: SMCStrategyConfig
): SMCClosedCandlePipelineState {
	return {
		timeframes: {
			'1m': createTimeframeState(config),
			'5m': createTimeframeState(config)
		},
		strategy: createStrategyState(),
		sequence: emptySequence(),
		htfBias: 'NEUTRAL',
		processedCandles: 0,
		lastProcessedTimestamp: null
	};
}

export function processSmcClosedCandle(
	state: SMCClosedCandlePipelineState,
	candle: Candle,
	config: SMCStrategyConfig
): { state: SMCClosedCandlePipelineState; setups: readonly TradingSetup[] } {
	assertPipelineCandle(state, candle, config);
	const timeframeResult = processTimeframeCandle(
		state.timeframes[candle.timeframe],
		candle,
		config
	);
	const timeframes = { ...state.timeframes, [candle.timeframe]: timeframeResult.state };
	let strategy = state.strategy;
	let sequence = state.sequence;
	let htfBias = state.htfBias;
	const setups: TradingSetup[] = [];

	if (candle.timeframe === config.biasTimeframe) {
		htfBias = timeframeResult.state.marketStructure.bias;
		const biasResult = processStrategySignal(strategy, {
			type: 'HTF_BIAS',
			id: JSON.stringify(['HTF_BIAS', candle.symbol, candle.closeTimestamp, htfBias]),
			timestamp: candle.closeTimestamp,
			timeframe: '5m',
			bias: htfBias
		});
		strategy = biasResult.state;
		if (biasResult.transition) sequence = emptySequence();
	} else {
		({ strategy, sequence } = processEntryEvents(
			strategy,
			sequence,
			timeframeResult.events,
			candle
		));

		const retracement = createRetracementSignal(strategy, candle);
		if (retracement) {
			const retracementResult = processStrategySignal(strategy, retracement);
			strategy = retracementResult.state;
		}

		if (strategy.stage === 'READY' && strategy.direction) {
			const setup = createTradingSetup(strategy, sequence, timeframeResult.state, candle, config);
			if (setup) setups.push(setup);
			strategy = restartStrategy(htfBias, candle);
			sequence = emptySequence();
		}
	}

	return {
		state: {
			timeframes,
			strategy,
			sequence,
			htfBias,
			processedCandles: state.processedCandles + 1,
			lastProcessedTimestamp: candle.closeTimestamp
		},
		setups
	};
}

function processTimeframeCandle(
	state: SMCClosedCandleTimeframeState,
	candle: Candle,
	config: SMCStrategyConfig
): TimeframeProcessingResult {
	const requiredSwingWindow = config.swingLeftBars + config.swingRightBars + 1;
	const recentCandles = [...state.recentCandles, candle].slice(-requiredSwingWindow);
	const confirmedSwings = detectConfirmedSwings(recentCandles, {
		leftBars: config.swingLeftBars,
		rightBars: config.swingRightBars
	}).map((swing) => ({
		...swing,
		sourceIndex: state.processedCandles - config.swingRightBars
	}));
	let marketStructure = state.marketStructure;
	let liquidity = state.liquidity;

	for (const swing of confirmedSwings) {
		marketStructure = processConfirmedSwing(marketStructure, swing);
		liquidity = processLiquiditySwing(liquidity, swing, {
			tolerancePercent: config.liquidityTolerancePercent
		}).state;
	}

	const bosResult = processBosCandle(state.bos, candle, marketStructure);
	const chochResult = processChochCandle(state.choch, candle, marketStructure);
	marketStructure = chochResult.marketStructure;
	const sweepResult = processLiquiditySweepCandle(liquidity, candle);
	const atrResult = processAtrCandle(state.atr, candle);
	const displacement = detectDisplacement(candle, atrResult.value?.atr ?? null, {
		atrMultiplier: config.displacementATRMultiplier
	});
	const fvgResult = processFvgCandle(state.fvg, candle);
	const structureBreaks = [bosResult.structureBreak, chochResult.structureBreak].filter(
		(structureBreak): structureBreak is StructureBreak => structureBreak !== null
	);
	const orderBlockResult = processOrderBlockCandle(
		state.orderBlocks,
		candle,
		displacement,
		structureBreaks
	);

	return {
		state: {
			recentCandles,
			processedCandles: state.processedCandles + 1,
			marketStructure,
			liquidity: sweepResult.state,
			atr: atrResult.state,
			bos: bosResult.state,
			choch: chochResult.state,
			fvg: fvgResult.state,
			orderBlocks: orderBlockResult.state
		},
		events: {
			bos: bosResult.structureBreak,
			choch: chochResult.structureBreak,
			sweeps: sweepResult.sweeps,
			displacement,
			createdFvg: fvgResult.createdGap
		}
	};
}

function processEntryEvents(
	initialStrategy: StrategyState,
	initialSequence: SMCSequenceContext,
	events: TimeframeProcessingEvents,
	candle: Candle
): { strategy: StrategyState; sequence: SMCSequenceContext } {
	let strategy = initialStrategy;
	let sequence = initialSequence;

	for (const sweep of events.sweeps) {
		const result = processStrategySignal(strategy, {
			type: 'LIQUIDITY_SWEEP',
			id: sweep.id,
			timestamp: candle.closeTimestamp,
			timeframe: '1m',
			sweep
		});
		strategy = result.state;
		if (advancedTo(result, 'WAITING_FOR_CHOCH')) sequence = { ...emptySequence(), sweep };
	}

	if (events.choch) {
		const result = processStrategySignal(strategy, {
			type: 'CHOCH',
			id: events.choch.id,
			timestamp: candle.closeTimestamp,
			timeframe: '1m',
			structureBreak: events.choch
		});
		strategy = result.state;
		if (advancedTo(result, 'WAITING_FOR_DISPLACEMENT')) {
			sequence = { ...sequence, choch: events.choch };
		}
	}

	if (events.displacement) {
		const result = processStrategySignal(strategy, {
			type: 'DISPLACEMENT',
			id: events.displacement.id,
			timestamp: candle.closeTimestamp,
			timeframe: '1m',
			displacement: events.displacement
		});
		strategy = result.state;
		if (advancedTo(result, 'WAITING_FOR_FVG')) {
			sequence = { ...sequence, displacement: events.displacement };
		}
	}

	if (events.createdFvg) {
		strategy = processStrategySignal(strategy, {
			type: 'FVG',
			id: events.createdFvg.id,
			timestamp: candle.closeTimestamp,
			timeframe: '1m',
			gap: events.createdFvg
		}).state;
	}

	return { strategy, sequence };
}

function createRetracementSignal(
	strategy: StrategyState,
	candle: Candle
): Extract<StrategySignal, { type: 'RETRACEMENT' }> | null {
	const gap = strategy.activeFvg;
	if (
		strategy.stage !== 'WAITING_FOR_RETRACEMENT' ||
		!gap ||
		gap.createdAt >= candle.closeTimestamp ||
		candle.low > gap.top ||
		candle.high < gap.bottom
	) {
		return null;
	}
	const overlapBottom = Math.max(candle.low, gap.bottom);
	const overlapTop = Math.min(candle.high, gap.top);
	return {
		type: 'RETRACEMENT',
		id: JSON.stringify(['RETRACEMENT', candle.symbol, candle.closeTimestamp, gap.id]),
		timestamp: candle.closeTimestamp,
		timeframe: '1m',
		fvgId: gap.id,
		price: (overlapBottom + overlapTop) / 2
	};
}

function createTradingSetup(
	strategy: StrategyState,
	sequence: SMCSequenceContext,
	entryState: SMCClosedCandleTimeframeState,
	candle: Candle,
	config: SMCStrategyConfig
): TradingSetup | null {
	if (
		!strategy.direction ||
		!strategy.activeFvg ||
		!sequence.sweep ||
		!sequence.choch ||
		!sequence.displacement ||
		entryState.atr.atr === null
	) {
		return null;
	}
	const orderBlock = findRelevantOrderBlock(entryState.orderBlocks.blocks, strategy.direction);
	let riskPlan: RiskPlan;
	try {
		riskPlan = calculateRiskPlan({
			direction: strategy.direction,
			evaluationTimestamp: candle.closeTimestamp,
			fvg: strategy.activeFvg,
			orderBlock,
			sweep: sequence.sweep,
			atr: entryState.atr.atr,
			liquidityLevels: entryState.liquidity.levels,
			config: {
				minimumRiskReward: config.minimumRiskReward,
				stopLossATRBuffer: config.stopLossATRBuffer,
				accountBalance: NORMALIZED_ACCOUNT_BALANCE,
				riskPercent: NORMALIZED_RISK_PERCENT
			}
		});
	} catch (error) {
		if (error instanceof RiskCalculationError && error.code !== 'FUTURE_DATA') return null;
		throw error;
	}

	const { lastHigh, lastLow } = entryState.marketStructure;
	const range =
		lastHigh && lastLow && lastHigh.price > lastLow.price
			? calculateDealingRange(entryState.marketStructure)
			: null;
	const premiumDiscount = range
		? classifyPremiumDiscount(riskPlan.entryPrice, range)
		: 'EQUILIBRIUM';
	const score = scoreSetup({
		htfBias: true,
		liquiditySweep: true,
		choch: true,
		fvg: true,
		orderBlock: riskPlan.entryZoneSource === 'FVG_OB_OVERLAP',
		premiumDiscount:
			(strategy.direction === 'LONG' && premiumDiscount === 'DISCOUNT') ||
			(strategy.direction === 'SHORT' && premiumDiscount === 'PREMIUM'),
		displacement: true,
		validRiskReward: true
	});
	const id = JSON.stringify([
		'SETUP',
		candle.symbol,
		candle.closeTimestamp,
		strategy.direction,
		...strategy.sourceEventIds
	]);

	return {
		id,
		symbol: candle.symbol,
		createdAt: candle.closeTimestamp,
		updatedAt: candle.closeTimestamp,
		direction: strategy.direction,
		status: score.score >= config.minimumScore ? 'VALID' : 'FORMING',
		score: score.score,
		classification: score.classification,
		entryZone: riskPlan.entryZone,
		stopLoss: riskPlan.stopLoss,
		takeProfit: riskPlan.takeProfit,
		riskReward: riskPlan.riskReward,
		reasons: score.reasons.map((reason) => ({ ...reason })),
		sourceEventIds: [...strategy.sourceEventIds]
	};
}

function findRelevantOrderBlock(
	blocks: readonly OrderBlock[],
	direction: NonNullable<StrategyState['direction']>
): OrderBlock | null {
	const type = direction === 'LONG' ? 'BULLISH' : 'BEARISH';
	return (
		[...blocks]
			.filter((block) => block.type === type && block.state === 'ACTIVE')
			.sort(
				(left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id)
			)[0] ?? null
	);
}

function restartStrategy(bias: MarketBias, candle: Candle): StrategyState {
	const initial = createStrategyState();
	if (bias === 'NEUTRAL') return initial;
	return processStrategySignal(initial, {
		type: 'HTF_BIAS',
		id: JSON.stringify(['HTF_BIAS_RESTART', candle.symbol, candle.closeTimestamp, bias]),
		timestamp: candle.closeTimestamp,
		timeframe: '5m',
		bias
	}).state;
}

function advancedTo(result: StrategyProcessingResult, stage: StrategyState['stage']): boolean {
	return result.transition?.to === stage;
}

function createTimeframeState(config: SMCStrategyConfig): SMCClosedCandleTimeframeState {
	return {
		recentCandles: [],
		processedCandles: 0,
		marketStructure: createMarketStructureState(),
		liquidity: createLiquidityState(),
		atr: createAtrState({ period: config.atrPeriod }),
		bos: createBosState(),
		choch: createChochState(),
		fvg: createFvgState(),
		orderBlocks: createOrderBlockState()
	};
}

function emptySequence(): SMCSequenceContext {
	return { sweep: null, choch: null, displacement: null };
}

function assertPipelineCandle(
	state: SMCClosedCandlePipelineState,
	candle: Candle,
	config: SMCStrategyConfig
): asserts candle is Candle & { timeframe: PipelineTimeframe } {
	if (candle.timeframe !== config.biasTimeframe && candle.timeframe !== config.entryTimeframe) {
		throw new RangeError(`SMC pipeline does not support ${candle.timeframe} candles.`);
	}
	if (state.timeframes[candle.timeframe].atr.period !== config.atrPeriod) {
		throw new RangeError('SMC pipeline configuration cannot change during replay.');
	}
	if (
		state.lastProcessedTimestamp !== null &&
		candle.closeTimestamp < state.lastProcessedTimestamp
	) {
		throw new RangeError('SMC pipeline candles must be processed by non-decreasing close time.');
	}
}
