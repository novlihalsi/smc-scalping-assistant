import {
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	type Candle
} from '../market/index.js';
import { calculateRiskPlan, RiskCalculationError, type RiskPlan } from '../risk/index.js';
import { evaluateSetupEligibility, scoreSetupQuality } from '../scoring/index.js';
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
	setupRegistry: readonly TradingSetup[];
	activeSetupId: string | null;
	maxPendingEntryBars: number;
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

export function createSmcClosedCandleState(
	config: SMCStrategyConfig
): SMCClosedCandlePipelineState {
	assertPendingEntryConfig(config);
	return {
		timeframes: {
			[CANONICAL_STRATEGY_TIMEFRAME]: createTimeframeState(config),
			[DERIVED_BIAS_TIMEFRAME]: createTimeframeState(config)
		},
		strategy: createStrategyState(),
		sequence: emptySequence(),
		setupRegistry: [],
		activeSetupId: null,
		maxPendingEntryBars: config.maxPendingEntryBars,
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
	let setupRegistry = state.setupRegistry;
	let activeSetupId = state.activeSetupId;
	let htfBias = state.htfBias;
	const setups: TradingSetup[] = [];

	if (candle.timeframe === config.biasTimeframe) {
		htfBias = timeframeResult.state.marketStructure.bias;
		const biasResult = processStrategySignal(strategy, {
			type: 'HTF_BIAS',
			id: JSON.stringify(['HTF_BIAS', candle.symbol, candle.closeTimestamp, htfBias]),
			timestamp: candle.closeTimestamp,
			timeframe: DERIVED_BIAS_TIMEFRAME,
			bias: htfBias
		});
		strategy = biasResult.state;
		if (biasResult.transition) sequence = emptySequence();

		const activeSetup = resolveSetup(setupRegistry, activeSetupId);
		if (activeSetup && !isBiasAligned(activeSetup, htfBias)) {
			const invalidated = invalidateSetup(activeSetup, candle.closeTimestamp, 'HTF_BIAS_REVERSED');
			setupRegistry = upsertSetup(setupRegistry, invalidated);
			activeSetupId = null;
			setups.push(invalidated);
		}
	} else {
		const activeSetup = resolveSetup(setupRegistry, activeSetupId);
		if (activeSetup) {
			const lifecycle = processPendingSetup(
				activeSetup,
				timeframeResult.state,
				htfBias,
				candle,
				config
			);
			setupRegistry = upsertSetup(setupRegistry, lifecycle.setup);
			if (lifecycle.event) setups.push(lifecycle.event);
			if (lifecycle.setup.status !== 'VALID') {
				activeSetupId = null;
				strategy = restartStrategy(htfBias, candle);
				sequence = emptySequence();
			}
		} else {
			({ strategy, sequence } = processEntryEvents(
				strategy,
				sequence,
				timeframeResult.events,
				candle
			));

			if (strategy.stage === 'WAITING_FOR_RETRACEMENT' && strategy.direction) {
				const setup = createTradingSetup(
					strategy,
					sequence,
					timeframeResult.state,
					htfBias,
					candle,
					config
				);
				if (setup) {
					setupRegistry = upsertSetup(setupRegistry, setup);
					setups.push(setup);
					if (setup.status === 'VALID') {
						activeSetupId = setup.id;
					} else {
						strategy = restartStrategy(htfBias, candle);
						sequence = emptySequence();
					}
				} else {
					strategy = restartStrategy(htfBias, candle);
					sequence = emptySequence();
				}
			}
		}
	}

	return {
		state: {
			timeframes,
			strategy,
			sequence,
			setupRegistry,
			activeSetupId,
			maxPendingEntryBars: state.maxPendingEntryBars,
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
	const previousAtr = state.atr.atr;
	const atrResult = processAtrCandle(state.atr, candle);
	const displacement = detectDisplacement(candle, previousAtr, {
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
	const stageAtCandleOpen = initialStrategy.stage;

	for (const sweep of stageAtCandleOpen === 'WAITING_FOR_SWEEP' ? events.sweeps : []) {
		const result = processStrategySignal(strategy, {
			type: 'LIQUIDITY_SWEEP',
			id: sweep.id,
			timestamp: candle.closeTimestamp,
			timeframe: CANONICAL_STRATEGY_TIMEFRAME,
			sweep
		});
		strategy = result.state;
		if (advancedTo(result, 'WAITING_FOR_CHOCH')) sequence = { ...emptySequence(), sweep };
	}

	if (stageAtCandleOpen === 'WAITING_FOR_CHOCH' && events.choch) {
		const result = processStrategySignal(strategy, {
			type: 'CHOCH',
			id: events.choch.id,
			timestamp: candle.closeTimestamp,
			timeframe: CANONICAL_STRATEGY_TIMEFRAME,
			structureBreak: events.choch
		});
		strategy = result.state;
		if (advancedTo(result, 'WAITING_FOR_DISPLACEMENT')) {
			sequence = { ...sequence, choch: events.choch };
		}
	}

	if (stageAtCandleOpen === 'WAITING_FOR_DISPLACEMENT' && events.displacement) {
		const result = processStrategySignal(strategy, {
			type: 'DISPLACEMENT',
			id: events.displacement.id,
			timestamp: candle.closeTimestamp,
			timeframe: CANONICAL_STRATEGY_TIMEFRAME,
			displacement: events.displacement
		});
		strategy = result.state;
		if (advancedTo(result, 'WAITING_FOR_FVG')) {
			sequence = { ...sequence, displacement: events.displacement };
		}
	}

	if (stageAtCandleOpen === 'WAITING_FOR_FVG' && events.createdFvg) {
		strategy = processStrategySignal(strategy, {
			type: 'FVG',
			id: events.createdFvg.id,
			timestamp: candle.closeTimestamp,
			timeframe: CANONICAL_STRATEGY_TIMEFRAME,
			gap: events.createdFvg
		}).state;
	}

	return { strategy, sequence };
}

function createTradingSetup(
	strategy: StrategyState,
	sequence: SMCSequenceContext,
	entryState: SMCClosedCandleTimeframeState,
	htfBias: MarketBias,
	candle: Candle,
	config: SMCStrategyConfig
): TradingSetup | null {
	const fvg = resolveFvg(entryState.fvg.gaps, strategy.activeFvgId);
	if (
		!strategy.direction ||
		!fvg ||
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
			fvg,
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
	const expectedDirection = strategy.direction === 'LONG' ? 'BULLISH' : 'BEARISH';
	const eligibility = evaluateSetupEligibility({
		alignedHtfBias: htfBias === expectedDirection,
		liquiditySweep:
			sequence.sweep.direction === (strategy.direction === 'LONG' ? 'SELL_SIDE' : 'BUY_SIDE'),
		choch: sequence.choch.type === 'CHOCH' && sequence.choch.direction === expectedDirection,
		displacement: sequence.displacement.direction === expectedDirection,
		causalFvg:
			fvg.type === expectedDirection &&
			fvg.createdAt >= sequence.displacement.timestamp &&
			strategy.sourceEventIds.includes(fvg.id),
		validEntryGeometry: hasValidEntryGeometry(riskPlan),
		validRiskReward: riskPlan.riskReward >= config.minimumRiskReward
	});
	if (!eligibility.eligible) return null;

	const quality = scoreSetupQuality({
		orderBlockOverlap: riskPlan.entryZoneSource === 'FVG_OB_OVERLAP',
		premiumDiscountAlignment:
			(strategy.direction === 'LONG' && premiumDiscount === 'DISCOUNT') ||
			(strategy.direction === 'SHORT' && premiumDiscount === 'PREMIUM'),
		sweepQuality: hasStrongSweepRejection(sequence.sweep),
		displacementStrength: sequence.displacement.bodySize >= sequence.displacement.threshold * 1.5,
		fvgQuality: fvg.state === 'UNTOUCHED',
		targetQuality: riskPlan.targetSource === 'LIQUIDITY',
		sessionReady: false
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
		status: 'VALID',
		eligibility,
		score: quality.score,
		classification: quality.classification,
		entryZone: riskPlan.entryZone,
		entryPrice: riskPlan.entryPrice,
		stopLoss: riskPlan.stopLoss,
		takeProfit: riskPlan.takeProfit,
		riskReward: riskPlan.riskReward,
		reasons: quality.reasons.map((reason) => ({ ...reason })),
		sourceEventIds: [...strategy.sourceEventIds],
		dependencies: {
			fvgId: fvg.id,
			orderBlockId: riskPlan.entryZoneSource === 'FVG_OB_OVERLAP' ? (orderBlock?.id ?? null) : null,
			sweepId: sequence.sweep.id,
			structureBreakId: sequence.choch.id,
			displacementId: sequence.displacement.id
		},
		pendingEntryBars: 0
	};
}

function hasValidEntryGeometry(plan: RiskPlan): boolean {
	return (
		Number.isFinite(plan.entryZone.min) &&
		Number.isFinite(plan.entryZone.max) &&
		plan.entryZone.min <= plan.entryZone.max &&
		plan.entryPrice >= plan.entryZone.min &&
		plan.entryPrice <= plan.entryZone.max &&
		(plan.direction === 'LONG'
			? plan.stopLoss < plan.entryPrice && plan.takeProfit > plan.entryPrice
			: plan.stopLoss > plan.entryPrice && plan.takeProfit < plan.entryPrice)
	);
}

function hasStrongSweepRejection(sweep: LiquiditySweep): boolean {
	const excursion = Math.abs(sweep.extremePrice - sweep.liquidityPrice);
	const rejection = Math.abs(sweep.closePrice - sweep.liquidityPrice);
	return rejection >= excursion;
}

function processPendingSetup(
	setup: TradingSetup,
	entryState: SMCClosedCandleTimeframeState,
	htfBias: MarketBias,
	candle: Candle,
	config: SMCStrategyConfig
): { setup: TradingSetup; event: TradingSetup | null } {
	if (!isBiasAligned(setup, htfBias)) {
		const invalidated = invalidateSetup(setup, candle.closeTimestamp, 'HTF_BIAS_REVERSED');
		return { setup: invalidated, event: invalidated };
	}

	const fvg = resolveFvg(entryState.fvg.gaps, setup.dependencies.fvgId);
	if (!fvg || fvg.state === 'FILLED') {
		const invalidated = invalidateSetup(setup, candle.closeTimestamp, 'DEPENDENT_FVG_FILLED');
		return { setup: invalidated, event: invalidated };
	}

	if (setup.dependencies.orderBlockId) {
		const orderBlock = entryState.orderBlocks.blocks.find(
			({ id }) => id === setup.dependencies.orderBlockId
		);
		if (!orderBlock || orderBlock.state === 'INVALIDATED') {
			const invalidated = invalidateSetup(
				setup,
				candle.closeTimestamp,
				'DEPENDENT_ORDER_BLOCK_INVALIDATED'
			);
			return { setup: invalidated, event: invalidated };
		}
	}

	if (setup.pendingEntryBars >= config.maxPendingEntryBars) {
		const invalidated = invalidateSetup(setup, candle.closeTimestamp, 'PENDING_EXPIRED');
		return { setup: invalidated, event: invalidated };
	}

	const pending = {
		...setup,
		updatedAt: candle.closeTimestamp,
		pendingEntryBars: setup.pendingEntryBars + 1
	};
	if (candle.low <= setup.entryPrice && candle.high >= setup.entryPrice) {
		const triggered: TradingSetup = {
			...pending,
			status: 'TRIGGERED',
			triggeredAt: candle.closeTimestamp
		};
		return { setup: triggered, event: triggered };
	}

	return { setup: pending, event: null };
}

function invalidateSetup(setup: TradingSetup, timestamp: number, reason: string): TradingSetup {
	return { ...setup, status: 'INVALIDATED', updatedAt: timestamp, invalidationReason: reason };
}

function isBiasAligned(setup: TradingSetup, bias: MarketBias): boolean {
	return (
		(setup.direction === 'LONG' && bias === 'BULLISH') ||
		(setup.direction === 'SHORT' && bias === 'BEARISH')
	);
}

function resolveFvg(gaps: readonly FairValueGap[], id: string | null): FairValueGap | null {
	if (id === null) return null;
	return gaps.find((gap) => gap.id === id) ?? null;
}

function resolveSetup(registry: readonly TradingSetup[], id: string | null): TradingSetup | null {
	if (id === null) return null;
	return registry.find((setup) => setup.id === id) ?? null;
}

function upsertSetup(
	registry: readonly TradingSetup[],
	setup: TradingSetup
): readonly TradingSetup[] {
	const existingIndex = registry.findIndex(({ id }) => id === setup.id);
	if (existingIndex < 0) return [...registry, setup];
	return registry.map((existing, index) => (index === existingIndex ? setup : existing));
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
		timeframe: DERIVED_BIAS_TIMEFRAME,
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
	assertPendingEntryConfig(config);
	if (candle.timeframe !== config.biasTimeframe && candle.timeframe !== config.entryTimeframe) {
		throw new RangeError(`SMC pipeline does not support ${candle.timeframe} candles.`);
	}
	if (state.timeframes[candle.timeframe].atr.period !== config.atrPeriod) {
		throw new RangeError('SMC pipeline configuration cannot change during replay.');
	}
	if (state.maxPendingEntryBars !== config.maxPendingEntryBars) {
		throw new RangeError('SMC pipeline configuration cannot change during replay.');
	}
	if (
		state.lastProcessedTimestamp !== null &&
		candle.closeTimestamp < state.lastProcessedTimestamp
	) {
		throw new RangeError('SMC pipeline candles must be processed by non-decreasing close time.');
	}
}

function assertPendingEntryConfig(config: SMCStrategyConfig): void {
	if (!Number.isSafeInteger(config.maxPendingEntryBars) || config.maxPendingEntryBars < 1) {
		throw new RangeError('maxPendingEntryBars must be a positive safe integer.');
	}
}
