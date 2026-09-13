import type { AnalyzeOptions, CodeFeedback } from "./analysis";
import { getSfmlAnalyzeDebounceMs } from "./timing";

export type AnalysisWorker = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror"
>;
type Job = {
  id: number;
  code: string;
  options?: AnalyzeOptions;
  signal?: AbortSignal;
  resolve: (feedback: CodeFeedback) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

/** One active analysis at a time. Canceled edits never accumulate in a worker's message queue. */
export function createSfmlAnalysisClient(
  createWorker: () => AnalysisWorker | null,
  fallback = async (code: string, options?: AnalyzeOptions) =>
    (await import("./analysis")).analyzeSfmlCode(code, options),
) {
  let worker: AnalysisWorker | null = null;
  let unavailable = false;
  let active: Job | null = null;
  let nextId = 0;
  const queue: Job[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function stopWorker() {
    worker?.terminate();
    worker = null;
  }
  function finish(job: Job, feedback?: CodeFeedback, error?: Error) {
    if (active !== job) return;
    active = null;
    job.cleanup();
    if (error) job.reject(error);
    else job.resolve(feedback!);
    pump();
  }
  function runFallback(job: Job) {
    void fallback(job.code, job.options).then(
      (result) => finish(job, result),
      (error) =>
        finish(
          job,
          undefined,
          error instanceof Error ? error : new Error("SFML analysis failed"),
        ),
    );
  }
  function pump() {
    if (active) return;
    const job = queue.shift();
    clearTimeout(idleTimer);
    if (!job) {
      idleTimer = setTimeout(stopWorker, 10_000);
      return;
    }
    active = job;
    if (!worker && !unavailable) {
      try {
        worker = createWorker();
      } catch {
        unavailable = true;
      }
      if (!worker) unavailable = true;
    }
    if (!worker) {
      runFallback(job);
      return;
    }
    worker.onmessage = (event) => {
      if (event.data.id !== job.id) return;
      if (event.data.error) {
        finish(job, undefined, new Error(event.data.error));
      } else finish(job, event.data.result);
    };
    const failed = () => {
      if (active !== job) return;
      unavailable = true;
      stopWorker();
      runFallback(job);
    };
    worker.onerror = failed;
    worker.onmessageerror = failed;
    try {
      worker.postMessage({ id: job.id, code: job.code, options: job.options });
    } catch {
      failed();
    }
  }

  return {
    analyze(
      code: string,
      options?: AnalyzeOptions,
      signal?: AbortSignal,
    ): Promise<CodeFeedback> {
      if (signal?.aborted)
        return Promise.reject(
          new DOMException("Analysis canceled", "AbortError"),
        );
      return new Promise((resolve, reject) => {
        const job: Job = {
          id: ++nextId,
          code,
          options,
          signal,
          resolve,
          reject,
          cleanup: () => signal?.removeEventListener("abort", abort),
        };
        function abort() {
          job.cleanup();
          if (active === job) {
            stopWorker();
            active = null;
          } else {
            const index = queue.indexOf(job);
            if (index >= 0) queue.splice(index, 1);
          }
          reject(new DOMException("Analysis canceled", "AbortError"));
          pump();
        }
        signal?.addEventListener("abort", abort, { once: true });
        queue.push(job);
        pump();
      });
    },
    dispose() {
      clearTimeout(idleTimer);
      stopWorker();
      for (const job of [...(active ? [active] : []), ...queue]) {
        job.cleanup();
        job.reject(new DOMException("Analysis canceled", "AbortError"));
      }
      active = null;
      queue.length = 0;
    },
  };
}

const client = createSfmlAnalysisClient(() => {
  if (typeof window === "undefined" || typeof Worker === "undefined")
    return null;
  return new Worker(new URL("./analysis-worker.ts", import.meta.url), {
    type: "module",
    name: "sfml-analysis",
  });
});

export function analyzeSfmlCodeInWorker(
  code: string,
  options?: AnalyzeOptions,
  signal?: AbortSignal,
) {
  return client.analyze(code, options, signal);
}

/** Effect cleanup cancels both the debounce and any in-flight analysis. */
export function scheduleSfmlAnalysis(
  code: string,
  options: AnalyzeOptions,
  onFeedback: (feedback: CodeFeedback) => void,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    void client
      .analyze(code, options, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) onFeedback(result);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("SFML analysis failed:", error);
        onFeedback({
          status: "error",
          message:
            "Code analysis could not finish. Please edit the code to retry.",
          syntaxErrors: [],
          warnings: [],
        });
      });
  }, getSfmlAnalyzeDebounceMs(code));
  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}
