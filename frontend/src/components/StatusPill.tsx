export type StatusPillVariant =
  | "blue"
  | "orange"
  | "purple"
  | "red"
  | "green"
  | "gray";

interface StatusPillProps {
  label: string;
  variant: StatusPillVariant;
}

export function StatusPill({ label, variant }: StatusPillProps) {
  return (
    <span className="status-pill" data-variant={variant}>
      {label}
    </span>
  );
}
