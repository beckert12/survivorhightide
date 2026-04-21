const PROGRAM_CENTS_PER_POINT = {
  'Air Canada Aeroplan': 1.6,
  'Air France/KLM Flying Blue': 1.3,
  'Alaska Mileage Plan': 1.4,
  'American AAdvantage': 1.4,
  'Avianca LifeMiles': 1.4,
  'British Airways Avios': 1.2,
  'Chase Ultimate Rewards': 1.8,
  'Delta SkyMiles': 1.2,
  'JetBlue TrueBlue': 1.3,
  'Southwest Rapid Rewards': 1.3,
  'United MileagePlus': 1.3,
  'Virgin Atlantic Flying Club': 1.5
};

const AIRLINE_TO_PROGRAM = {
  AA: 'American AAdvantage',
  AC: 'Air Canada Aeroplan',
  AF: 'Air France/KLM Flying Blue',
  AS: 'Alaska Mileage Plan',
  B6: 'JetBlue TrueBlue',
  BA: 'British Airways Avios',
  DL: 'Delta SkyMiles',
  UA: 'United MileagePlus',
  VS: 'Virgin Atlantic Flying Club',
  WN: 'Southwest Rapid Rewards'
};

export function estimatePointsFromCash(cashOffers) {
  return cashOffers
    .filter((offer) => offer.totalPrice > 0)
    .map((offer) => {
      const program = AIRLINE_TO_PROGRAM[offer.airline] || 'Chase Ultimate Rewards';
      const centsPerPoint = PROGRAM_CENTS_PER_POINT[program] || 1.3;
      const points = Math.ceil((offer.totalPrice * 100) / centsPerPoint);

      return {
        source: 'estimated-from-cash',
        airline: offer.airline,
        program,
        points,
        taxesUsd: 5.6,
        cabin: 'UNKNOWN',
        origin: offer.origin,
        destination: offer.destination,
        departureDate: offer.departureAt ? offer.departureAt.slice(0, 10) : null,
        estimatedCashEquivalent: offer.totalPrice
      };
    });
}

export function computeValueCentsPerPoint(pointsPrice, matchingCashPrice) {
  if (!pointsPrice || !matchingCashPrice) return null;
  if (pointsPrice.points <= 0) return null;

  const netCash = Math.max(matchingCashPrice - (pointsPrice.taxesUsd || 0), 0);
  return Number(((netCash / pointsPrice.points) * 100).toFixed(2));
}

export function summarizeBestValues(cashOffers, pointsOffers) {
  const cheapestCash = cashOffers.reduce((best, offer) => {
    if (!best || offer.totalPrice < best.totalPrice) return offer;
    return best;
  }, null);

  const airlineToCheapestCash = new Map();
  for (const offer of cashOffers) {
    const current = airlineToCheapestCash.get(offer.airline);
    if (!current || offer.totalPrice < current) {
      airlineToCheapestCash.set(offer.airline, offer.totalPrice);
    }
  }

  const rankedPoints = pointsOffers
    .map((offer) => {
      const matchingCash = airlineToCheapestCash.get(offer.airline) || cheapestCash?.totalPrice;
      const cpp = computeValueCentsPerPoint(offer, matchingCash);

      return {
        ...offer,
        matchingCashUsd: matchingCash || null,
        valueCentsPerPoint: cpp
      };
    })
    .filter((offer) => offer.valueCentsPerPoint !== null)
    .sort((a, b) => b.valueCentsPerPoint - a.valueCentsPerPoint);

  return {
    cheapestCash,
    bestPointsValue: rankedPoints[0] || null,
    rankedPoints
  };
}
