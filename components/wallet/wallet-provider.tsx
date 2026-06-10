"use client";

import * as React from "react";

type TxRequest = { to: string; data: string; value?: string };

interface WalletContextValue {
  /** Safe address the user selected in the Circles host, or null. */
  address: string | null;
  isConnected: boolean;
  /** True only when running inside the Circles host (iframe). */
  isMiniappHost: boolean;
  /** Submit a batch of transactions through the host's Safe. Returns tx hashes. */
  sendTransactions: (txs: TxRequest[]) => Promise<string[]>;
  /** Ask the host to sign a message with the user's Safe. */
  signMessage: (message: string) => Promise<{ signature: string; verified: boolean }>;
  /** Ask the host to create a Circles account (passkey + invite). Resolves with
   *  the new registered address; `onWalletChange` also fires. Must be called from
   *  a user gesture. Throws if cancelled or unsupported. */
  createAccount: () => Promise<{ address: string }>;
  /** App-specific data the host forwarded via `?data=` (a challenge id from a
   *  share link). Persisted so it survives onboarding; call `clearAppData` once
   *  consumed. */
  appData: string | null;
  clearAppData: () => void;
}

const APP_DATA_KEY = "stakemate:appData";

const WalletContext = React.createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = React.useState<string | null>(null);
  const [isMiniappHost, setIsMiniappHost] = React.useState(false);
  const [appData, setAppData] = React.useState<string | null>(null);
  const sdkRef = React.useRef<typeof import("@aboutcircles/miniapp-sdk") | null>(null);

  const applyAppData = React.useCallback((v: string | null | undefined) => {
    if (!v) return;
    setAppData(v);
    try {
      window.localStorage.setItem(APP_DATA_KEY, v);
    } catch {
      /* storage blocked — in-memory state still works this session */
    }
  }, []);

  // Capture the share-link payload (a challenge id) as early and robustly as
  // possible — the host may deliver it either way and an early message can't be
  // missed if we listen synchronously:
  //   1. our own URL `?data=` (host appends it to the iframe src, or direct link),
  //   2. a previously-saved value (survives onboarding round-trips / reloads),
  //   3. the host's `app_data` postMessage.
  React.useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("data");
      if (fromUrl) {
        applyAppData(fromUrl);
        // Clean it from the URL so a later reload doesn't re-trigger.
        const u = new URL(window.location.href);
        u.searchParams.delete("data");
        window.history.replaceState({}, "", u.toString());
      } else {
        const saved = window.localStorage.getItem(APP_DATA_KEY);
        if (saved) setAppData(saved);
      }
    } catch {
      /* fine */
    }
    const onMsg = (ev: MessageEvent) => {
      const d = ev?.data;
      if (d && d.type === "app_data" && typeof d.data === "string") applyAppData(d.data);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [applyAppData]);

  React.useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        // The SDK touches `window`, so it must be imported on the client.
        const sdk = await import("@aboutcircles/miniapp-sdk");
        if (cancelled) return;
        sdkRef.current = sdk;

        // The SDK knows whether we're inside the Circles host iframe.
        setIsMiniappHost(sdk.isMiniappMode());

        unsubscribe = sdk.onWalletChange((addr: string | null) => {
          setAddress(addr ?? null);
        });

        // Belt-and-suspenders: also take app_data via the SDK listener.
        sdk.onAppData((data: string) => applyAppData(data));
      } catch (err) {
        console.warn("[wallet] miniapp-sdk unavailable:", err);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [applyAppData]);

  const clearAppData = React.useCallback(() => {
    setAppData(null);
    try {
      window.localStorage.removeItem(APP_DATA_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const sendTransactions = React.useCallback(async (txs: TxRequest[]) => {
    const sdk = sdkRef.current;
    if (!sdk) throw new Error("Circles host not connected");
    return sdk.sendTransactions(
      txs.map((t) => ({ to: t.to, data: t.data, value: t.value ?? "0" }))
    );
  }, []);

  const signMessage = React.useCallback(async (message: string) => {
    const sdk = sdkRef.current;
    if (!sdk) throw new Error("Circles host not connected");
    return sdk.signMessage(message);
  }, []);

  const createAccount = React.useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk) throw new Error("Open this app inside the Circles host to create an account.");
    if (typeof sdk.requestCreateAccount !== "function") {
      throw new Error("This Circles host doesn't support in-app account creation yet.");
    }
    return sdk.requestCreateAccount();
  }, []);

  const value = React.useMemo<WalletContextValue>(
    () => ({
      address,
      isConnected: Boolean(address),
      isMiniappHost,
      sendTransactions,
      signMessage,
      createAccount,
      appData,
      clearAppData,
    }),
    [address, isMiniappHost, sendTransactions, signMessage, createAccount, appData, clearAppData]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
