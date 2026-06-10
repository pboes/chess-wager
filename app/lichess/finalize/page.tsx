import { getStore } from "@/lib/server/store";
import { FinalizeAutoClose } from "@/components/finalize-auto-close";

export const dynamic = "force-dynamic";

const wrap: React.CSSProperties = {
  display: "flex",
  minHeight: "100dvh",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  color: "#2b2b3a",
  padding: 24,
  textAlign: "center",
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 44,
  padding: "0 22px",
  borderRadius: 10,
  background: "#4f46e5",
  color: "#fff",
  fontWeight: 600,
  textDecoration: "none",
};

/**
 * Top-level OAuth tab. Opened by the miniapp (link or copy-paste) so the
 * redirect to Lichess happens outside the sandboxed iframe. Carries the handoff
 * token; the "Sign in" link kicks off the server-side OAuth.
 */
export default async function FinalizePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; e?: string }>;
}) {
  const { token, e } = await searchParams;
  const h = token ? await getStore().getHandoff(token) : null;

  if (!token || !h || e === "expired") {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 20 }}>Link expired</h1>
        <p style={{ color: "#6b6b80" }}>
          Start the connection again from the Stakemate app, then open the fresh link.
        </p>
      </main>
    );
  }

  if (h.status === "completed") {
    return (
      <main style={wrap}>
        <FinalizeAutoClose completed username={h.username} />
        <h1 style={{ fontSize: 20 }}>Connected ✓</h1>
        <p style={{ color: "#6b6b80" }}>
          Linked <strong>{h.username}</strong>. You can close this tab and return to Stakemate.
        </p>
      </main>
    );
  }

  if (h.status === "failed") {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 20 }}>Couldn’t connect</h1>
        <p style={{ color: "#b91c1c" }}>{h.error ?? "Something went wrong."}</p>
        <p style={{ color: "#6b6b80" }}>Start again from the Stakemate app.</p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 20 }}>Connect Lichess</h1>
      <p style={{ color: "#6b6b80", maxWidth: 360 }}>
        {h.address ? (
          <>
            Linking Lichess to your Circles wallet{" "}
            <code style={{ fontSize: 12 }}>
              {h.address.slice(0, 6)}…{h.address.slice(-4)}
            </code>
            .{" "}
          </>
        ) : null}
        Sign in with Lichess to finish.
      </p>
      <a style={btn} href={`/api/lichess/oauth/start?token=${token}`}>
        Sign in with Lichess →
      </a>
    </main>
  );
}
