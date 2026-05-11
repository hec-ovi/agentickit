import type { Preferences, Trip } from "./types";

export const SEED_TRIPS: Trip[] = [
  {
    id: "tokyo-may",
    title: "Tokyo, late spring",
    destination: "Tokyo, Japan",
    startDate: "2026-05-15",
    endDate: "2026-05-22",
    travelers: 2,
    status: "draft",
    budgetTotal: 4200,
    itinerary: [
      {
        date: "2026-05-15",
        items: [
          { id: "i1", time: "10:30", title: "SFO to HND on JL001", kind: "flight" },
          { id: "i2", time: "16:00", title: "Check in: Park Hyatt Tokyo", kind: "hotel" },
          { id: "i3", time: "19:00", title: "Dinner in Shinjuku", kind: "free" },
        ],
      },
      {
        date: "2026-05-16",
        items: [
          { id: "i4", time: "09:00", title: "Tsukiji food walk", kind: "activity" },
          { id: "i5", time: "14:00", title: "Senso-ji + Asakusa walk", kind: "activity" },
          { id: "i6", time: "20:00", title: "Free evening", kind: "free" },
        ],
      },
      {
        date: "2026-05-17",
        items: [
          { id: "i7", time: "10:00", title: "teamLab Borderless", kind: "activity" },
          { id: "i8", time: "16:00", title: "Shibuya crossing + cafe", kind: "free" },
        ],
      },
    ],
    flights: [],
    hotels: [],
    packing: [
      { id: "p1", text: "Passport", packed: true },
      { id: "p2", text: "Pocket WiFi voucher", packed: false },
      { id: "p3", text: "Light jacket", packed: false },
      { id: "p4", text: "Walking shoes", packed: true },
      { id: "p5", text: "Universal adapter", packed: false },
    ],
  },
  {
    id: "lisbon-summer",
    title: "Lisbon long weekend",
    destination: "Lisbon, Portugal",
    startDate: "2026-06-12",
    endDate: "2026-06-15",
    travelers: 2,
    status: "planned",
    budgetTotal: 1800,
    itinerary: [
      {
        date: "2026-06-12",
        items: [
          { id: "li1", time: "12:30", title: "JFK to LIS on TP204", kind: "flight" },
          { id: "li2", time: "20:00", title: "Check in: Memmo Alfama", kind: "hotel" },
        ],
      },
      {
        date: "2026-06-13",
        items: [
          { id: "li3", time: "09:30", title: "Tram 28 + Alfama wander", kind: "activity" },
          { id: "li4", time: "14:00", title: "Pastel de nata in Belem", kind: "activity" },
          { id: "li5", time: "21:00", title: "Fado night in Bairro Alto", kind: "activity" },
        ],
      },
      {
        date: "2026-06-14",
        items: [
          { id: "li6", time: "08:00", title: "Sintra day trip", kind: "activity" },
          { id: "li7", time: "20:00", title: "Time Out Market food crawl", kind: "activity" },
        ],
      },
    ],
    flights: [
      {
        id: "f-jfk-lis-2026-06-12",
        from: "JFK",
        to: "LIS",
        date: "2026-06-12",
        airline: "TAP Portugal TP204",
        departTime: "12:30",
        arriveTime: "23:50",
        durationMin: 380,
        stops: 0,
        price: 540,
        booked: true,
      },
    ],
    hotels: [
      {
        id: "h-LIS-1",
        name: "Memmo Alfama",
        city: "Lisbon",
        rating: 4.6,
        pricePerNight: 260,
        amenities: ["wifi", "view", "pool"],
        booked: true,
        nights: 3,
      },
    ],
    packing: [
      { id: "lp1", text: "Passport", packed: true },
      { id: "lp2", text: "Sunscreen", packed: false },
      { id: "lp3", text: "Comfortable sandals", packed: false },
    ],
  },
  {
    id: "reykjavik-aurora",
    title: "Reykjavik aurora hunt",
    destination: "Reykjavik, Iceland",
    startDate: "2026-11-04",
    endDate: "2026-11-09",
    travelers: 2,
    status: "draft",
    budgetTotal: 3600,
    itinerary: [
      {
        date: "2026-11-04",
        items: [
          { id: "ri1", time: "21:30", title: "JFK to KEF on FI616", kind: "flight" },
        ],
      },
      {
        date: "2026-11-05",
        items: [
          { id: "ri2", time: "10:00", title: "Hallgrimskirkja + downtown walk", kind: "activity" },
          { id: "ri3", time: "21:00", title: "Northern Lights chase", kind: "activity" },
        ],
      },
    ],
    flights: [],
    hotels: [],
    packing: [
      { id: "rp1", text: "Thermal layers", packed: false },
      { id: "rp2", text: "Waterproof boots", packed: false },
      { id: "rp3", text: "Swimsuit (Blue Lagoon)", packed: false },
    ],
  },
  {
    id: "buenos-aires-tango",
    title: "Buenos Aires + tango",
    destination: "Buenos Aires, Argentina",
    startDate: "2026-09-18",
    endDate: "2026-09-26",
    travelers: 2,
    status: "booked",
    budgetTotal: 4900,
    itinerary: [
      {
        date: "2026-09-18",
        items: [
          { id: "ba1", time: "21:30", title: "JFK to EZE on AR1301", kind: "flight" },
        ],
      },
      {
        date: "2026-09-19",
        items: [
          { id: "ba2", time: "12:00", title: "Check in: Faena Hotel", kind: "hotel" },
          { id: "ba3", time: "20:00", title: "Steakhouse parrilla in Palermo", kind: "activity" },
        ],
      },
      {
        date: "2026-09-20",
        items: [
          { id: "ba4", time: "10:00", title: "Recoleta cemetery + cafes", kind: "activity" },
          { id: "ba5", time: "21:00", title: "Tango milonga night", kind: "activity" },
        ],
      },
      {
        date: "2026-09-21",
        items: [
          { id: "ba6", time: "10:30", title: "San Telmo Sunday market", kind: "activity" },
        ],
      },
    ],
    flights: [
      {
        id: "f-jfk-eze-2026-09-18",
        from: "JFK",
        to: "EZE",
        date: "2026-09-18",
        airline: "Aerolineas Argentinas AR1301",
        departTime: "21:30",
        arriveTime: "10:45",
        durationMin: 645,
        stops: 0,
        price: 980,
        booked: true,
      },
    ],
    hotels: [
      {
        id: "h-EZE-1",
        name: "Faena Hotel",
        city: "Buenos Aires",
        rating: 4.6,
        pricePerNight: 360,
        amenities: ["wifi", "design", "river-view"],
        booked: true,
        nights: 7,
      },
    ],
    packing: [
      { id: "bap1", text: "Passport", packed: true },
      { id: "bap2", text: "Spring jacket", packed: true },
      { id: "bap3", text: "Dress shoes", packed: false },
    ],
  },
  {
    id: "kyoto-fall",
    title: "Kyoto for koyo",
    destination: "Kyoto, Japan",
    startDate: "2026-11-20",
    endDate: "2026-11-27",
    travelers: 2,
    status: "draft",
    budgetTotal: 5200,
    itinerary: [
      {
        date: "2026-11-21",
        items: [
          { id: "ky1", time: "06:30", title: "Fushimi Inari sunrise", kind: "activity" },
          { id: "ky2", time: "13:00", title: "Nishiki food market", kind: "activity" },
        ],
      },
    ],
    flights: [],
    hotels: [],
    packing: [
      { id: "kyp1", text: "Comfortable walking shoes", packed: false },
      { id: "kyp2", text: "Light raincoat", packed: false },
    ],
  },
];

export const SEED_PREFERENCES: Preferences = {
  homeAirport: "JFK",
  currency: "USD",
  dietary: ["none"],
  mobility: "high",
  language: "English",
};
