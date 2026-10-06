import { confidenceLevel, type ConfidenceLevel } from '../review';

const SEGMENTS = 20;

const LEVELS: Record<ConfidenceLevel, { label: string; advice: string }> = {
  high: { label: 'High', advice: 'The photo read cleanly. A quick check should do.' },
  medium: { label: 'Medium', advice: 'Parts were unclear. Check each field against the photo.' },
  low: { label: 'Low', advice: 'The photo was hard to read. Check every field carefully.' },
};

interface ConfidenceMeterProps {
  /** Between 0 and 1, or null when there is no reading to be confident about. */
  score: number | null;
}

/**
 * The model's confidence, printed as a row of segments like a till's signal meter.
 *
 * The bar is decoration: the percentage and the advice under it say the same thing in words, so
 * nothing depends on telling the colours apart.
 */
export function ConfidenceMeter({ score }: ConfidenceMeterProps) {
  if (score === null) {
    return (
      <div className="confidence" data-level="unknown">
        <p className="confidence-head">
          <span>Model confidence</span>
          <span className="confidence-value">Not reported</span>
        </p>
      </div>
    );
  }

  const clamped = Math.min(1, Math.max(0, score));
  const level = confidenceLevel(clamped);
  const lit = Math.round(clamped * SEGMENTS);

  return (
    <div className="confidence" data-level={level}>
      <p className="confidence-head">
        <span>Model confidence</span>
        <span className="confidence-value">
          {Math.round(clamped * 100)}% · {LEVELS[level].label}
        </span>
      </p>
      <div className="confidence-bar" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span key={index} data-lit={index < lit || undefined} />
        ))}
      </div>
      <p className="confidence-advice">{LEVELS[level].advice}</p>
    </div>
  );
}
