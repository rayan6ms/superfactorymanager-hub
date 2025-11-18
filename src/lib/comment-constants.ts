export const COMMENT_PAGE_SIZE = 10;
export const COMMENT_MIN_LENGTH = 3;
export const COMMENT_MAX_LENGTH = 2000;

export type CommentAuthor = {
  id: string;
  name: string | null;
  image: string | null;
};

export type SerializedComment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor | null;
};
