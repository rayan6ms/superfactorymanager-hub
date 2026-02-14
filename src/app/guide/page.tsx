"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";
import { Card, Button } from "@/components/ui";
import { CodeBox } from "@/components/CodeBox";
import { analyzeSfmlCode, type CodeFeedback } from "@/lib/sfml/analysis";
import CopyCodeButton from "@/components/CopyCodeButton";
import { Maximize2, Minimize2 } from "lucide-react";

const CODE_ANALYZE_DEBOUNCE = 350;

type ExampleKey =
  | "a_simple_program"
  | "empty_slots"
  | "forget"
  | "known_issues"
  | "redstone_signals"
  | "tag_matching"
  | "ae2_inscribers"
  | "filtering"
  | "furnace_manager"
  | "limits"
  | "round_robin"
  | "fluids_and_other_resource_types"
  | "if_statements"
  | "redstone_item_movement"
  | "slots_and_sides"
  | "time_triggers";

type ExampleDef = {
  key: ExampleKey;
  label: string;
  file: string;
};

type ExampleState = {
  code: string;
  original: string;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

const EXAMPLES: ExampleDef[] = [
  { key: "a_simple_program", label: "A simple program", file: "/guide/examples/a_simple_program.sfml" },
  { key: "empty_slots", label: "Empty Slots", file: "/guide/examples/empty_slots.sfml" },
  { key: "forget", label: "Forget", file: "/guide/examples/forget.sfml" },
  { key: "known_issues", label: "Known issues", file: "/guide/examples/known_issues.sfml" },
  { key: "redstone_signals", label: "Redstone signals", file: "/guide/examples/redstone_signals.sfml" },
  { key: "tag_matching", label: "Tag matching", file: "/guide/examples/tag_matching.sfml" },
  { key: "ae2_inscribers", label: "AE2 Inscribers", file: "/guide/examples/ae2_inscribers.sfml" },
  { key: "filtering", label: "Filtering", file: "/guide/examples/filtering.sfml" },
  { key: "furnace_manager", label: "Furnace Manager", file: "/guide/examples/furnace_manager.sfml" },
  { key: "limits", label: "Limits", file: "/guide/examples/limits.sfml" },
  { key: "round_robin", label: "Round Robin", file: "/guide/examples/round_robin.sfml" },
  {
    key: "fluids_and_other_resource_types",
    label: "Fluids and other resource types",
    file: "/guide/examples/fluids_and_other_resource_types.sfml",
  },
  { key: "if_statements", label: "IF statements", file: "/guide/examples/if_statements.sfml" },
  { key: "redstone_item_movement", label: "Redstone item movement", file: "/guide/examples/redstone_item_movement.sfml" },
  { key: "slots_and_sides", label: "Slots and sides", file: "/guide/examples/slots_and_sides.sfml" },
  { key: "time_triggers", label: "Time triggers", file: "/guide/examples/time_triggers.sfml" },
];

const EXAMPLES_BY_KEY: Record<ExampleKey, ExampleDef> = EXAMPLES.reduce((acc, ex) => {
  acc[ex.key] = ex;
  return acc;
}, {} as Record<ExampleKey, ExampleDef>);

type TabKey = "examples" | "getting-started" | "basics";

type GuideImageProps = {
  src: string;
  alt: string;
  aspect?: string;
  contain?: boolean;

  collapsedMode?: "inline" | "start";
  collapsedMaxWidthClass?: string;

  sizes?: string;

  allowExpand?: boolean;

  hideButtonWhenExpandedUntilHover?: boolean;

  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
};

type ExpandableGuideImageProps = {
  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
  collapsedMode?: "inline" | "start";
  collapsedMaxWidthClass?: string;
};

function isExpandableGuideImageElement(
  node: React.ReactNode,
): node is React.ReactElement<ExpandableGuideImageProps> {
  return React.isValidElement(node);
}

function GuideImage({
  src,
  alt,
  aspect = "aspect-video",
  contain = true,
  collapsedMode = "start",
  collapsedMaxWidthClass = "max-w-2xl",
  sizes = "(max-width: 768px) 100vw, 900px",
  allowExpand = true,
  hideButtonWhenExpandedUntilHover = true,
  expanded: controlledExpanded,
  onExpandedChange,
}: GuideImageProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const expanded = typeof controlledExpanded === "boolean" ? controlledExpanded : uncontrolled;

  const setExpanded = (next: boolean) => {
    onExpandedChange?.(next);
    if (typeof controlledExpanded !== "boolean") setUncontrolled(next);
  };

  const isGif = src.toLowerCase().endsWith(".gif");

  const containerClass =
    collapsedMode === "inline"
      ? "group relative w-full"
      : clsx("group relative w-full", expanded ? "max-w-none" : collapsedMaxWidthClass);

  return (
    <div className={containerClass}>
      <div className={clsx("relative w-full overflow-hidden rounded-2xl border border-white/15 bg-black/40", aspect)}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={clsx(contain ? "object-contain" : "object-cover")}
          unoptimized={isGif}
        />

        {allowExpand && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Shrink image" : "Expand image"}
            className={clsx(
              "absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full",
              "border border-white/20 bg-black/60 text-white shadow-sm backdrop-blur",
              "transition hover:bg-black/80 hover:border-white/35",
              hideButtonWhenExpandedUntilHover && expanded ? "opacity-0 group-hover:opacity-100" : "opacity-100",
            )}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function GuideStep({
  children,
  image,
  collapsedImageMaxWidthClass = "max-w-2xl",
}: {
  children: React.ReactNode;
  image?: React.ReactNode;
  collapsedImageMaxWidthClass?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-4">
      <div className="text-base leading-relaxed text-white/85">{children}</div>

      {image ? (
        <div className={clsx("w-full", expanded ? "max-w-none" : collapsedImageMaxWidthClass)}>
          {isExpandableGuideImageElement(image)
            ? React.cloneElement(image, {
              expanded,
              onExpandedChange: setExpanded,
              collapsedMode: "start",
              collapsedMaxWidthClass: collapsedImageMaxWidthClass,
            })
            : image}
        </div>
      ) : null}
    </div>
  );
}

export default function GuidePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("examples");
  const [activeExample, setActiveExample] = useState<ExampleKey>("a_simple_program");
  const [wrapLines, setWrapLines] = useState(true);

  const [examplesState, setExamplesState] = useState<Record<ExampleKey, ExampleState>>(() => {
    const initial: Record<ExampleKey, ExampleState> = {} as Record<ExampleKey, ExampleState>;
    EXAMPLES.forEach(ex => {
      initial[ex.key] = { code: "", original: "", loaded: false, loading: false, error: null };
    });
    return initial;
  });

  const [feedback, setFeedback] = useState<CodeFeedback>({
    status: "idle",
    message: null,
    syntaxErrors: [],
    warnings: [],
  });

  const currentExample = examplesState[activeExample];
  const currentCode = currentExample?.code ?? "";
  const isLoaded = currentExample?.loaded;
  const isLoading = currentExample?.loading;
  const currentError = currentExample?.error;

  useEffect(() => {
    if (!activeExample) return;

    const state = examplesState[activeExample];
    if (!state || state.loaded || state.loading) return;

    const def = EXAMPLES_BY_KEY[activeExample];
    if (!def) return;

    setExamplesState(prev => ({
      ...prev,
      [activeExample]: {
        ...prev[activeExample],
        loading: true,
        error: null,
      },
    }));

    (async () => {
      try {
        const res = await fetch(def.file);
        if (!res.ok) throw new Error(`Failed to load example: ${res.status}`);
        const text = await res.text();
        setExamplesState(prev => ({
          ...prev,
          [activeExample]: {
            code: text,
            original: text,
            loaded: true,
            loading: false,
            error: null,
          },
        }));
      } catch (err) {
        console.error(err);
        setExamplesState(prev => ({
          ...prev,
          [activeExample]: {
            ...prev[activeExample],
            loading: false,
            error: "Could not load this example. Please check your installation or try again.",
          },
        }));
      }
    })();
  }, [activeExample, examplesState]);

  useEffect(() => {
    if (!isLoaded) {
      setFeedback({ status: "idle", message: null, syntaxErrors: [], warnings: [] });
      return;
    }

    const timer = window.setTimeout(() => {
      setFeedback(analyzeSfmlCode(currentCode));
    }, CODE_ANALYZE_DEBOUNCE);

    return () => window.clearTimeout(timer);
  }, [currentCode, isLoaded]);

  const errorMarkers = useMemo(
    () => feedback.syntaxErrors.map(err => ({ line: err.lineStart, message: err.message })),
    [feedback.syntaxErrors],
  );

  const warningRanges = useMemo(
    () =>
      feedback.warnings.map(w => ({
        startLine: w.lineStart,
        endLine: w.lineEnd ?? w.lineStart,
        message: w.message,
      })),
    [feedback.warnings],
  );

  const hasError = feedback.status === "error";
  const hasWarnings = feedback.status === "ok" && feedback.warnings.length > 0;

  const handleCodeChange = (next: string) => {
    setExamplesState(prev => ({
      ...prev,
      [activeExample]: {
        ...(prev[activeExample] ?? {
          code: "",
          original: "",
          loaded: true,
          loading: false,
          error: null,
        }),
        code: next,
      },
    }));
  };

  const handleReset = () => {
    const base = examplesState[activeExample];
    if (!base || !base.loaded) return;

    setExamplesState(prev => ({
      ...prev,
      [activeExample]: {
        ...prev[activeExample],
        code: prev[activeExample].original,
      },
    }));
  };

  const renderTabsHeader = () => (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">SuperFactoryManager Guide</h1>
        <p className="text-sm text-white/60">
          Learn the basics of the scripting language and explore practical examples.
        </p>
      </div>
      <div className="inline-flex rounded-full border border-white/15 bg-black/40 p-1 text-sm font-medium">
        {[
          { key: "examples", label: "Examples" },
          { key: "getting-started", label: "Getting Started" },
          { key: "basics", label: "Basics" },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={clsx(
              "rounded-full px-4 py-1.5 transition",
              activeTab === tab.key ? "bg-white text-black shadow-soft" : "text-white/70 hover:text-white",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderExamplesTab = () => (
    <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Examples</h2>
        <p className="text-sm text-white/65">
          These examples cover common SuperFactoryManager patterns. Pick one to load it into the editor, tweak it as you
          like, and copy the result into your manager. Changes stay in your browser until you reload the page or hit
          reset.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map(example => {
          const isActive = example.key === activeExample;
          return (
            <button
              key={example.key}
              type="button"
              onClick={() => setActiveExample(example.key)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                isActive
                  ? "border-brand-400 bg-brand-500 text-white shadow-soft"
                  : "border-white/15 bg-white/5 text-white/75 hover:border-white/30 hover:text-white",
              )}
            >
              {example.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
        <p className="text-white/65">
          {wrapLines
            ? "Long lines wrap into the next row so you never lose sight of your cursor."
            : "Long lines stay on one row. Scroll horizontally to view everything."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <CopyCodeButton value={currentCode} />
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 text-xs font-semibold">
            <button
              type="button"
              aria-pressed={wrapLines}
              onClick={() => setWrapLines(true)}
              className={clsx(
                "rounded-full px-3 py-1.5 transition",
                wrapLines ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
              )}
            >
              Wrap lines
            </button>
            <button
              type="button"
              aria-pressed={!wrapLines}
              onClick={() => setWrapLines(false)}
              className={clsx(
                "rounded-full px-3 py-1.5 transition",
                !wrapLines ? "bg-brand-500 text-white shadow-soft" : "text-white/70 hover:text-white",
              )}
            >
              Horizontal scroll
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isLoaded || currentCode === currentExample?.original}
            onClick={handleReset}
            className="rounded-full"
          >
            Reset example
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20">
        {isLoading && <div className="px-4 py-3 text-sm text-white/70">Loading example code…</div>}
        {currentError && !isLoading && <div className="px-4 py-3 text-sm text-red-200">{currentError}</div>}
        {isLoaded && !isLoading && (
          <CodeBox
            value={currentCode}
            onChange={handleCodeChange}
            wrapLines={wrapLines}
            isInvalid={hasError}
            errorMarkers={errorMarkers}
            warningRanges={warningRanges}
          />
        )}
      </div>

      {(hasError || hasWarnings) && isLoaded && (
        <div className="space-y-2 text-xs text-white/80">
          {hasError && feedback.message && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-100">
              <p className="font-semibold">Syntax issues</p>
              <p className="mt-1">{feedback.message}</p>
              {feedback.syntaxErrors.length > 0 && (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.78rem]">
                  {feedback.syntaxErrors.map((err, idx) => (
                    <li key={`${err.lineStart}-${err.columnStart}-${idx}`}>
                      Line {err.lineStart}
                      {typeof err.columnStart === "number" ? `, column ${err.columnStart + 1}` : ""}
                      {" – "}
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasWarnings && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-100">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.78rem]">
                {feedback.warnings.map((w, idx) => (
                  <li key={`${w.lineStart}-${w.lineEnd}-${idx}`}>
                    Line {w.lineStart}
                    {w.lineEnd && w.lineEnd !== w.lineStart ? `–${w.lineEnd}` : ""}
                    {" – "}
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-white/55">
        Edits are kept in memory while this page stays open. Reloading the page will restore all examples to their
        original versions.
      </p>
    </Card>
  );

  const renderBasicsTab = () => (
    <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Basics</h2>
      </div>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-white">Basics</h3>
        <p className="text-sm text-white/80">
          All inventories must be connected to the manager via inventory cables for them to be usable by the program.
          The manager itself acts as an inventory cable as well.
        </p>
        <p className="text-sm text-white/80">
          Use the label gun to apply or remove labels from blocks in the world. Hold shift while scrolling with the
          label gun in hand to cycle through the loaded labels.
        </p>
        <p className="text-sm text-white/80">
          It&apos;s usually easiest to write your program first, then pull the labels from the program instead of
          manually retyping every label.
        </p>
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/85">An example video of loading scripts and labels into a manager:</p>
          <video controls className="mt-1 w-full max-w-xl rounded-2xl border border-white/15 bg-black/40">
            <source src="guide/basics/sfm_examples.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-white">Details</h3>
        <p className="text-sm text-white/80">
          Keywords are case-insensitive, so{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 text-xs">EVERY</code> and{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 text-xs">every</code> behave the same.
        </p>
        <p className="text-sm text-white/80">
          Super-nerds can read{" "}
          <Link href="https://github.com/TeamDman/SuperFactoryManager/blob/1.18/src/main/antlr/SFML.g">
            the full grammar file
          </Link>{" "}
          for the language if they want to see exactly how everything is parsed.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-white">Triggers</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
          <li>A program consists of an ordered list of triggers.</li>
          <li>Each trigger has an ordered list of inputs.</li>
          <li>Each trigger clears the input list after executing so the inputs don&apos;t affect other triggers.</li>
          <li>Each trigger contains a block, which is an ordered list of statements.</li>
        </ul>
        <p className="text-sm text-white/80">Examples:</p>

        <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/90 font-mono">
          <code>
            <span style={{ color: "#767dff" }}>EVERY</span>{" "}
            <span style={{ color: "#7de7ff" }}>20</span>{" "}
            <span style={{ color: "#ffc47c" }}>TICKS</span>{" "}
            <span style={{ color: "#767dff" }}>DO</span>
            <br />
            <span style={{ color: "#a8a8a8" }}>  -- do stuff here</span>
            <br />
            <span style={{ color: "#767dff" }}>END</span>
          </code>
        </pre>

        <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/90 font-mono">
          <code>
            <span style={{ color: "#767dff" }}>every</span>{" "}
            <span style={{ color: "#7de7ff" }}>5</span>{" "}
            <span style={{ color: "#ffc47c" }}>seconds</span>{" "}
            <span style={{ color: "#767dff" }}>do</span>
            <br />
            <span style={{ color: "#a8a8a8" }}>  -- do stuff here</span>
            <br />
            <span style={{ color: "#767dff" }}>end</span>
          </code>
        </pre>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-white">Statements</h3>
        <p className="text-sm text-white/80">There are currently three types of statements:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
          <li>
            <code className="rounded bg-white/10 px-1 py-0.5 text-xs">INPUT</code>
          </li>
          <li>
            <code className="rounded bg-white/10 px-1 py-0.5 text-xs">OUTPUT</code>
          </li>
          <li>
            <code className="rounded bg-white/10 px-1 py-0.5 text-xs">IF</code>
          </li>
        </ul>
        <p className="text-sm text-white/80">
          See the example scripts in the Examples tab for detailed usage of each statement.
        </p>
      </section>
    </Card>
  );

  const renderGettingStartedTab = () => (
    <Card className="space-y-6 p-6 sm:px-8 sm:py-7">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Getting Started</h2>
        <p className="text-sm text-white/70">
          A quick walkthrough of the items you need and how to get your first program running.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-white">You will need</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/85">Factory Manager</p>
            <div className="inline-block">
              <Image
                src="/guide/getting-started/factory_manager.webp"
                alt="Factory Manager item"
                width={340}
                height={340}
                className="h-auto w-auto max-h-44 rounded-2xl border border-white/15 bg-black/40 object-contain"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-white/85">Program Disk</p>
            <div className="inline-block">
              <Image
                src="/guide/getting-started/program_disk.webp"
                alt="Program Disk item"
                width={340}
                height={340}
                className="h-auto w-auto max-h-44 rounded-2xl border border-white/15 bg-black/40 object-contain"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-white/85">Label Gun</p>
            <div className="inline-block">
              <Image
                src="/guide/getting-started/label_gun.webp"
                alt="Label Gun item"
                width={340}
                height={340}
                className="h-auto w-auto max-h-44 rounded-2xl border border-white/15 bg-black/40 object-contain"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-white/85">(Optional) Inventory Cables</p>
            <div className="inline-block">
              <Image
                src="/guide/getting-started/inventory_cables.webp"
                alt="Inventory Cables"
                width={340}
                height={340}
                className="h-auto w-auto max-h-44 rounded-2xl border border-white/15 bg-black/40 object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <h3 className="text-base font-semibold text-white">Setup steps</h3>

        <div className="space-y-5">
          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/factory_manager_world.webp"
                alt="Factory Manager placed in the world"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>
              Place your Factory Manager in the world, and connect it to your inventories using Inventory Cables.
            </p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/program_disk_gui.webp"
                alt="Program Disk inserted in manager GUI"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>Place the Program Disk inside the Manager&apos;s GUI.</p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/script.webp"
                alt="Script pasted into GUI"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>
              Paste your script into the manager GUI using the buttons or by pressing{" "}
              <span className="font-mono text-xs">Ctrl+V</span>.
            </p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/script_loaded.webp"
                alt="Script successfully loaded"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>The manager should tell you that the script was loaded.</p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/warnings_and_errors.webp"
                alt="Warnings and errors tooltip"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>Hover over the disk to see the warnings and errors for your program.</p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/labels_loaded.webp"
                alt="Labels loaded into label gun"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>
              Shift-right-click the manager with the label gun in your hand to load the labels from your program.
            </p>
          </GuideStep>

          <GuideStep>
            <p>
              You can now use the scroll wheel while holding shift to change the active label. Right-click blocks in the
              world to apply or remove the label. There is also a right-click menu for entering a custom label that may
              not be in your program yet.
            </p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/pushing_labels.gif"
                alt="Pushing labels back into the manager"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>
              Once you&apos;ve assigned the labels, right-click the manager while not holding shift to save the labels
              to the Program Disk.
            </p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/program.webp"
                alt="Program preview"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>Your program should now be running without any issues.</p>
          </GuideStep>

          <GuideStep
            image={
              <GuideImage
                src="/guide/getting-started/in_action.gif"
                alt="Program in action"
                sizes="(max-width: 768px) 100vw, 900px"
                collapsedMode="start"
                collapsedMaxWidthClass="max-w-2xl"
              />
            }
          >
            <p>See the program in action:</p>
          </GuideStep>
        </div>
      </section>
    </Card>
  );

  return (
    <div className="space-y-6">
      {renderTabsHeader()}

      {activeTab === "examples" && renderExamplesTab()}
      {activeTab === "getting-started" && renderGettingStartedTab()}
      {activeTab === "basics" && renderBasicsTab()}
    </div>
  );
}
