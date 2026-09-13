import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Castle, Swords, Sparkles, Crown, Search, Music2 } from "lucide-react";
import { CARDS, STAGE, cardById, scaledStat, type CardKind } from "./data";
import { useGame, type Filter } from "./store";
import { Battle } from "./engine";
import { renderBattle, screenToWorld, layoutCanvas } from "./render";
import { sfxPlay, startBattleMusic, stopBattleMusic, unlockAudio, setMuted, isMuted } from "./audio";
import { ChatTicker, LobbyChatProvider } from "./lobby-chat";

export function GameApp() {
  const screen = useGame((s) => s.screen);
  return (
    <LobbyChatProvider>
      <div className="game-root">
        {screen !== "title" && <TopBar />}
        {screen === "title" && <Title />}
        {screen === "collection" && <Collection />}
        {screen === "detail" && <Detail />}
        {screen === "deploy" && <Deploy />}
        {screen === "battle" && <BattleScreen />}
        {screen === "result" && <Result />}
      </div>
    </LobbyChatProvider>
  );
}

function TopBar() {
  const gold = useGame((s) => s.gold);
  const setScreen = useGame((s) => s.setScreen);
  const screen = useGame((s) => s.screen);
  return (
    <header className="topbar">
      <div className="gold-chip">
        <span className="gold-dot" />
        {gold.toLocaleString()}
        <button className="plus-btn" type="button" aria-label="ゴールド" onClick={() => useGame.getState().addGold(200)}>
          +
        </button>
      </div>
      <ChatTicker />
      <button
        className="close-x"
        type="button"
        aria-label="閉じる"
        onClick={() => {
          sfxPlay.click();
          if (screen === "battle") {
            window.dispatchEvent(new Event("ice-siege-close"));
            return;
          }
          if (screen === "detail") setScreen("collection");
          else if (screen === "deploy") setScreen("collection");
          else if (screen === "result") setScreen("collection");
          else setScreen("title");
        }}
      >
        ×
      </button>
    </header>
  );
}

function Title() {
  const setScreen = useGame((s) => s.setScreen);
  return (
    <div className="title">
      <img className="hero-art" src="/game/battlefield.jpg" alt="" />
      <h1>氷晶攻城戦</h1>
      <p>カードを戦場に置き、氷の本陣を砕け。</p>
      <button
        className="sortie"
        type="button"
        onClick={() => {
          unlockAudio();
          sfxPlay.click();
          setScreen("collection");
        }}
      >
        はじめる
      </button>
    </div>
  );
}

const FILTERS: { id: Filter; label: string; icon: typeof LayoutGrid }[] = [
  { id: "all", label: "全て", icon: LayoutGrid },
  { id: "building", label: "建物", icon: Castle },
  { id: "troop", label: "部隊", icon: Swords },
  { id: "spell", label: "呪文", icon: Sparkles },
  { id: "hero", label: "英雄", icon: Crown },
];

function FilterTabs({ extra }: { extra?: boolean }) {
  const filter = useGame((s) => s.filter);
  const setFilter = useGame((s) => s.setFilter);
  return (
    <div className="tabs">
      {FILTERS.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            className={`tab ${filter === t.id ? "on" : ""}`}
            type="button"
            aria-label={t.label}
            onClick={() => {
              sfxPlay.click();
              setFilter(t.id);
            }}
          >
            <Icon size={18} strokeWidth={2.2} />
          </button>
        );
      })}
      {extra && (
        <button className="tab mag" type="button" aria-label="検索" onClick={() => sfxPlay.click()}>
          <Search size={18} />
        </button>
      )}
    </div>
  );
}

function UnitCard({
  id,
  onClick,
  selected,
  showNew,
}: {
  id: string;
  onClick: () => void;
  selected?: boolean;
  showNew?: boolean;
}) {
  const c = cardById(id);
  const lv = useGame((s) => s.levels[id] ?? 1);
  const have = useGame((s) => s.frags[id] ?? 0);
  const seen = useGame((s) => s.seen[id]);
  const can = have >= c.fragsNeed;
  return (
    <button className={`ucard ${selected ? "picked" : ""}`} type="button" onClick={onClick}>
      <span className="cost">{c.cost}</span>
      {showNew && !seen && <span className="ribbon">NEW !</span>}
      {can && <span className="bang">!</span>}
      {selected && <span className="check">✓</span>}
      <img src={c.art} alt={c.name} />
      <span className="lv">Lv.{lv}</span>
      <div className="meta">
        <div className="bar">
          <i style={{ width: `${Math.min(100, (have / c.fragsNeed) * 100)}%` }} />
        </div>
        <span className="frag">
          {have} / {c.fragsNeed}
        </span>
      </div>
    </button>
  );
}

function Collection() {
  const filter = useGame((s) => s.filter);
  const setScreen = useGame((s) => s.setScreen);
  const select = useGame((s) => s.select);
  const list = useMemo(() => CARDS.filter((c) => filter === "all" || c.kind === filter), [filter]);
  return (
    <div className="screen">
      <div className="panel" style={{ flex: 1 }}>
        <div className="panel-title">図鑑</div>
        <FilterTabs />
        <div className="grid-wrap">
          {list.map((c) => (
            <UnitCard
              key={c.id}
              id={c.id}
              showNew
              onClick={() => {
                sfxPlay.click();
                select(c.id);
                useGame.getState().markSeen(c.id);
                setScreen("detail");
              }}
            />
          ))}
        </div>
        <button
          className="sortie"
          type="button"
          onClick={() => {
            sfxPlay.click();
            setScreen("deploy");
          }}
        >
          出陣準備
        </button>
      </div>
    </div>
  );
}

function Detail() {
  const id = useGame((s) => s.selectedId);
  const levels = useGame((s) => s.levels);
  const frags = useGame((s) => s.frags);
  const gold = useGame((s) => s.gold);
  const [tab, setTab] = useState<"feat" | "stat" | "land">("feat");
  if (!id) return null;
  const c = cardById(id);
  const lv = levels[id] ?? 1;
  const have = frags[id] ?? 0;
  const cost = 80 + lv * 40;
  const can = have >= c.fragsNeed && gold >= cost;
  const kindLabel: Record<CardKind, string> = {
    building: "建物",
    troop: "部隊",
    spell: "呪文",
    hero: "英雄",
  };
  const idx = CARDS.findIndex((x) => x.id === id);
  const go = (dir: number) => {
    const n = CARDS[(idx + dir + CARDS.length) % CARDS.length];
    useGame.getState().select(n.id);
    useGame.getState().markSeen(n.id);
    sfxPlay.click();
  };
  return (
    <div className="screen">
      <div className="detail">
        <button className="nav-arr left" type="button" aria-label="前" onClick={() => go(-1)}>
          ‹
        </button>
        <button className="nav-arr right" type="button" aria-label="次" onClick={() => go(1)}>
          ›
        </button>
        <div className="portrait-col">
          <div className="kind-row">
            <span>{kindLabel[c.kind]}</span>
            <span className="cost">{c.cost}</span>
          </div>
          <h2>{c.name}</h2>
          <div>Lv.{lv}</div>
          <img src={c.art} alt="" />
          <div className="bar" style={{ width: "80%" }}>
            <i style={{ width: `${Math.min(100, (have / c.fragsNeed) * 100)}%` }} />
          </div>
          <div style={{ fontSize: 12 }}>
            {have} / {c.fragsNeed}
          </div>
          <button
            className="lvlup"
            type="button"
            disabled={!can}
            onClick={() => {
              const ok = useGame.getState().levelUp(id);
              if (ok) sfxPlay.deploy();
              else sfxPlay.deny();
            }}
          >
            レベルアップ
            {can && <span className="bang">!</span>}
          </button>
        </div>
        <div className="stats">
          <div className="seg">
            {(
              [
                ["feat", "特徴"],
                ["stat", "属性"],
                ["land", "領地強化"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} type="button" onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === "feat" && (
            <>
              <div className="sec-title">ダメージブースト</div>
              <div className="boosts">
                {c.boosts.map((b) => (
                  <div key={b.icon}>
                    <div className={`ic ic-${b.icon}`} />
                    {b.pct}%
                  </div>
                ))}
              </div>
              <div className="sec-title">特徴説明</div>
              <p className="feature">{c.feature}</p>
            </>
          )}
          {tab === "stat" && (
            <div className="feature">
              <Row k="攻撃" v={scaledStat(c.atk, lv)} d={`+${Math.round(c.atk * 0.06)}`} />
              {c.hp > 0 && <Row k="耐久" v={scaledStat(c.hp, lv)} d={`+${Math.round(c.hp * 0.06)}`} />}
              {c.range > 0 && <Row k="射程" v={c.range.toFixed(1)} />}
              {c.rate > 0 && <Row k="攻撃速度" v={c.rate.toFixed(1)} />}
              {c.duration > 0 && <Row k="持続" v={`${c.duration}秒`} />}
              <Row k="コスト" v={c.cost} />
            </div>
          )}
          {tab === "land" && <p className="feature">領地に配置すると、同じ系統の部隊の与ダメージがわずかに上昇します。</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, d }: { k: string; v: string | number; d?: string }) {
  return (
    <div className="stat-row">
      <span>{k}</span>
      <span>
        <b>{v}</b> {d && <span className="delta">{d}</span>}
      </span>
    </div>
  );
}

function Deploy() {
  const deck = useGame((s) => s.deck);
  const filter = useGame((s) => s.filter);
  const toggleDeck = useGame((s) => s.toggleDeck);
  const setScreen = useGame((s) => s.setScreen);
  const levels = useGame((s) => s.levels);
  const list = CARDS.filter((c) => filter === "all" || c.kind === filter);
  return (
    <div className="screen">
      <div className="panel deploy-panel">
        <div className="deploy-head">
          <div>
            <div className="label">敵軍情報</div>
            <div className="boss-row">
              <span className="boss-tag">BOSS</span>
              {["/game/boss.jpg", "/game/ice-golem.jpg", "/game/ice-crystal.jpg", "/game/ice-tower.jpg", "/game/shadow.jpg"].map(
                (s) => (
                  <img key={s} src={s} alt="" />
                ),
              )}
            </div>
          </div>
          <div className="vs-mark">VS</div>
          <div className="win-col">
            <div className="label">勝利条件</div>
            <img src="/game/ice-tower.jpg" alt="" className="win-icon" />
            <div className="win-hint">敵の本陣を破壊</div>
          </div>
        </div>
        <div className="keep-vs">
          <div className="keep-card">
            <img src="/game/ice-tower.jpg" alt="" />
            <span>{STAGE.playerName}</span>
          </div>
          <div className="vs-mark">VS</div>
          <div className="keep-card enemy">
            <img src="/game/boss.jpg" alt="" />
            <span>{STAGE.coords}</span>
          </div>
        </div>
        <div className="vs-row">
          {Array.from({ length: 8 }).map((_, i) => {
            const id = deck[i];
            return (
              <button
                key={i}
                className={`slot ${id ? "" : "empty"}`}
                type="button"
                onClick={() => id && toggleDeck(id)}
              >
                {id && <img src={cardById(id).art} alt={cardById(id).name} />}
                {id && <span className="cost">{cardById(id).cost}</span>}
                {id && <span className="lv">Lv.{levels[id] ?? 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="deploy-body">
          <div className="deploy-grid">
            <FilterTabs extra />
            <div className="grid-wrap">
              {list.map((c) => (
                <UnitCard
                  key={c.id}
                  id={c.id}
                  selected={deck.includes(c.id)}
                  onClick={() => {
                    sfxPlay.click();
                    toggleDeck(c.id);
                  }}
                />
              ))}
            </div>
          </div>
          <button
            className="parchment"
            type="button"
            disabled={deck.length < 4}
            onClick={() => {
              unlockAudio();
              sfxPlay.deploy();
              setScreen("battle");
            }}
          >
            <span className="axe" aria-hidden />
            <span className="scroll">出陣</span>
            <span className="axe axe-r" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function BattleScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const battleRef = useRef<Battle | null>(null);
  const deck = useGame((s) => s.deck);
  const levels = useGame((s) => s.levels);
  const applyResult = useGame((s) => s.applyResult);
  const setScreen = useGame((s) => s.setScreen);
  const [hud, setHud] = useState({
    time: STAGE.duration,
    mana: 22,
    php: STAGE.playerHp,
    ehp: STAGE.enemyHp,
    pmax: STAGE.playerHp,
    emax: STAGE.enemyHp,
    speed: 1,
    paused: false,
    selected: null as string | null,
    wave: 0,
    hand: [] as { id: string; cd: number; maxCd: number }[],
  });
  const [muted, setMutedUi] = useState(isMuted());

  useEffect(() => {
    const onClose = () => {
      const bat = battleRef.current;
      if (bat && !bat.ended) bat.paused = true;
    };
    window.addEventListener("ice-siege-close", onClose);
    return () => window.removeEventListener("ice-siege-close", onClose);
  }, []);

  useEffect(() => {
    const b = new Battle(deck, levels);
    battleRef.current = b;
    startBattleMusic();
    let last = performance.now();
    let raf = 0;
    let acc = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.08, (t - last) / 1000);
      last = t;
      b.update(dt);
      const canvas = canvasRef.current;
      if (canvas) renderBattle(canvas, b);
      acc += dt;
      if (acc > 0.08) {
        acc = 0;
        setHud({
          time: b.time,
          mana: b.mana,
          php: b.playerCastle.hp,
          ehp: b.enemyCastle.hp,
          pmax: b.playerCastle.maxHp,
          emax: b.enemyCastle.maxHp,
          speed: b.speed,
          paused: b.paused,
          selected: b.selected,
          wave: b.wave,
          hand: b.hand.map((h) => ({ ...h })),
        });
      }
      if (b.ended) {
        stopBattleMusic();
        applyResult({ ...b.ended, goldEarned: b.ended.win ? 420 : 80 });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stopBattleMusic();
    };
  }, [deck, levels, applyResult]);

  const onPoint = (clientX: number, clientY: number, play: boolean) => {
    const canvas = canvasRef.current;
    const b = battleRef.current;
    if (!canvas || !b) return;
    const rect = canvas.getBoundingClientRect();
    const L = layoutCanvas(canvas, b);
    if (!L) return;
    const w = screenToWorld(clientX - rect.left, clientY - rect.top, L.ox, L.oy, L.scale);
    b.hover = w;
    if (play && b.selected) b.tryPlay(b.selected, w.x, w.y);
  };

  const mm = Math.floor(hud.time / 60);
  const ss = Math.floor(hud.time % 60)
    .toString()
    .padStart(2, "0");
  const showCount = hud.time <= 10 && hud.time > 0 && !hud.paused;

  return (
    <div className="screen battle-screen">
      <div className="battle-wrap">
        <canvas
          ref={canvasRef}
          className="battle-canvas"
          onPointerDown={(e) => {
            try {
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            } catch {
              /* synthetic / non-primary pointers */
            }
            onPoint(e.clientX, e.clientY, true);
          }}
          onPointerMove={(e) => onPoint(e.clientX, e.clientY, false)}
        />
        <div className="hud-top">
          <div className="timer">
            <Music2 size={14} />
            {mm}:{ss}
          </div>
          <button
            className="pause-dia"
            type="button"
            aria-label={hud.paused ? "再開" : "一時停止"}
            onClick={() => {
              const bat = battleRef.current;
              if (!bat) return;
              bat.paused = !bat.paused;
              sfxPlay.click();
            }}
          >
            {hud.paused ? "▶" : "Ⅱ"}
          </button>
        </div>
        <div className="hp-pair">
          <img src="/game/ice-tower.jpg" alt="" className="keep-ic" />
          <div className="hp-col">
            <div className="hp-name">{STAGE.playerName}</div>
            <div className="hp blue">
              <i style={{ width: `${Math.max(0, (hud.php / hud.pmax) * 100)}%` }} />
              <span>{Math.max(0, Math.round(hud.php)).toLocaleString()}</span>
            </div>
          </div>
          <div className="swords" aria-hidden />
          <div className="hp-col">
            <div className="hp-name end">{STAGE.coords}</div>
            <div className="hp red">
              <i style={{ width: `${Math.max(0, (hud.ehp / hud.emax) * 100)}%` }} />
              <span>{Math.max(0, Math.round(hud.ehp)).toLocaleString()}</span>
            </div>
          </div>
          <img src="/game/boss.jpg" alt="" className="keep-ic" />
        </div>
        <button
          className="speed-orb"
          type="button"
          aria-label="速度"
          onClick={() => {
            const bat = battleRef.current;
            if (!bat) return;
            bat.speed = bat.speed >= 3 ? 1 : bat.speed + 1;
            sfxPlay.click();
          }}
        >
          {hud.speed}
          <small>››</small>
        </button>
        {showCount && <div className="countdown">{Math.ceil(hud.time)}</div>}
        {hud.paused && (
          <div className="pause-sheet">
            <h2>一時停止</h2>
            <button
              className="sortie"
              type="button"
              onClick={() => {
                const bat = battleRef.current;
                if (bat) bat.paused = false;
                sfxPlay.click();
              }}
            >
              再開
            </button>
            <button
              className="tab"
              type="button"
              onClick={() => {
                stopBattleMusic();
                sfxPlay.click();
                setScreen("deploy");
              }}
            >
              撤退
            </button>
            <button
              className="tab"
              type="button"
              onClick={() => {
                const n = !muted;
                setMuted(n);
                setMutedUi(n);
              }}
            >
              {muted ? "音声オフ" : "音声オン"}
            </button>
          </div>
        )}
        {hud.selected && !hud.paused && <div className="hint">自陣をタップして配置</div>}
        <div className="hand">
          <div className="mana">
            <div className="gem">{Math.floor(hud.mana)}</div>
          </div>
          {hud.hand.map((h) => {
            const def = cardById(h.id);
            const dim = hud.mana < def.cost || h.cd > 0;
            const on = hud.selected === h.id;
            return (
              <button
                key={h.id}
                className={`hcard ${dim ? "dim" : ""} ${on ? "on" : ""}`}
                type="button"
                onClick={() => {
                  const bat = battleRef.current;
                  if (!bat) return;
                  if (h.cd > 0 || bat.mana < def.cost) {
                    sfxPlay.deny();
                    return;
                  }
                  bat.selected = bat.selected === h.id ? null : h.id;
                  sfxPlay.click();
                }}
              >
                <img src={def.art} alt={def.name} />
                <span className="cc">{def.cost}</span>
                {h.cd > 0 && <span className="cd">{Math.ceil(h.cd)}s</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Result() {
  const result = useGame((s) => s.result);
  const setScreen = useGame((s) => s.setScreen);
  if (!result) return null;
  return (
    <div className="result">
      <img
        src={result.win ? "/game/blonde.jpg" : "/game/ice-golem.jpg"}
        alt=""
        width={140}
        height={140}
        style={{ borderRadius: 16, border: "3px solid #c9a227", objectFit: "cover" }}
      />
      <h1 style={{ color: result.win ? "#ffe08a" : "#e24a2a" }}>{result.win ? "勝利" : "敗北"}</h1>
      <p>
        自陣 {Math.round(result.playerHp)} / 敵陣 {Math.round(result.enemyHp)}
        <br />
        ゴールド +{result.goldEarned}
      </p>
      <button
        className="sortie"
        type="button"
        onClick={() => {
          sfxPlay.click();
          setScreen("deploy");
        }}
      >
        再出陣
      </button>
      <button
        className="tab"
        type="button"
        style={{ width: 200, borderRadius: 12 }}
        onClick={() => setScreen("collection")}
      >
        図鑑へ
      </button>
    </div>
  );
}
