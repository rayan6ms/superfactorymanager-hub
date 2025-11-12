"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CodeBox } from "@/components/CodeBox";
import { Card, Button } from "@/components/ui";

const MAX_IMAGE_MB = 5;

type Matrix = { byGame: Record<string, string[]>; gameVersions: string[] };

export default function NewPostForm() {
  const r = useRouter();

  const [matrix, setMatrix] = useState<Matrix>({ byGame: {}, gameVersions: [] });
  const [form, setForm] = useState({
    title: "", gameVersion: "", modVersion: "", categoryKey: "",
    description: "", code: "", youtubeUrl: ""
  });
  const [depsInput, setDepsInput] = useState("");
  const [deps, setDeps] = useState<{ url: string; name: string }[]>([]);
  const [depError, setDepError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const change = (k: string, v: any) => setForm(s => ({ ...s, [k]: v }));

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/meta/sfm/versions");
      const data = await res.json();
      setMatrix(data);
    })();
  }, []);

  const modOptions = useMemo(
    () => (form.gameVersion ? (matrix.byGame[form.gameVersion] || []) : []),
    [form.gameVersion, matrix]
  );

  useEffect(() => { change("modVersion", "") }, [form.gameVersion]);

  useEffect(() => {
    setPreviews([]);
    const arr = files ? Array.from(files) : [];
    const bad = arr.find(f => f.size > MAX_IMAGE_MB * 1024 * 1024);
    setErrors(e => ({ ...e, images: bad ? `Each image must be ≤ ${MAX_IMAGE_MB}MB` : null }));
    if (!arr.length) return;
    const urls = arr.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  const ytOk = useMemo(() => {
    if (!form.youtubeUrl) return true;
    const r = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    return r.test(form.youtubeUrl);
  }, [form.youtubeUrl]);

  const addDep = async () => {
    const raw = depsInput.trim();
    setDepError(null);
    if (!raw) return;

    let url: URL;
    try { url = new URL(raw); } catch { setDepError("Invalid URL"); return; }
    if (!(url.hostname.includes("curseforge.com") || url.hostname.includes("modrinth.com"))) {
      setDepError("Must be a CurseForge or Modrinth link");
      return;
    }
    const res = await fetch(`/api/meta/dep/resolve?url=${encodeURIComponent(url.toString())}`);
    const data = await res.json();
    if (!res.ok) { setDepError(data.error || "Could not resolve"); return; }

    if (deps.find(d => d.url === url.toString())) { setDepsInput(""); return; }
    setDeps(d => [...d, { url: url.toString(), name: data.name }]);
    setDepsInput("");
  };

  const removeDep = (u: string) => setDeps(ds => ds.filter(d => d.url !== u));

  const submit = async () => {
    const errs: Record<string, string | null> = {};
    if (!form.title.trim()) errs.title = "Title required";
    if (!form.gameVersion) errs.gameVersion = "Choose game version";
    if (!form.modVersion) errs.modVersion = "Choose mod version";
    if (form.gameVersion && (!matrix.byGame[form.gameVersion] || !matrix.byGame[form.gameVersion].includes(form.modVersion))) {
      errs.modVersion = "Mod version not compatible with this game version";
    }
    if (!form.categoryKey.trim()) errs.categoryKey = "Category required";
    if (!form.description.trim()) errs.description = "Description required";
    if (!form.code.trim()) errs.code = "Code required";
    if (form.youtubeUrl && !ytOk) errs.youtubeUrl = "Invalid YouTube URL";
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;

    try {
      setLoading(true);
      const body = {
        title: form.title,
        gameVersion: form.gameVersion,
        modVersion: form.modVersion,
        categoryKey: form.categoryKey,
        dependencies: deps.map(d => d.url),
        images: [],
        code: form.code,
        description: form.description,
        youtubeUrl: form.youtubeUrl,
      };
      const res = await fetch("/api/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Failed"); setLoading(false); return; }

      if (files?.length) {
        for (const f of Array.from(files)) {
          const fd = new FormData();
          fd.append("file", f);
          await fetch(`/api/uploads/${data.id}`, { method: "POST", body: fd });
        }
      }
      r.push(`/posts/${data.slug}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Card className="space-y-3">
        <input
          className="w-full"
          placeholder="Title"
          value={form.title}
          onChange={e => change("title", e.target.value)}
        />
        {errors.title && <p className="text-red-400 text-sm">{errors.title}</p>}

        <div className="grid grid-cols-2 gap-2">
          <select
            className="border p-2"
            value={form.gameVersion}
            onChange={e => change("gameVersion", e.target.value)}
          >
            <option value="">Select Minecraft version…</option>
            {matrix.gameVersions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            className="border p-2"
            value={form.modVersion}
            disabled={!form.gameVersion}
            onChange={e => change("modVersion", e.target.value)}
          >
            <option value="">{form.gameVersion ? "Select SFM mod version…" : "Select Minecraft first"}</option>
            {modOptions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </Card>
      {errors.gameVersion && <p className="text-red-600 text-sm">{errors.gameVersion}</p>}
      {errors.modVersion && <p className="text-red-600 text-sm">{errors.modVersion}</p>}

      <input
        className="border p-2"
        placeholder="Category key"
        value={form.categoryKey}
        onChange={e => change("categoryKey", e.target.value)}
      />
      {errors.categoryKey && <p className="text-red-600 text-sm">{errors.categoryKey}</p>}

      <Card className="space-y-2">
        <div className="font-medium">Dependencies (optional)</div>
        <div className="flex gap-2">
          <input
            className="w-full"
            placeholder="Paste CurseForge or Modrinth URL"
            value={depsInput}
            onChange={e => setDepsInput(e.target.value)}
          />
          <Button variant="outline" onClick={addDep}>Add</Button>
        </div>
        {depError && <p className="text-red-600 text-sm">{depError}</p>}
        {!!deps.length && (
          <div className="flex flex-wrap gap-2">
            {deps.map(d => (
              <a key={d.url} href={d.url} target="_blank" className="inline-flex items-center gap-2 border rounded px-2 py-1 text-sm underline">
                {d.name}
                <button type="button" onClick={(e) => { e.preventDefault(); removeDep(d.url); }} className="no-underline text-xs border px-1 rounded">×</button>
              </a>
            ))}
          </div>
        )}
      </Card>

      <textarea className="border p-2 w-full h-24" placeholder="Description"
        value={form.description} onChange={e => change("description", e.target.value)} />
      {errors.description && <p className="text-red-600 text-sm">{errors.description}</p>}

      <div>
        <div className="text-sm mb-1">Code</div>
        <CodeBox value={form.code} onChange={(v) => change("code", v)} />
      </div>
      {errors.code && <p className="text-red-600 text-sm">{errors.code}</p>}

      <div className="grid grid-cols-2 gap-2">
        <input className="border p-2" placeholder="YouTube URL (optional)"
          value={form.youtubeUrl} onChange={e => change("youtubeUrl", e.target.value)} />
      </div>
      {!ytOk && <p className="text-red-600 text-sm">Invalid YouTube URL</p>}

      <Card className="space-y-2">
        <div className="font-medium">Images (max {MAX_IMAGE_MB}MB each)</div>
        <input type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} />
        {errors.images && <p className="text-red-600 text-sm">{errors.images}</p>}
        {!!previews.length && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-video border rounded overflow-hidden">
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Button disabled={loading} onClick={submit}>
        {loading ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
