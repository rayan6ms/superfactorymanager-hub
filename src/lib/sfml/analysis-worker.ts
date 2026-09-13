import { analyzeSfmlCode, type AnalyzeOptions, type CodeFeedback } from "./analysis";

type Request = { id: number; code: string; options?: AnalyzeOptions };
type Response = { id: number; result: CodeFeedback } | { id: number; error: string };
const scope = globalThis as unknown as {
  postMessage: (value: Response) => void;
  onmessage: (event: MessageEvent<Request>) => void;
};

scope.onmessage = ({ data }) => {
  try {
    scope.postMessage({
      id: data.id,
      result: analyzeSfmlCode(data.code, data.options),
    });
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : "Analysis failed",
    });
  }
};
