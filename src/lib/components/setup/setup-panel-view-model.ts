import {
	PRIMARY_MARKET_SYMBOL,
	type CanonicalMinutePipelineState,
	type MarketBias,
	type SetupClassification,
	type SetupReason,
	type StrategyStage,
	type StructureType,
	type TradingSetup
} from '$lib/domain/index.js';

export type SetupPanelTone = 'bullish' | 'bearish' | 'neutral' | 'positive' | 'warning';
export type SetupPanelConditionState = 'complete' | 'current' | 'waiting' | 'blocked';

export interface SetupPanelCondition {
	key: string;
	label: string;
	description: string;
	state: SetupPanelConditionState;
}

export interface SetupPanelStructure {
	timeframe: '1m' | '5m';
	value: string;
	detail: string;
}

export interface SetupPanelSetup {
	id: string;
	displayMode: 'CURRENT' | 'LATEST';
	direction: TradingSetup['direction'];
	status: TradingSetup['status'];
	statusLabel: string;
	statusDescription: string;
	tone: SetupPanelTone;
	score: number;
	classification: SetupClassification;
	eligibilityPassed: boolean;
	entryZone: { min: number; max: number };
	entryPrice: number;
	stopLoss: number;
	takeProfit: number;
	riskReward: number;
	invalidationLevel: number;
	invalidationRule: string;
	reasons: readonly SetupReason[];
	updatedAt: number;
	invalidation: { code: string; label: string } | null;
}

export interface LiveSetupPanelViewModel {
	symbol: string;
	bias: MarketBias;
	biasLabel: string;
	biasTone: SetupPanelTone;
	stage: StrategyStage;
	stageLabel: string;
	stageDescription: string;
	structures: readonly SetupPanelStructure[];
	conditions: readonly SetupPanelCondition[];
	setup: SetupPanelSetup | null;
	lastUpdatedAt: number | null;
}

const STAGE_COPY: Record<StrategyStage, { label: string; description: string }> = {
	WAITING_FOR_BIAS: {
		label: 'Waiting for bias',
		description: 'Waiting for confirmed 5m market direction.'
	},
	WAITING_FOR_SWEEP: {
		label: 'Waiting for sweep',
		description: 'Bias is established; waiting for the matching liquidity sweep.'
	},
	WAITING_FOR_CHOCH: {
		label: 'Waiting for CHoCH',
		description: 'Liquidity was swept; waiting for a confirmed change of character.'
	},
	WAITING_FOR_DISPLACEMENT: {
		label: 'Waiting for displacement',
		description: 'CHoCH is confirmed; waiting for directional displacement.'
	},
	WAITING_FOR_FVG: {
		label: 'Waiting for FVG',
		description: 'Displacement is confirmed; waiting for its causal fair value gap.'
	},
	WAITING_FOR_RETRACEMENT: {
		label: 'Waiting for retracement',
		description: 'A valid setup exists; waiting for its entry price to be touched.'
	},
	INVALIDATED: {
		label: 'Sequence invalidated',
		description: 'The canonical strategy invalidated the current sequence.'
	}
};

const CONDITION_COPY = [
	{
		key: 'bias',
		stage: 'WAITING_FOR_BIAS',
		label: '5m directional bias',
		description: 'Confirmed higher-timeframe structure'
	},
	{
		key: 'sweep',
		stage: 'WAITING_FOR_SWEEP',
		label: 'Opposing liquidity sweep',
		description: 'Closed-candle rejection through liquidity'
	},
	{
		key: 'choch',
		stage: 'WAITING_FOR_CHOCH',
		label: '1m CHoCH',
		description: 'Confirmed close through relevant structure'
	},
	{
		key: 'displacement',
		stage: 'WAITING_FOR_DISPLACEMENT',
		label: 'Directional displacement',
		description: 'Body exceeds the domain ATR threshold'
	},
	{
		key: 'fvg',
		stage: 'WAITING_FOR_FVG',
		label: 'Causal fair value gap',
		description: 'Gap linked to the active displacement'
	},
	{
		key: 'retracement',
		stage: 'WAITING_FOR_RETRACEMENT',
		label: 'Entry retracement',
		description: 'Price reaches the calculated entry level'
	}
] as const satisfies readonly {
	key: string;
	stage: Exclude<StrategyStage, 'INVALIDATED'>;
	label: string;
	description: string;
}[];

const INVALIDATION_LABELS: Readonly<Record<string, string>> = {
	HTF_BIAS_REVERSED: 'Higher-timeframe bias reversed',
	PROTECTED_LOW_BREACHED: 'A candle closed below the protected low',
	PROTECTED_HIGH_BREACHED: 'A candle closed above the protected high',
	DEPENDENT_FVG_FILLED: 'The setup fair value gap was filled',
	DEPENDENT_ORDER_BLOCK_INVALIDATED: 'The required order block was invalidated',
	PENDING_EXPIRED: 'The entry window expired before a valid touch',
	EXPIRED_END_OF_RANGE: 'The setup expired at the end of the replay range'
};

export function buildLiveSetupPanelViewModel(
	state: CanonicalMinutePipelineState
): LiveSetupPanelViewModel {
	const pipeline = state.pipeline;
	const activeSetup = pipeline.activeSetupId
		? (pipeline.setupRegistry.find(({ id }) => id === pipeline.activeSetupId) ?? null)
		: null;
	const latestSetup = [...pipeline.setupRegistry].sort(
		(left, right) =>
			right.updatedAt - left.updatedAt ||
			right.createdAt - left.createdAt ||
			right.id.localeCompare(left.id)
	)[0];
	const setup = activeSetup ?? latestSetup ?? null;
	const stageCopy = STAGE_COPY[pipeline.strategy.stage];
	const entryState = pipeline.timeframes['1m'];
	const biasState = pipeline.timeframes['5m'];

	return {
		symbol:
			entryState.recentCandles.at(-1)?.symbol ??
			biasState.recentCandles.at(-1)?.symbol ??
			setup?.symbol ??
			PRIMARY_MARKET_SYMBOL,
		bias: pipeline.htfBias,
		biasLabel: formatBias(pipeline.htfBias),
		biasTone: biasTone(pipeline.htfBias),
		stage: pipeline.strategy.stage,
		stageLabel: stageCopy.label,
		stageDescription: stageCopy.description,
		structures: [
			structureView('5m', biasState.marketStructure),
			structureView('1m', entryState.marketStructure)
		],
		conditions: buildConditions(pipeline.strategy.stage, pipeline.strategy.invalidationReason),
		setup: setup ? setupView(setup, activeSetup?.id === setup.id) : null,
		lastUpdatedAt: pipeline.lastProcessedTimestamp
	};
}

function structureView(
	timeframe: SetupPanelStructure['timeframe'],
	structure: CanonicalMinutePipelineState['pipeline']['timeframes']['1m']['marketStructure']
): SetupPanelStructure {
	const values = [structure.latestHighStructure, structure.latestLowStructure].filter(
		(value): value is StructureType => value !== null
	);
	return {
		timeframe,
		value: values.length > 0 ? values.join(' · ') : '—',
		detail:
			structure.sequence.length > 0
				? `${structure.sequence.length} confirmed structure point${structure.sequence.length === 1 ? '' : 's'}`
				: 'Awaiting confirmed swings'
	};
}

function buildConditions(
	stage: StrategyStage,
	invalidationReason: string | null
): readonly SetupPanelCondition[] {
	if (stage === 'INVALIDATED') {
		return [
			{
				key: 'invalidated',
				label: 'Sequence invalidated',
				description: invalidationReason ?? STAGE_COPY.INVALIDATED.description,
				state: 'blocked'
			}
		];
	}
	const currentIndex = CONDITION_COPY.findIndex((condition) => condition.stage === stage);
	return CONDITION_COPY.map((condition, index) => ({
		key: condition.key,
		label: condition.label,
		description: condition.description,
		state: index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'waiting'
	}));
}

function setupView(setup: TradingSetup, active: boolean): SetupPanelSetup {
	const status = statusCopy(setup.status);
	return {
		id: setup.id,
		displayMode: active ? 'CURRENT' : 'LATEST',
		direction: setup.direction,
		status: setup.status,
		statusLabel: status.label,
		statusDescription: status.description,
		tone: status.tone,
		score: setup.score,
		classification: setup.classification,
		eligibilityPassed: setup.eligibility.eligible,
		entryZone: { ...setup.entryZone },
		entryPrice: setup.entryPrice,
		stopLoss: setup.stopLoss,
		takeProfit: setup.takeProfit,
		riskReward: setup.riskReward,
		invalidationLevel: setup.dependencies.protectedSwingPrice,
		invalidationRule:
			setup.direction === 'LONG'
				? 'Closed candle below protected low'
				: 'Closed candle above protected high',
		reasons: setup.reasons.map((reason) => ({ ...reason })),
		updatedAt: setup.updatedAt,
		invalidation: setup.invalidationReason
			? {
					code: setup.invalidationReason,
					label:
						INVALIDATION_LABELS[setup.invalidationReason] ?? humanizeCode(setup.invalidationReason)
				}
			: null
	};
}

function statusCopy(status: TradingSetup['status']): {
	label: string;
	description: string;
	tone: SetupPanelTone;
} {
	switch (status) {
		case 'FORMING':
			return {
				label: 'Forming',
				description: 'Domain confirmation is still in progress.',
				tone: 'neutral'
			};
		case 'VALID':
			return {
				label: 'Valid setup',
				description: 'Eligibility passed; waiting for the entry price touch.',
				tone: 'positive'
			};
		case 'TRIGGERED':
			return {
				label: 'Entry triggered',
				description: 'The entry price was touched on a finalized candle.',
				tone: 'positive'
			};
		case 'INVALIDATED':
			return {
				label: 'Invalidated',
				description: 'A canonical invalidation condition ended this setup.',
				tone: 'warning'
			};
		case 'TP':
			return {
				label: 'Target reached',
				description: 'The take-profit level was reached.',
				tone: 'positive'
			};
		case 'SL':
			return {
				label: 'Stop reached',
				description: 'The stop-loss level was reached.',
				tone: 'warning'
			};
		case 'EXPIRED_END_OF_RANGE':
			return {
				label: 'Replay expired',
				description: 'The pending setup ended with the replay range.',
				tone: 'warning'
			};
		case 'OPEN_END_OF_RANGE':
			return {
				label: 'Open at range end',
				description: 'The triggered setup remained open at the replay boundary.',
				tone: 'neutral'
			};
	}
}

function formatBias(bias: MarketBias): string {
	return bias === 'BULLISH' ? 'Bullish' : bias === 'BEARISH' ? 'Bearish' : 'Neutral';
}

function biasTone(bias: MarketBias): SetupPanelTone {
	return bias === 'BULLISH' ? 'bullish' : bias === 'BEARISH' ? 'bearish' : 'neutral';
}

function humanizeCode(code: string): string {
	const value = code.replaceAll('_', ' ').toLowerCase();
	return value.charAt(0).toUpperCase() + value.slice(1);
}
