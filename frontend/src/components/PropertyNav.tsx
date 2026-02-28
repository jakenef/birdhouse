import { FileText, MessageSquareText, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PropertyTab = "pipeline" | "messages" | "documents";

interface PropertyNavProps {
  activeTab: PropertyTab;
  onTabChange: (tab: PropertyTab) => void;
}

const tabs: Array<{ id: PropertyTab; label: string; icon: LucideIcon }> = [
  { id: "pipeline", label: "Pipeline", icon: Workflow },
  { id: "messages", label: "Messages", icon: MessageSquareText },
  { id: "documents", label: "Documents", icon: FileText },
];

export function PropertyNav({ activeTab, onTabChange }: PropertyNavProps) {
  return (
    <nav className="property-nav" aria-label="Property navigation">
      <ul>
        {tabs.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              className={id === activeTab ? "is-active" : ""}
              onClick={() => onTabChange(id)}
              aria-current={id === activeTab ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
