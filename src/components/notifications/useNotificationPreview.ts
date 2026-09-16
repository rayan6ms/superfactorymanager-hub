"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNotificationPreview } from "@/lib/notification-client";
import { type NotificationSyncDetail } from "@/lib/notification-events";
import { NOTIFICATION_SYNC_EVENT, type NotificationPreview } from "@/lib/notifications-shared";

const EMPTY: NotificationPreview = { notifications: [], unreadCount: 0 };

export default function useNotificationPreview(userId?: string) {
  const [state, setState] = useState<{
    userId?: string;
    data: NotificationPreview;
    error: string | null;
    loading: boolean;
  }>({
    data: EMPTY,
    error: null,
    loading: true,
  });
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((prev) => ({
      userId,
      data: prev.userId === userId ? prev.data : EMPTY,
      error: null,
      loading: true,
    }));
    try {
      const data = await fetchNotificationPreview(controller.signal);
      if (!controller.signal.aborted) setState({ userId, data, error: null, loading: false });
    } catch {
      if (!controller.signal.aborted) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "We couldn’t load notifications. Please try again.",
        }));
      }
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    function handle(event: Event) {
      const detail = (event as CustomEvent<NotificationSyncDetail>).detail;
      if (!userId || !detail) return;
      if (detail.preview && typeof detail.unreadCount === "number") {
        // A mutation/refresh response is newer than a request already in flight.
        request.current?.abort();
        setState({
          userId,
          data: { notifications: detail.preview, unreadCount: detail.unreadCount },
          error: null,
          loading: false,
        });
      } else {
        void refresh();
      }
    }
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener(NOTIFICATION_SYNC_EVENT, handle);
    window.addEventListener("focus", handleFocus);
    return () => {
      request.current?.abort();
      window.removeEventListener(NOTIFICATION_SYNC_EVENT, handle);
      window.removeEventListener("focus", handleFocus);
    };
  }, [userId, refresh]);

  return {
    ...(state.userId === userId ? state.data : EMPTY),
    error: state.userId === userId ? state.error : null,
    loading: !!userId && (state.userId !== userId || state.loading),
    refresh,
  };
}
