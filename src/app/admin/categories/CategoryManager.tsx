"use client";

import { useMemo, useState, FormEvent } from "react";
import { Trash2, RefreshCw, FolderPlus } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";

type CategorySummary = {
  id: string;
  key: string;
  name: string;
  postCount: number;
};

type Props = {
  initialCategories: CategorySummary[];
};

export default function CategoryManager({ initialCategories }: Props) {
  const [categories, setCategories] = useState<CategorySummary[]>(initialCategories);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Could not create category.");
        return;
      }
      setCategories(prev => [...prev, data.category]);
      setKey("");
      setName("");
      setMessage("Category created.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong while creating the category.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (categoryKey: string) => {
    setDeleteBusy(categoryKey);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: categoryKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Could not delete category.");
        return;
      }
      setCategories(prev => prev.filter(category => category.key !== categoryKey));
      setMessage("Category deleted.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong while deleting the category.");
    } finally {
      setDeleteBusy(null);
    }
  };

  const refreshFromServer = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error || "Could not refresh categories.");
        return;
      }
      setCategories(data.categories ?? []);
      setMessage("List refreshed.");
    } catch (error) {
      console.error(error);
      setMessage("Unable to refresh categories.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <form className="space-y-3" onSubmit={handleCreate}>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Create</p>
            <h2 className="text-lg font-semibold text-white">Add a category</h2>
            <p className="text-sm text-white/60">Provide a unique key and a reader-friendly name.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-white/80">
              Key
              <Input
                value={key}
                onChange={event => setKey(event.target.value)}
                placeholder="automation"
                required
                disabled={busy}
              />
              <p className="text-xs text-white/50">Used internally and must be unique.</p>
            </label>
            <label className="space-y-1 text-sm text-white/80">
              Name
              <Input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Automation"
                required
                disabled={busy}
              />
              <p className="text-xs text-white/50">Visible to users.</p>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              <FolderPlus className="h-4 w-4" />
              Create category
            </Button>
            <Button type="button" variant="outline" onClick={refreshFromServer} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {message && <span className="text-sm text-white/70">{message}</span>}
          </div>
        </form>
      </Card>

      <Card className="divide-y divide-white/10 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Existing categories</h2>
            <p className="text-sm text-white/60">Only empty categories can be removed.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            {sorted.length} total
          </span>
        </div>
        {sorted.length ? (
          <ul className="divide-y divide-white/5">
            {sorted.map(category => (
              <li key={category.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-white/80">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{category.name}</p>
                  <p className="text-xs text-white/60">key: {category.key}</p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
                  {category.postCount} posts
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deleteBusy === category.key || category.postCount > 0}
                  onClick={() => handleDelete(category.key)}
                  className="text-red-200 hover:border-red-400 hover:text-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteBusy === category.key ? "Removing..." : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-white/60">No categories yet.</p>
        )}
      </Card>
    </div>
  );
}
