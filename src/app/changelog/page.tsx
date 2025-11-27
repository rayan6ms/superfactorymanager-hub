import ChangelogList from "@/components/changelog/ChangelogList";
import { getChangelogEntries, refreshChangelog } from "@/lib/changelog";

export default async function ChangelogPage() {
  await refreshChangelog();
  const entries = await getChangelogEntries();

  return (
    <main className="space-y-6 px-4 pb-16 pt-12">
      <div className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Releases</p>
        <h1 className="text-3xl font-semibold text-white">Changelog</h1>
        <p className="text-sm text-white/70">
          Release notes collected directly from GitHub. Newest versions appear first and are marked as latest.
        </p>
      </div>

      <ChangelogList entries={entries} />
    </main>
  );
}
