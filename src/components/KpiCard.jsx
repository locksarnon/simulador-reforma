import { Card } from "@/components/ui/card";

export default function KpiCard({ label, value, sub, accent }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-heading font-semibold mt-1.5 ${accent || "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}