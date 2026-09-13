import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MessageCircle, Send, Users } from "lucide-react";
import { useP2PRoom } from "@/lib/multiplayer";
import { sfxPlay } from "./audio";
import { useGame } from "./store";

const MAX_TEXT = 80;
const MAX_LOG = 60;

export type ChatLine = {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
  kind: "chat" | "sys";
};

type Wire =
  | { type: "chat"; id: string; name: string; text: string; at: number }
  | { type: "history"; messages: ChatLine[] }
  | { type: "nick"; name: string };

type ChatApi = {
  open: boolean;
  setOpen: (v: boolean) => void;
  lines: ChatLine[];
  online: number;
  joined: boolean;
  selfId: string;
  peerNames: { id: string; name: string }[];
  sendChat: (text: string) => boolean;
  latest: ChatLine | null;
};

const ChatCtx = createContext<ChatApi | null>(null);

function newId() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isWire(v: unknown): v is Wire {
  if (!v || typeof v !== "object") return false;
  const t = (v as { type?: unknown }).type;
  return t === "chat" || t === "history" || t === "nick";
}

function sanitize(text: string) {
  return text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, MAX_TEXT);
}

const idleApi: ChatApi = {
  open: false,
  setOpen: () => {},
  lines: [],
  online: 1,
  joined: false,
  selfId: "",
  peerNames: [],
  sendChat: () => false,
  latest: null,
};

export function LobbyChatProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => useGame.persist.hasHydrated());
  useEffect(() => {
    const unsub = useGame.persist.onFinishHydration(() => setReady(true));
    if (useGame.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);
  if (!ready) return <ChatCtx.Provider value={idleApi}>{children}</ChatCtx.Provider>;
  return <LiveChatProvider>{children}</LiveChatProvider>;
}

function LiveChatProvider({ children }: { children: ReactNode }) {
  const playerName = useGame((s) => s.playerName);
  const p2p = useP2PRoom({ room: "ice-siege-lobby", name: playerName });
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [nicks, setNicks] = useState<Record<string, string>>({});
  const known = useRef<Set<string>>(new Set());
  const linesRef = useRef(lines);
  const nicksRef = useRef(nicks);
  linesRef.current = lines;
  nicksRef.current = nicks;

  const push = useCallback((line: ChatLine) => {
    setLines((prev) => {
      if (prev.some((x) => x.id === line.id)) return prev;
      const next = [...prev, line];
      return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
    });
  }, []);

  useEffect(() => {
    return p2p.onMessage((from, data, channel) => {
      if (channel !== "reliable" || !isWire(data)) return;
      if (data.type === "chat") {
        const text = sanitize(data.text);
        if (!text) return;
        push({
          id: data.id || newId(),
          from,
          name: sanitize(data.name) || nicksRef.current[from] || "無名",
          text,
          at: typeof data.at === "number" ? data.at : Date.now(),
          kind: "chat",
        });
        return;
      }
      if (data.type === "nick" && data.name) {
        setNicks((n) => ({ ...n, [from]: sanitize(data.name) }));
        return;
      }
      if (data.type === "history") {
        for (const m of data.messages) {
          if (m.kind !== "chat") continue;
          const text = sanitize(m.text);
          if (!text) continue;
          push({
            id: m.id || newId(),
            from: m.from,
            name: sanitize(m.name) || "無名",
            text,
            at: m.at || Date.now(),
            kind: "chat",
          });
        }
      }
    });
  }, [p2p, push]);

  useEffect(() => {
    const prev = known.current;
    const next = new Set(p2p.peers.map((p) => p.id));
    for (const p of p2p.peers) {
      if (!prev.has(p.id)) {
        const label = nicksRef.current[p.id] || p.name || "司令官";
        push({
          id: newId(),
          from: p.id,
          name: label,
          text: `${label} が入陣した`,
          at: Date.now(),
          kind: "sys",
        });
        const incumbents = [p2p.selfId, ...prev].sort();
        if (incumbents[0] === p2p.selfId) {
          const hist = linesRef.current.filter((l) => l.kind === "chat").slice(-30);
          if (hist.length) p2p.send({ type: "history", messages: hist } satisfies Wire, p.id);
        }
      }
    }
    for (const id of prev) {
      if (!next.has(id)) {
        const label = nicksRef.current[id] || "司令官";
        push({
          id: newId(),
          from: id,
          name: label,
          text: `${label} が去った`,
          at: Date.now(),
          kind: "sys",
        });
      }
    }
    known.current = next;
  }, [p2p.peers, p2p.selfId, p2p.send, push]);

  const sendChat = useCallback(
    (raw: string) => {
      const text = sanitize(raw);
      if (!text) return false;
      const msg: ChatLine = {
        id: newId(),
        from: p2p.selfId,
        name: playerName,
        text,
        at: Date.now(),
        kind: "chat",
      };
      push(msg);
      p2p.send({
        type: "chat",
        id: msg.id,
        name: playerName,
        text,
        at: msg.at,
      } satisfies Wire);
      return true;
    },
    [p2p, playerName, push],
  );

  useEffect(() => {
    if (!p2p.joined) return;
    p2p.send({ type: "nick", name: playerName } satisfies Wire);
  }, [playerName, p2p.joined, p2p.send]);

  const peerNames = useMemo(
    () =>
      p2p.peers.map((p) => ({
        id: p.id,
        name: nicks[p.id] || p.name || "司令官",
      })),
    [p2p.peers, nicks],
  );

  const latest = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].kind === "chat") return lines[i];
    }
    return lines[lines.length - 1] ?? null;
  }, [lines]);

  const api: ChatApi = {
    open,
    setOpen,
    lines,
    online: p2p.peers.length + 1,
    joined: p2p.joined,
    selfId: p2p.selfId,
    peerNames,
    sendChat,
    latest,
  };

  return <ChatCtx.Provider value={api}>{children}</ChatCtx.Provider>;
}

function useLobbyChat() {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("LobbyChatProvider missing");
  return ctx;
}

export function ChatTicker() {
  const { open, setOpen, latest, online, joined } = useLobbyChat();
  const others = Math.max(0, online - 1);
  const headline = latest
    ? latest.kind === "sys"
      ? latest.text
      : `${latest.name} 「${latest.text}」`
    : others > 0
      ? `${others}人がプレイ中 · タップして話す`
      : "他にプレイ中の人はいません";

  return (
    <div className="chat-slot">
      <button
        className={`chat-ticker ${open ? "on" : ""}`}
        type="button"
        aria-label="プレイ中のチャット"
        aria-expanded={open}
        onClick={() => {
          sfxPlay.click();
          setOpen(!open);
        }}
      >
        <MessageCircle size={16} strokeWidth={2.2} />
        <span className="chat-ticker-copy">
          <span key={latest?.id ?? "empty"}>{headline}</span>
        </span>
        <span className="chat-count">
          <i className={joined ? "live" : ""} />
          {online}
        </span>
      </button>
      {open && <ChatSheet others={others} />}
    </div>
  );
}

function ChatSheet({ others }: { others: number }) {
  const { lines, sendChat, setOpen, joined, selfId, peerNames } = useLobbyChat();
  const playerName = useGame((s) => s.playerName);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const [draft, setDraft] = useState("");
  const [nick, setNick] = useState(playerName);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sendChat(draft)) {
      sfxPlay.click();
      setDraft("");
    } else {
      sfxPlay.deny();
    }
  };

  const commitNick = () => {
    const next = sanitize(nick).slice(0, 16);
    if (next && next !== playerName) {
      setPlayerName(next);
      sfxPlay.click();
    }
    setNick(next || playerName);
  };

  return (
    <>
      <button className="chat-backdrop" type="button" aria-label="チャットを閉じる" onClick={() => setOpen(false)} />
      <section className="chat-sheet" role="dialog" aria-label="プレイ中のチャット">
        <header className="chat-sheet-head">
          <div>
            <b>プレイ中のチャット</b>
            <span>
              {joined
                ? others > 0
                  ? `今 ${others}人が出陣中`
                  : "他にプレイ中の人はいません"
                : "接続中…"}
            </span>
          </div>
          <span className="chat-roster" title={peerNames.map((n) => n.name).join("、")}>
            <Users size={13} />
            {peerNames.length ? peerNames.map((n) => n.name).join(" · ") : "待機"}
          </span>
        </header>
        <div className="chat-log" ref={scroller}>
          {lines.length === 0 && (
            <p className="chat-empty">書き込むと、今プレイ中の他の司令官に届きます。</p>
          )}
          {lines.map((line) => (
            <div key={line.id} className={`chat-line ${line.kind} ${line.from === selfId ? "mine" : ""}`}>
              {line.kind === "sys" ? (
                <span>{line.text}</span>
              ) : (
                <>
                  <em>{line.from === selfId ? "あなた" : line.name}</em>
                  <p>{line.text}</p>
                </>
              )}
            </div>
          ))}
        </div>
        <form className="chat-compose" onSubmit={submit}>
          <label className="chat-nick">
            名乗り
            <input
              value={nick}
              maxLength={16}
              onChange={(e) => setNick(e.target.value)}
              onBlur={commitNick}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitNick();
                }
              }}
              aria-label="名乗り"
            />
          </label>
          <div className="chat-row">
            <input
              value={draft}
              maxLength={MAX_TEXT}
              placeholder={others > 0 ? "今いる人へ…" : "次に来た人へ残す…"}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="メッセージ"
            />
            <button type="submit" aria-label="送信" disabled={!draft.trim()}>
              <Send size={16} />
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
