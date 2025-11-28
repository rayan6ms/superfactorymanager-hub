export const COMMENT_PAGE_SIZE = 10;
export const COMMENT_MIN_LENGTH = 3;
export const COMMENT_MAX_LENGTH = 720;
export const COMMENT_MAX_DEPTH = 15;

export type CommentAuthor = {
  id: string;
  name: string | null;
  image: string | null;
};

export type SerializedComment = {
  id: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  author: CommentAuthor | null;
  score: number;
  voteCount: number;
  vote: "up" | "down" | null;
  replies: SerializedComment[];
};
