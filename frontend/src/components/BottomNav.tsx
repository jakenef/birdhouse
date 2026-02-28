import { Bell, House, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AppTab = "home" | "alerts" | "settings";

interface BottomNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: House },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings },
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
              <Icon size={22} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
