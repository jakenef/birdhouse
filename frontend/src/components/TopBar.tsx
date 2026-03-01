import type { ReactNode } from "react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  leftIcon?: ReactNode;
  leftIconStyle?: "badge" | "standalone";
  rightAction?: ReactNode;
}

export function TopBar({
  title,
  subtitle,
  leftIcon,
  leftIconStyle = "badge",
  rightAction,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__leading">
        {leftIcon && (
          <div
            className={`top-bar__icon ${leftIconStyle === "standalone" ? "top-bar__icon--standalone" : ""}`}
            aria-hidden
          >
            {leftIcon}
          </div>
        )}
        <div className="top-bar__text">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {rightAction ? <div className="top-bar__action">{rightAction}</div> : null}
    </header>
  );
}
