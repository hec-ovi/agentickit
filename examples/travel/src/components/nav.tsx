import { memo } from "react";
import { NavLink } from "react-router-dom";
import { ThemeToggle } from "./theme-toggle";

const LINKS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Trips", end: true },
  { to: "/preferences", label: "Preferences" },
  { to: "/agents", label: "Agents" },
];

function NavImpl() {
  return (
    <header className="top-nav" role="banner">
      <NavLink to="/" className="brand" aria-label="agentickit travel home">
        <span className="dot" aria-hidden="true" />
        <span>agentickit travel</span>
      </NavLink>
      <nav className="links" aria-label="primary">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="spacer" />
      <span className="ai-status" aria-label="AI assistant online">
        <span className="ai-dot" aria-hidden="true" />
        AI online
      </span>
      <ThemeToggle />
    </header>
  );
}

export const Nav = memo(NavImpl);
