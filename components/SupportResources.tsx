import { Card } from "@/components/ui/Card";

// Always-available, region-appropriate support resources (Pakistan + an
// international directory). Verified current; intentionally NOT the US NEDA
// line (disconnected). Plain presentational — safe in server components.
const RESOURCES: { name: string; detail: string; tel?: string; display: string; href?: string }[] = [
  { name: "Umang (Pakistan)", detail: "24/7 mental-health helpline", tel: "+923117786264", display: "0311-7786264" },
  { name: "Taskeen (Pakistan)", detail: "Free support, Mon–Sat 11am–11pm", tel: "+923168275336", display: "0316-8275336" },
  {
    name: "Find a Helpline (international)",
    detail: "Free, confidential helplines by country",
    href: "https://findahelpline.com",
    display: "findahelpline.com",
  },
];

export function SupportResources() {
  return (
    <Card className="space-y-3 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Get support</p>
        <h2 className="font-display text-lg font-semibold text-foreground">Talking to someone helps</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If food, eating, or how you feel about your body or mood is causing distress, you deserve real
          support. These are free and confidential.
        </p>
      </div>
      <ul className="space-y-2">
        {RESOURCES.map((r) => (
          <li key={r.name} className="rounded-field bg-muted px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">{r.name}</p>
            <p className="text-xs text-muted-foreground">{r.detail}</p>
            <a
              href={r.tel ? `tel:${r.tel}` : r.href}
              target={r.href ? "_blank" : undefined}
              rel={r.href ? "noopener noreferrer" : undefined}
              className="mt-1 inline-block text-sm font-medium text-primary underline"
            >
              {r.display}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">This app is a fitness coach, not a medical service.</p>
    </Card>
  );
}
