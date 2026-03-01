interface PropertyHomeButtonProps {
  onClick: () => void;
}

export function PropertyHomeButton({ onClick }: PropertyHomeButtonProps) {
  return (
    <button
      type="button"
      className="bh-property-home-button"
      onClick={onClick}
      aria-label="Home"
    >
      <CaretLeftIcon />
      <span>Home</span>
    </button>
  );
}

function CaretLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.72 5.22a1 1 0 0 1 .06 1.41L9.42 12l5.36 5.37a1 1 0 0 1-1.41 1.41l-6.07-6.07a1 1 0 0 1 0-1.42l6.07-6.07a1 1 0 0 1 1.35 0Z"
        fill="currentColor"
      />
    </svg>
  );
}
