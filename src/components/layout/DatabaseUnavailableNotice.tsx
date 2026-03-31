import Card from "@/components/ui/Card";

export default function DatabaseUnavailableNotice() {
  return (
    <Card className="border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-50">
      Some database-backed content is temporarily unavailable while the Prisma service is offline.
      Public pages will keep loading with reduced data until connectivity is restored.
    </Card>
  );
}
