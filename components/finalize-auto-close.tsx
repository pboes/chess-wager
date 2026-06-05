"use client";

import * as React from "react";

/**
 * Runs in the OAuth tab once the link is complete. If this tab was opened by the
 * app (the smooth popup route), it notifies the opener and closes itself. In the
 * copy-paste route there's no opener, so it just leaves the "Connected" page up
 * and the app picks it up by polling.
 */
export function FinalizeAutoClose({
  completed,
  username,
}: {
  completed: boolean;
  username?: string;
}) {
  React.useEffect(() => {
    if (!completed) return;
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: "lichess-connected", username },
          window.location.origin
        );
      }
    } catch {
      /* opener gone — the app's polling will catch it */
    }
    const t = setTimeout(() => {
      try {
        window.close();
      } catch {
        /* not closable (copy-paste tab) — the page tells them to close it */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [completed, username]);

  return null;
}
