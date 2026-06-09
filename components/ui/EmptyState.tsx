export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-card-lg border border-dashed border-border px-6 py-10 text-center">
      {icon && <span className="text-2xl">{icon}</span>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
