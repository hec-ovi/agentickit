import { z } from "zod";

export const flightSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  date: z.string(),
  airline: z.string(),
  departTime: z.string(),
  arriveTime: z.string(),
  durationMin: z.number(),
  stops: z.number(),
  price: z.number(),
});
export type Flight = z.infer<typeof flightSchema>;

export const hotelSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  rating: z.number(),
  pricePerNight: z.number(),
  amenities: z.array(z.string()),
});
export type Hotel = z.infer<typeof hotelSchema>;

export const activitySchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  category: z.enum(["food", "culture", "nature", "shopping", "nightlife"]),
  durationMin: z.number(),
  cost: z.number(),
});
export type Activity = z.infer<typeof activitySchema>;

export const weatherDaySchema = z.object({
  date: z.string(),
  highC: z.number(),
  lowC: z.number(),
  summary: z.string(),
});
export type WeatherDay = z.infer<typeof weatherDaySchema>;

export const dayItemSchema = z.object({
  id: z.string(),
  time: z.string(),
  title: z.string(),
  kind: z.enum(["flight", "hotel", "activity", "free"]),
  refId: z.string().optional(),
});
export type DayItem = z.infer<typeof dayItemSchema>;

export const itineraryDaySchema = z.object({
  date: z.string(),
  items: z.array(dayItemSchema),
});
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;

export const packingItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  packed: z.boolean(),
});
export type PackingItem = z.infer<typeof packingItemSchema>;

export const tripSchema = z.object({
  id: z.string(),
  title: z.string(),
  destination: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  travelers: z.number().int().positive(),
  status: z.enum(["draft", "planned", "booked"]),
  budgetTotal: z.number(),
  itinerary: z.array(itineraryDaySchema),
  flights: z.array(flightSchema.extend({ booked: z.boolean() })),
  hotels: z.array(hotelSchema.extend({ booked: z.boolean(), nights: z.number() })),
  activities: z.array(activitySchema.extend({ booked: z.boolean(), date: z.string() })),
  packing: z.array(packingItemSchema),
});
export type Trip = z.infer<typeof tripSchema>;

export const preferencesSchema = z.object({
  homeAirport: z.string(),
  currency: z.enum(["USD", "EUR", "GBP", "JPY"]),
  dietary: z.array(z.enum(["vegetarian", "vegan", "gluten-free", "halal", "kosher", "none"])),
  mobility: z.enum(["high", "medium", "low"]),
  language: z.string(),
});
export type Preferences = z.infer<typeof preferencesSchema>;
