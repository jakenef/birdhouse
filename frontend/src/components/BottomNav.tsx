import type { ReactElement } from "react";

export type AppTab = "home" | "alerts" | "settings";

interface BottomNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: Array<{ id: AppTab; label: string; icon: () => ReactElement }> = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "alerts", label: "Alerts", icon: AlertsIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <ul>
        {tabs.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              className={id === activeTab ? "is-active" : ""}
              onClick={() => onTabChange(id)}
              aria-current={id === activeTab ? "page" : undefined}
            >
              <Icon />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 9.75 13 4.2a1.6 1.6 0 0 0-2 0L4 9.75V19a2 2 0 0 0 2 2h4.5v-6h3v6H18a2 2 0 0 0 2-2V9.75Zm-2 9.25h-2.5v-6a2 2 0 0 0-2-2h-3a2 2 0 0 0-2 2v6H6V10.7L12 6l6 4.7V19Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AlertsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3a6 6 0 0 0-6 6v2.8l-1.7 3.4a1.2 1.2 0 0 0 1.08 1.75h13.24a1.2 1.2 0 0 0 1.08-1.75L18 11.8V9a6 6 0 0 0-6-6Zm0 19a3 3 0 0 0 2.65-1.6h-5.3A3 3 0 0 0 12 22Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m20.67 13.47 1.12-.65a1 1 0 0 0 .42-1.3l-1.2-2.08a1 1 0 0 0-1.26-.43l-1.16.46a7.95 7.95 0 0 0-1.36-.8l-.17-1.22A1 1 0 0 0 16.06 6h-2.4a1 1 0 0 0-.99.85l-.17 1.22c-.48.18-.94.45-1.37.79l-1.16-.46a1 1 0 0 0-1.25.43l-1.2 2.08a1 1 0 0 0 .41 1.3l1.13.65c-.04.27-.06.55-.06.84 0 .29.02.57.06.84l-1.13.65a1 1 0 0 0-.41 1.3l1.2 2.08a1 1 0 0 0 1.25.43l1.16-.46c.43.34.89.61 1.37.8l.17 1.21a1 1 0 0 0 .99.86h2.4a1 1 0 0 0 .99-.86l.17-1.21c.47-.19.93-.46 1.36-.8l1.16.46a1 1 0 0 0 1.26-.43l1.2-2.08a1 1 0 0 0-.42-1.3l-1.12-.65c.04-.27.06-.55.06-.84 0-.29-.02-.57-.06-.84ZM12 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
        fill="currentColor"
      />
    </svg>
  );
}
