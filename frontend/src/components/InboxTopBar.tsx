interface InboxTopBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onOpenDrawer: () => void;
}

export function InboxTopBar({
  searchValue,
  onSearchChange,
  onOpenDrawer,
}: InboxTopBarProps) {
  return (
    <header className="bh-inbox-topbar">
      <button
        type="button"
        className="bh-inbox-topbar__menu"
        aria-label="Open mailbox filters"
        onClick={onOpenDrawer}
      >
        <HamburgerIcon />
      </button>

      <input
        type="search"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search in mail"
        aria-label="Search in mail"
      />

      <div className="bh-inbox-topbar__avatar" aria-hidden="true">
        <span>BH</span>
      </div>
    </header>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7.5h16M4 12h16M4 16.5h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
