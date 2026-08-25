export {
	classifyQualityScore,
	evaluateSetupEligibility,
	QUALITY_SCORE_BANDS,
	QUALITY_SCORE_MAX,
	QUALITY_SCORE_MIN,
	scoreSetupQuality
} from './engine.js';
export type {
	EligibilityFailure,
	EligibilityInput,
	EligibilityResult,
	QualityScoreResult,
	QualityScoringInput,
	SetupClassification
} from './engine.js';
export type { SetupReason } from './models.js';
