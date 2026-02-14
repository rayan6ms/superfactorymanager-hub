import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { BookOpen, Code2, History, MessagesSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LINKS: Array<{
  title: string;
  description: string;
  Icon: LucideIcon;
  href: string;
  cta: string;
}> = [
    {
      title: "Official guide",
      description: "Want to learn how to use SFM? Try the official guide.",
      Icon: BookOpen,
      href: "/guide",
      cta: "Open",
    },
    {
      title: "Code editor",
      description: "Try making your own code using our editor.",
      Icon: Code2,
      href: "/code-editor",
      cta: "Open",
    },
    {
      title: "Share feedback",
      description: "Tell us what you think or send a suggestion.",
      Icon: MessagesSquare,
      href: "/contact",
      cta: "Contact",
    },
    {
      title: "Latest updates",
      description: "Check updates and the latest features.",
      Icon: History,
      href: "/changelog",
      cta: "View",
    },
  ];

export default function HomeQuickLinks() {
  return (
    <Card className="space-y-3 p-6">
      <div>
        <p className="eyebrow">Discover</p>
        <h2 className="text-2xl font-semibold text-white">Quick links</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {LINKS.map(({ href, title, description, Icon, cta }) => (
          <div
            key={href}
            className="rounded-xl border border-white/10 bg-white/5 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-white/70" aria-hidden="true" />
                  <p className="truncate font-semibold text-white">
                    {title}
                  </p>
                </div>
              </div>

              <Link href={href} className="inline-flex shrink-0">
                <Button size="sm" variant="outline" className="h-8 px-2.5">
                  {cta}
                </Button>
              </Link>
            </div>

            <p className="mt-2 sm:mt-1 text-sm text-white/70">{description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
