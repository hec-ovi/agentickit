import type { Flight, Hotel } from "../data/types";
import { fmtDuration } from "../lib/format";

interface FlightOptionCardProps {
  flight: Flight;
  onPick: () => void;
}

export function FlightOptionCard({ flight, onPick }: FlightOptionCardProps) {
  return (
    <button
      type="button"
      className="option-card"
      onClick={onPick}
      aria-label={`Pick ${flight.airline} ${flight.from} to ${flight.to}, ${flight.departTime}`}
    >
      <div className="summary">
        <span className="primary">
          {flight.airline} {flight.from} → {flight.to}
        </span>
        <span className="secondary">
          {flight.departTime} → {flight.arriveTime} · {fmtDuration(flight.durationMin)} ·{" "}
          {flight.stops === 0 ? "nonstop" : `${flight.stops} stop`}
        </span>
      </div>
      <span className="price">${flight.price}</span>
    </button>
  );
}

interface HotelOptionCardProps {
  hotel: Hotel;
  nights: number;
  onPick: () => void;
}

export function HotelOptionCard({ hotel, nights, onPick }: HotelOptionCardProps) {
  return (
    <button
      type="button"
      className="option-card"
      onClick={onPick}
      aria-label={`Pick ${hotel.name}`}
    >
      <div className="summary">
        <span className="primary">{hotel.name}</span>
        <span className="secondary">
          {"★".repeat(Math.round(hotel.rating))} {hotel.rating.toFixed(1)} ·{" "}
          {hotel.amenities.join(" · ")}
        </span>
      </div>
      <span className="price">
        ${hotel.pricePerNight * nights}
        <br />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          ${hotel.pricePerNight}/night
        </span>
      </span>
    </button>
  );
}
