/**
 * City catalog. Each entry seeds the mock-search functions and the
 * destination-cover SVG. New cities just need an entry here.
 */

export interface CitySpec {
  name: string;
  country: string;
  airportCode: string;
  /** Coordinates (rough; only used for deterministic weather seeding). */
  lat: number;
  /** Hex pair for the destination cover gradient. */
  palette: [string, string];
  /** Best-known activities, used by the AI tools. */
  activities: ReadonlyArray<{
    name: string;
    category: "food" | "culture" | "nature" | "shopping" | "nightlife";
    durationMin: number;
    cost: number;
  }>;
  /** Hotel templates for this city. */
  hotels: ReadonlyArray<{ name: string; rating: number; pricePerNight: number; amenities: string[] }>;
  /** Common airlines flying into this airport with realistic flight prefixes. */
  airlines: ReadonlyArray<{ code: string; name: string }>;
}

export const CITIES: ReadonlyArray<CitySpec> = [
  {
    name: "Tokyo",
    country: "Japan",
    airportCode: "HND",
    lat: 35.6762,
    palette: ["#fb7185", "#0e7490"],
    activities: [
      { name: "Tsukiji food walk", category: "food", durationMin: 180, cost: 65 },
      { name: "teamLab Borderless", category: "culture", durationMin: 240, cost: 38 },
      { name: "Shinjuku at night", category: "nightlife", durationMin: 180, cost: 0 },
      { name: "Mt Takao day hike", category: "nature", durationMin: 360, cost: 25 },
      { name: "Ginza shopping", category: "shopping", durationMin: 180, cost: 0 },
      { name: "Senso-ji + Asakusa walk", category: "culture", durationMin: 150, cost: 0 },
      { name: "Robot izakaya tour", category: "nightlife", durationMin: 150, cost: 95 },
    ],
    hotels: [
      { name: "Park Hyatt Tokyo", rating: 4.8, pricePerNight: 580, amenities: ["wifi", "spa", "view"] },
      { name: "The Tokyo Edition Toranomon", rating: 4.7, pricePerNight: 520, amenities: ["wifi", "rooftop", "gym"] },
      { name: "Hoshinoya Tokyo", rating: 4.9, pricePerNight: 720, amenities: ["wifi", "onsen", "ryokan"] },
      { name: "Nine Hours Akihabara", rating: 4.2, pricePerNight: 65, amenities: ["wifi", "capsule"] },
    ],
    airlines: [
      { code: "JL", name: "Japan Airlines" },
      { code: "NH", name: "ANA" },
      { code: "UA", name: "United" },
    ],
  },
  {
    name: "Kyoto",
    country: "Japan",
    airportCode: "KIX",
    lat: 35.0116,
    palette: ["#f59e0b", "#7c2d12"],
    activities: [
      { name: "Fushimi Inari sunrise", category: "culture", durationMin: 180, cost: 0 },
      { name: "Arashiyama bamboo + monkey park", category: "nature", durationMin: 240, cost: 12 },
      { name: "Nishiki food market", category: "food", durationMin: 120, cost: 35 },
      { name: "Kaiseki dinner in Gion", category: "food", durationMin: 180, cost: 180 },
      { name: "Tea ceremony", category: "culture", durationMin: 90, cost: 45 },
      { name: "Pontocho evening stroll", category: "nightlife", durationMin: 120, cost: 0 },
    ],
    hotels: [
      { name: "The Ritz-Carlton Kyoto", rating: 4.9, pricePerNight: 920, amenities: ["wifi", "spa", "river-view"] },
      { name: "Hoshinoya Kyoto", rating: 4.9, pricePerNight: 850, amenities: ["wifi", "onsen", "ryokan"] },
      { name: "Hotel Kanra Kyoto", rating: 4.6, pricePerNight: 360, amenities: ["wifi", "spa", "tatami"] },
    ],
    airlines: [
      { code: "JL", name: "Japan Airlines" },
      { code: "NH", name: "ANA" },
    ],
  },
  {
    name: "Lisbon",
    country: "Portugal",
    airportCode: "LIS",
    lat: 38.7169,
    palette: ["#0ea5e9", "#facc15"],
    activities: [
      { name: "Tram 28 + Alfama wander", category: "culture", durationMin: 180, cost: 4 },
      { name: "Pastel de nata in Belém", category: "food", durationMin: 60, cost: 8 },
      { name: "LX Factory + sunset", category: "shopping", durationMin: 180, cost: 0 },
      { name: "Sintra day trip", category: "nature", durationMin: 480, cost: 50 },
      { name: "Fado night in Bairro Alto", category: "nightlife", durationMin: 180, cost: 60 },
      { name: "Time Out Market food crawl", category: "food", durationMin: 180, cost: 50 },
    ],
    hotels: [
      { name: "Bairro Alto Hotel", rating: 4.7, pricePerNight: 320, amenities: ["wifi", "rooftop", "central"] },
      { name: "Memmo Alfama", rating: 4.6, pricePerNight: 260, amenities: ["wifi", "view", "pool"] },
      { name: "The Vintage Lisboa", rating: 4.5, pricePerNight: 220, amenities: ["wifi", "spa", "boutique"] },
    ],
    airlines: [
      { code: "TP", name: "TAP Portugal" },
      { code: "AA", name: "American" },
      { code: "BA", name: "British Airways" },
    ],
  },
  {
    name: "Reykjavik",
    country: "Iceland",
    airportCode: "KEF",
    lat: 64.1466,
    palette: ["#67e8f9", "#1e3a8a"],
    activities: [
      { name: "Golden Circle drive", category: "nature", durationMin: 540, cost: 90 },
      { name: "Blue Lagoon soak", category: "nature", durationMin: 240, cost: 110 },
      { name: "Northern Lights chase", category: "nature", durationMin: 300, cost: 95 },
      { name: "Harpa concert hall tour", category: "culture", durationMin: 90, cost: 22 },
      { name: "Hallgrimskirkja + downtown walk", category: "culture", durationMin: 120, cost: 0 },
      { name: "Glacier hike at Sólheimajökull", category: "nature", durationMin: 360, cost: 140 },
    ],
    hotels: [
      { name: "The Reykjavik EDITION", rating: 4.7, pricePerNight: 480, amenities: ["wifi", "harbor-view", "spa"] },
      { name: "Hotel Borg by Keahotels", rating: 4.5, pricePerNight: 320, amenities: ["wifi", "art-deco", "central"] },
      { name: "Ion City Hotel", rating: 4.4, pricePerNight: 280, amenities: ["wifi", "design", "central"] },
    ],
    airlines: [
      { code: "FI", name: "Icelandair" },
      { code: "DL", name: "Delta" },
    ],
  },
  {
    name: "Buenos Aires",
    country: "Argentina",
    airportCode: "EZE",
    lat: -34.6037,
    palette: ["#ef4444", "#1e40af"],
    activities: [
      { name: "Recoleta cemetery + cafés", category: "culture", durationMin: 180, cost: 8 },
      { name: "Steakhouse parrilla in Palermo", category: "food", durationMin: 180, cost: 70 },
      { name: "Tango milonga night", category: "nightlife", durationMin: 240, cost: 45 },
      { name: "San Telmo Sunday market", category: "shopping", durationMin: 240, cost: 0 },
      { name: "Tigre delta day trip", category: "nature", durationMin: 360, cost: 55 },
      { name: "MALBA + Palermo art walk", category: "culture", durationMin: 180, cost: 12 },
    ],
    hotels: [
      { name: "Park Hyatt Buenos Aires", rating: 4.8, pricePerNight: 420, amenities: ["wifi", "spa", "garden"] },
      { name: "Faena Hotel", rating: 4.6, pricePerNight: 360, amenities: ["wifi", "design", "river-view"] },
      { name: "Casa Lucia", rating: 4.5, pricePerNight: 240, amenities: ["wifi", "rooftop", "boutique"] },
    ],
    airlines: [
      { code: "AR", name: "Aerolineas Argentinas" },
      { code: "AA", name: "American" },
      { code: "LA", name: "LATAM" },
    ],
  },
];

export function findCity(name: string): CitySpec | undefined {
  const needle = name.trim().toLowerCase();
  return CITIES.find(
    (c) =>
      c.name.toLowerCase() === needle ||
      `${c.name.toLowerCase()}, ${c.country.toLowerCase()}` === needle ||
      c.airportCode.toLowerCase() === needle,
  );
}
