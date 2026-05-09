import { useEffect, useState } from "react";
import { fetchWeather } from "../plugins/weather";
import type { WeatherDay } from "../data/types";

interface WeatherStripProps {
  city: string;
  startDate?: string;
  days?: number;
}

interface WeatherState {
  status: "loading" | "ready" | "error";
  source?: "openweather" | "mock";
  days?: WeatherDay[];
}

function fmt(date: string): { dow: string; dom: number } {
  const d = new Date(date);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
    dom: d.getDate(),
  };
}

function summaryGlyph(summary: string): string {
  const s = summary.toLowerCase();
  if (s.includes("rain") || s.includes("shower")) return "☂";
  if (s.includes("snow")) return "❄";
  if (s.includes("clear") || s.includes("sunny") || s.includes("bright")) return "☀";
  if (s.includes("cloud") || s.includes("overcast")) return "☁";
  if (s.includes("fog") || s.includes("mist")) return "≈";
  if (s.includes("storm") || s.includes("thunder")) return "⚡";
  return "◐";
}

export function WeatherStrip({ city, startDate, days = 7 }: WeatherStripProps) {
  const [state, setState] = useState<WeatherState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchWeather(city, days, startDate).then((res) => {
      if (cancelled) return;
      if (!res) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", source: res.source, days: res.days });
    });
    return () => {
      cancelled = true;
    };
  }, [city, startDate, days]);

  if (state.status === "loading") {
    return (
      <div className="weather-strip" aria-label="Weather forecast loading">
        {Array.from({ length: days }, (_, i) => (
          <div key={i} className="weather-day skeleton" aria-hidden="true">
            <span className="weather-dow">&nbsp;</span>
            <span className="weather-dom">&nbsp;</span>
            <span className="weather-glyph">&nbsp;</span>
            <span className="weather-temps">&nbsp;</span>
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error" || !state.days) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Weather lookup failed. The forecast will retry on the next destination change.
      </p>
    );
  }

  return (
    <div className="weather-strip" aria-label={`${days}-day forecast for ${city}`}>
      {state.days.map((day) => {
        const { dow, dom } = fmt(day.date);
        return (
          <div key={day.date} className="weather-day" title={day.summary}>
            <span className="weather-dow">{dow}</span>
            <span className="weather-dom">{dom}</span>
            <span className="weather-glyph" aria-hidden="true">
              {summaryGlyph(day.summary)}
            </span>
            <span className="weather-temps">
              {Math.round(day.highC)}° <span className="weather-low">{Math.round(day.lowC)}°</span>
            </span>
          </div>
        );
      })}
      <div className="weather-source">
        <span className="badge">{state.source === "openweather" ? "live" : "mock"}</span>
      </div>
    </div>
  );
}
