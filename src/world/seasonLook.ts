import { DAY_LENGTH, YEAR_DAYS, seasonal, yearPhase } from '../sim/world';

const window01 = (p: number, a: number, b: number, c: number, d: number) => {
  const up = (x: number, e0: number, e1: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  return up(p, a, b) * (1 - up(p, c, d));
};

/**
 * The year's look at a moment (phase 0 = the first morning of spring, autumn from 0.5, winter from
 * 0.75). The dramatic changes happen INSIDE their season — snow settles and melts within winter, the
 * broadleaves drop in late autumn and leaf out as winter ends — so the label and the land agree: a
 * spring morning is green, not half under snow. (Keyed at the season middles, as the ecology's
 * smooth climate curves are, the first day of spring was still half winter.)
 */
export function yearLook(time: number): { tint: [number, number, number]; snow: number; bare: number; turn: number } {
  const p = yearPhase(time);
  // the vegetation tint keyed at each season's START, easing toward the next across the season
  const ahead = time + (DAY_LENGTH * YEAR_DAYS) / 8;
  return {
    tint: [seasonal(ahead, [0.94, 1.06, 1.16, 0.86]), seasonal(ahead, [1.08, 1.0, 0.9, 0.86]), seasonal(ahead, [0.86, 0.78, 0.66, 0.9])],
    snow: 0.9 * window01(p, 0.76, 0.84, 0.93, 0.99),
    bare: window01(p, 0.62, 0.76, 0.93, 1.0),
    turn: window01(p, 0.48, 0.6, 0.78, 0.88),
  };
}
