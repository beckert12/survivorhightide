import axios from 'axios';

const AMADEUS_BASE_URL = 'https://test.api.amadeus.com';

export class AmadeusProvider {
  constructor({ clientId, clientSecret }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.accessTokenExpiry = 0;
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async getToken() {
    if (!this.isConfigured()) {
      throw new Error('Amadeus provider is not configured. Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET.');
    }

    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiry) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    const response = await axios.post(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    });

    this.accessToken = response.data.access_token;
    this.accessTokenExpiry = now + (response.data.expires_in - 30) * 1000;
    return this.accessToken;
  }

  async searchFlights({ origin, destination, departureDate, returnDate, adults = 1, cabin = 'ECONOMY' }) {
    const token = await this.getToken();

    const params = {
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate,
      adults,
      currencyCode: 'USD',
      max: 25,
      travelClass: cabin
    };

    if (returnDate) {
      params.returnDate = returnDate;
    }

    const response = await axios.get(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers`, {
      params,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000
    });

    const offers = response.data.data || [];
    return offers.map((offer) => {
      const firstItinerary = offer.itineraries?.[0];
      const firstSegment = firstItinerary?.segments?.[0];
      const lastSegment = firstItinerary?.segments?.[firstItinerary.segments.length - 1];

      return {
        source: 'amadeus',
        offerId: offer.id,
        validatingAirlineCodes: offer.validatingAirlineCodes || [],
        airline: offer.validatingAirlineCodes?.[0] || firstSegment?.carrierCode || 'N/A',
        totalPrice: Number(offer.price?.grandTotal || 0),
        currency: offer.price?.currency || 'USD',
        origin: firstSegment?.departure?.iataCode || origin,
        destination: lastSegment?.arrival?.iataCode || destination,
        departureAt: firstSegment?.departure?.at || null,
        arrivalAt: lastSegment?.arrival?.at || null,
        stops: Math.max((firstItinerary?.segments?.length || 1) - 1, 0),
        raw: offer
      };
    });
  }
}
