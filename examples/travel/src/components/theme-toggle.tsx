import { useTheme, type ThemeChoice } from "../theme/theme-provider";

const OPTIONS: ReadonlyArray<{ id: ThemeChoice; label: string; icon: string }> = [
  { id: "light", label: "Light", icon: "☀︎" }, // sun
  { id: "system", label: "System", icon: "◐" }, // half-circle
  { id: "dark", label: "Dark", icon: "☽" }, // moon
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-label={opt.label}
          aria-pressed={choice === opt.id}
          title={opt.label}
          onClick={() => setChoice(opt.id)}
        >
          <span aria-hidden="true">{opt.icon}</span>
        </button>
      ))}
    </div>
  );
}
