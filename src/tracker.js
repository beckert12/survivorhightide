import cron from 'node-cron';
import { appendHistory, loadWatchlist } from './store.js';

function getNext30DayDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function startTracker(searchFn) {
  const run = async () => {
    const watchlist = loadWatchlist();
    const departureDate = getNext30DayDate();

    for (const route of watchlist) {
      try {
        const result = await searchFn({
          origin: route.origin,
          destination: route.destination,
          departureDate,
          returnDate: null,
          cabin: route.cabin || 'ECONOMY',
          adults: route.adults || 1
        });

        appendHistory({
          id: `${route.id}-${Date.now()}`,
          routeId: route.id,
          origin: route.origin,
          destination: route.destination,
          departureDate,
          searchedAt: new Date().toISOString(),
          cheapestCashUsd: result.summary.cheapestCash?.totalPrice || null,
          bestPointsProgram: result.summary.bestPointsValue?.program || null,
          bestPointsCpp: result.summary.bestPointsValue?.valueCentsPerPoint || null,
          pointsDataSource: result.meta.pointsDataSource
        });
      } catch (error) {
        appendHistory({
          id: `${route.id}-${Date.now()}`,
          routeId: route.id,
          origin: route.origin,
          destination: route.destination,
          departureDate,
          searchedAt: new Date().toISOString(),
          error: error.message
        });
      }
    }
  };

  run();
  const interval = process.env.TRACKER_CRON || '*/30 * * * *';
  cron.schedule(interval, run);
}
