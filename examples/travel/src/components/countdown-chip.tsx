interface CountdownChipProps {
  startDate: string;
  endDate: string;
}

export function CountdownChip({ startDate, endDate }: CountdownChipProps) {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  if (now > end) {
    return <span className="countdown-chip past">Past trip</span>;
  }

  if (now >= start) {
    const dayOfTrip =
      Math.floor((now - start) / 86400000) + 1;
    const totalDays =
      Math.round((end - start) / 86400000) + 1;
    return (
      <span className="countdown-chip imminent" title={`Day ${dayOfTrip} of ${totalDays}`}>
        Day {dayOfTrip} / {totalDays}
      </span>
    );
  }

  const days = Math.ceil((start - now) / 86400000);
  if (days <= 7) {
    return <span className="countdown-chip imminent">In {days} {days === 1 ? "day" : "days"}</span>;
  }
  if (days <= 60) {
    const weeks = Math.round(days / 7);
    return <span className="countdown-chip">In {weeks} {weeks === 1 ? "week" : "weeks"}</span>;
  }
  const months = Math.round(days / 30);
  return <span className="countdown-chip">In {months} {months === 1 ? "month" : "months"}</span>;
}
