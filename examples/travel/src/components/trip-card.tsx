import { memo } from "react";
import { Link } from "react-router-dom";
import type { Trip } from "../data/types";
import { DestinationCover } from "./destination-cover";
import { CountdownChip } from "./countdown-chip";
import { fmtDateShort, daysBetween } from "../lib/format";

function TripCardImpl({ trip }: { trip: Trip }) {
  const days = daysBetween(trip.startDate, trip.endDate);
  return (
    <Link
      to={`/trips/${trip.id}`}
      className="card interactive trip-card"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="cover" aria-hidden="true">
        <DestinationCover destination={trip.destination} />
      </div>
      <div className="row space-between">
        <h3 className="card-title">{trip.title}</h3>
        <span
          className={`badge ${
            trip.status === "booked" ? "success" : trip.status === "planned" ? "accent" : ""
          }`}
        >
          {trip.status}
        </span>
      </div>
      <div className="destinations">{trip.destination}</div>
      <div className="card-meta">
        <span>
          {fmtDateShort(trip.startDate)} → {fmtDateShort(trip.endDate)}
        </span>
        <span>·</span>
        <span>
          {days} {days === 1 ? "day" : "days"}
        </span>
        <span>·</span>
        <span>
          {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}
        </span>
      </div>
      <div className="row" style={{ marginTop: "auto" }}>
        <CountdownChip startDate={trip.startDate} endDate={trip.endDate} />
      </div>
    </Link>
  );
}

export const TripCard = memo(TripCardImpl);
