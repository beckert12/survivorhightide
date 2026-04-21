import axios from 'axios';

export class PointsProvider {
  constructor({ apiUrl, apiKey }) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiUrl);
  }

  async searchAwards({ origin, destination, departureDate, returnDate, adults = 1, cabin = 'ECONOMY' }) {
    if (!this.isConfigured()) {
      return [];
    }

    const response = await axios.get(this.apiUrl, {
      params: {
        origin,
        destination,
        departureDate,
        returnDate,
        adults,
        cabin
      },
      headers: this.apiKey
        ? {
            Authorization: `Bearer ${this.apiKey}`
          }
        : {},
      timeout: 20000
    });

    const rawAwards = response.data?.awards || response.data?.data || [];

    return rawAwards.map((award) => ({
      source: 'live-points-api',
      airline: award.airline || award.carrier || 'N/A',
      program: award.program || award.loyaltyProgram || 'Unknown Program',
      points: Number(award.points || award.miles || 0),
      taxesUsd: Number(award.taxesUsd || award.taxes || 0),
      cabin: award.cabin || cabin,
      origin: award.origin || origin,
      destination: award.destination || destination,
      departureDate: award.departureDate || departureDate
    }));
  }
}
