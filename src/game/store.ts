import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CARDS, DEFAULT_DECK } from "./data";

export type Screen = "title" | "collection" | "detail" | "deploy" | "battle" | "result";
export type Filter = "all" | "building" | "troop" | "spell" | "hero";

export interface ResultState {
  win: boolean;
  playerHp: number;
  enemyHp: number;
  elapsed: number;
  goldEarned: number;
}

const NAME_A = ["氷", "影", "焔", "嵐", "霧", "鋼", "月", "雷", "雪", "蒼"];
const NAME_B = ["騎士", "弓手", "術士", "隊長", "斥候", "砲手", "衛士", "将"];

function randomCommanderName() {
  const a = NAME_A[Math.floor(Math.random() * NAME_A.length)];
  const b = NAME_B[Math.floor(Math.random() * NAME_B.length)];
  return `${a}の${b}${10 + Math.floor(Math.random() * 90)}`;
}

interface GameState {
  screen: Screen;
  gold: number;
  filter: Filter;
  selectedId: string | null;
  deck: string[];
  levels: Record<string, number>;
  frags: Record<string, number>;
  seen: Record<string, boolean>;
  result: ResultState | null;
  playerName: string;
  setScreen: (s: Screen) => void;
  setFilter: (f: Filter) => void;
  select: (id: string | null) => void;
  toggleDeck: (id: string) => void;
  setDeckSlot: (index: number, id: string) => void;
  levelUp: (id: string) => boolean;
  markSeen: (id: string) => void;
  applyResult: (r: ResultState) => void;
  addGold: (n: number) => void;
  setPlayerName: (n: string) => void;
}

function initialLevels() {
  const levels: Record<string, number> = {};
  const frags: Record<string, number> = {};
  const seen: Record<string, boolean> = {};
  for (const c of CARDS) {
    levels[c.id] = c.startLevel;
    frags[c.id] = c.startFrags;
    seen[c.id] = !c.isNew;
  }
  return { levels, frags, seen };
}

const init = initialLevels();

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      screen: "title",
      gold: 8450,
      filter: "all",
      selectedId: null,
      deck: [...DEFAULT_DECK],
      levels: init.levels,
      frags: init.frags,
      seen: init.seen,
      result: null,
      playerName: randomCommanderName(),
      setScreen: (screen) => set({ screen }),
      setFilter: (filter) => set({ filter }),
      select: (selectedId) => set({ selectedId }),
      toggleDeck: (id) => {
        const { deck } = get();
        const i = deck.indexOf(id);
        if (i >= 0) {
          const next = deck.filter((x) => x !== id);
          set({ deck: next });
          return;
        }
        if (deck.length >= 8) return;
        set({ deck: [...deck, id] });
      },
      setDeckSlot: (index, id) => {
        const deck = [...get().deck];
        const existing = deck.indexOf(id);
        if (existing >= 0) deck.splice(existing, 1);
        deck[index] = id;
        set({ deck: deck.filter(Boolean).slice(0, 8) });
      },
      levelUp: (id) => {
        const { gold, levels, frags } = get();
        const card = CARDS.find((c) => c.id === id);
        if (!card) return false;
        const lv = levels[id] ?? 1;
        const need = card.fragsNeed;
        const have = frags[id] ?? 0;
        const cost = 80 + lv * 40;
        if (have < need || gold < cost) return false;
        set({
          gold: gold - cost,
          levels: { ...levels, [id]: lv + 1 },
          frags: { ...frags, [id]: have - need },
        });
        return true;
      },
      markSeen: (id) => set({ seen: { ...get().seen, [id]: true } }),
      applyResult: (result) => {
        const extraFrags: Record<string, number> = { ...get().frags };
        if (result.win) {
          for (const id of get().deck) extraFrags[id] = (extraFrags[id] ?? 0) + 1;
        }
        set({
          result,
          gold: get().gold + result.goldEarned,
          frags: extraFrags,
          screen: "result",
        });
      },
      addGold: (n) => set({ gold: get().gold + n }),
      setPlayerName: (playerName) => set({ playerName: playerName.trim().slice(0, 16) || get().playerName }),
    }),
    { name: "ice-siege-v2" },
  ),
);
