import { describe, expect, test } from "bun:test";
import {
  createSfmlAnalysisClient,
  type AnalysisWorker,
} from "../../src/lib/sfml/analysis-worker-client";
import { analyzeSfmlCode } from "../../src/lib/sfml/analysis";

class FakeWorker implements AnalysisWorker {
  onmessage: Worker["onmessage"] = null;
  onerror: Worker["onerror"] = null;
  onmessageerror: Worker["onmessageerror"] = null;
  sent: Array<{ id: number; code: string }> = [];
  stopped = false;
  postMessage(value: { id: number; code: string }) {
    this.sent.push(value);
  }
  terminate() {
    this.stopped = true;
  }
  reply(index = 0) {
    const request = this.sent[index];
    this.onmessage?.call(
      this as unknown as Worker,
      new MessageEvent("message", {
        data: { id: request.id, result: analyzeSfmlCode(request.code) },
      }),
    );
  }
}

const code = "EVERY TICKS DO INPUT FROM a OUTPUT TO b END";
describe("analysis worker lifecycle", () => {
  test("cancels active work and ignores a late reply after a new edit", async () => {
    const workers: FakeWorker[] = [];
    const client = createSfmlAnalysisClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const controller = new AbortController();
    const first = client.analyze("INPUT FROM", {}, controller.signal).catch((e) => e.name);
    controller.abort();
    expect(await first).toBe("AbortError");
    expect(workers[0].stopped).toBe(true);
    const second = client.analyze(code);
    workers[0].reply();
    workers[1].reply();
    expect((await second).status).toBe("ok");
    client.dispose();
  });

  test("cancels queued work before it reaches the shared worker", async () => {
    const worker = new FakeWorker();
    const client = createSfmlAnalysisClient(() => worker);
    const first = client.analyze(code);
    const controller = new AbortController();
    const canceled = client.analyze("invalid", {}, controller.signal).catch((e) => e.name);
    const third = client.analyze(code);
    controller.abort();
    expect(await canceled).toBe("AbortError");
    expect(worker.sent).toHaveLength(1);
    worker.reply();
    await first;
    expect(worker.sent).toHaveLength(2);
    expect(worker.sent[1].code).toBe(code);
    worker.reply(1);
    expect((await third).status).toBe("ok");
    client.dispose();
  });

  test("worker creation and loading failure fall back to the same parser", async () => {
    const unavailable = createSfmlAnalysisClient(() => {
      throw new Error("Worker blocked");
    });
    expect(await unavailable.analyze(code)).toEqual(analyzeSfmlCode(code));
    unavailable.dispose();
    const worker = new FakeWorker();
    const failed = createSfmlAnalysisClient(() => worker);
    const result = failed.analyze(code);
    worker.onerror?.call(worker as unknown as Worker, new ErrorEvent("error"));
    expect(await result).toEqual(analyzeSfmlCode(code));
    expect(worker.stopped).toBe(true);
    failed.dispose();
  });

  test("unmount/dispose rejects all outstanding requests", async () => {
    const worker = new FakeWorker();
    const client = createSfmlAnalysisClient(() => worker);
    const a = client.analyze(code).catch((e) => e.name);
    const b = client.analyze(code).catch((e) => e.name);
    client.dispose();
    expect(await Promise.all([a, b])).toEqual(["AbortError", "AbortError"]);
    expect(worker.stopped).toBe(true);
  });
});
