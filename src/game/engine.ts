import { CARD_MAP, STAGE, scaledStat, type CardDef } from "./data";
import { sfxPlay } from "./audio";

export const COLS = 16;
export const ROWS = 10;
export const PLAYER_MAX_X = 7.6;
export const ENEMY_MIN_X = 8.2;

export type Team = "player" | "enemy";

export interface Ent {
  id: number;
  defId: string;
  team: Team;
  kind: "building" | "troop" | "hero" | "castle" | "spawner";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  range: number;
  rate: number;
  speed: number;
  splash: number;
  flying: boolean;
  special: CardDef["special"] | "none";
  cd: number;
  age: number;
  facing: number;
  state: "idle" | "walk" | "attack" | "die";
  dieT: number;
  stun: number;
  slow: number;
  burn: number;
  firstHit: boolean;
  cell?: { c: number; r: number };
  color: string;
  radius: number;
}

export interface Proj {
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  dmg: number;
  splash: number;
  team: Team;
  color: string;
  kind: "bolt" | "ice" | "fire" | "rock" | "star" | "magic";
  life: number;
  targetId: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "spark" | "smoke" | "ice" | "num" | "flame" | "star";
  text?: string;
}

export interface ZoneFx {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  dps: number;
  team: Team;
  kind: "fire" | "star" | "ice" | "poison";
}

export interface HandCard {
  id: string;
  cd: number;
  maxCd: number;
}

export type BattleEnd = { win: boolean; playerHp: number; enemyHp: number; elapsed: number };

export class Battle {
  ents: Ent[] = [];
  projs: Proj[] = [];
  parts: Particle[] = [];
  zones: ZoneFx[] = [];
  hand: HandCard[] = [];
  mana = 22;
  maxMana = 40;
  manaRegen = 1.15;
  time = STAGE.duration;
  elapsed = 0;
  speed = 1;
  paused = false;
  selected: string | null = null;
  hover: { x: number; y: number } | null = null;
  ended: BattleEnd | null = null;
  shake = 0;
  nextId = 1;
  spawnAcc = 0;
  wave = 0;
  occupied = new Set<string>();
  playerCastle!: Ent;
  enemyCastle!: Ent;
  levels: Record<string, number>;
  hitstop = 0;
  notify: ((m: string) => void) | null = null;
  private lastShootSfx = 0;

  constructor(deck: string[], levels: Record<string, number>) {
    this.levels = levels;
    this.hand = deck.slice(0, 8).map((id) => ({ id, cd: 0, maxCd: 0 }));
    this.playerCastle = this.spawnCastle("player", 0.4, 4.8, STAGE.playerHp);
    this.enemyCastle = this.spawnCastle("enemy", 15.15, 4.7, STAGE.enemyHp);
    this.placeEnemyBase();
  }

  private nid() {
    return this.nextId++;
  }

  private lv(id: string) {
    return this.levels[id] ?? 1;
  }

  private spawnCastle(team: Team, x: number, y: number, hp: number): Ent {
    const e: Ent = {
      id: this.nid(),
      defId: team === "player" ? "player-keep" : "enemy-keep",
      team,
      kind: "castle",
      x,
      y,
      hp,
      maxHp: hp,
      atk: 55,
      range: 3.2,
      rate: 0.7,
      speed: 0,
      splash: 0.6,
      flying: false,
      special: "none",
      cd: 0,
      age: 0,
      facing: team === "player" ? 1 : -1,
      state: "idle",
      dieT: 0,
      stun: 0,
      slow: 0,
      burn: 0,
      firstHit: true,
      color: team === "player" ? "#7ec8e3" : "#e24a2a",
      radius: team === "player" ? 0.85 : 1.15,
    };
    this.ents.push(e);
    return e;
  }

  private placeEnemyBase() {
    const spots: [number, number][] = [
      [8.55, 1.35],
      [8.75, 2.55],
      [8.55, 3.75],
      [8.8, 4.95],
      [8.6, 6.15],
      [8.75, 7.35],
      [8.5, 8.5],
      [10.05, 1.7],
      [10.25, 3.05],
      [10.1, 4.4],
      [10.3, 5.75],
      [10.05, 7.1],
      [10.2, 8.4],
      [11.7, 2.15],
      [11.9, 3.7],
      [11.75, 5.25],
      [11.95, 6.8],
      [11.65, 8.25],
      [13.25, 2.7],
      [13.45, 4.5],
      [13.2, 6.4],
      [13.4, 8.0],
    ];
    for (const [x, y] of spots) {
      this.ents.push({
        id: this.nid(),
        defId: "ice-spawner",
        team: "enemy",
        kind: "spawner",
        x,
        y,
        hp: 2200,
        maxHp: 2200,
        atk: 0,
        range: 0,
        rate: 0,
        speed: 0,
        splash: 0.3,
        flying: false,
        special: "freeze",
        cd: 1,
        age: 0,
        facing: -1,
        state: "idle",
        dieT: 0,
        stun: 0,
        slow: 0,
        burn: 0,
        firstHit: true,
        color: "#8fd4ea",
        radius: 0.92,
      });
    }
    this.ents.push({
      id: this.nid(),
      defId: "ice-golem",
      team: "enemy",
      kind: "hero",
      x: 11.8,
      y: 4.9,
      hp: 2600,
      maxHp: 2600,
      atk: 70,
      range: 1.3,
      rate: 0.7,
      speed: 0.5,
      splash: 0.8,
      flying: false,
      special: "freeze",
      cd: 0,
      age: 0,
      facing: -1,
      state: "idle",
      dieT: 0,
      stun: 0,
      slow: 0,
      burn: 0,
      firstHit: true,
      color: "#9ee7ff",
      radius: 0.72,
    });
  }

  cellKey(c: number, r: number) {
    return `${c},${r}`;
  }

  worldToCell(x: number, y: number) {
    return { c: Math.round(x), r: Math.round(y) };
  }

  canPlaceBuilding(x: number, y: number) {
    if (x < 0.5 || x > PLAYER_MAX_X || y < 0.5 || y > ROWS - 0.6) return false;
    const { c, r } = this.worldToCell(x, y);
    if (this.occupied.has(this.cellKey(c, r))) return false;
    const dx = x - this.playerCastle.x;
    const dy = y - this.playerCastle.y;
    if (dx * dx + dy * dy < 1.15) return false;
    return true;
  }

  canPlaceTroop(x: number, y: number) {
    return x >= 0.4 && x <= PLAYER_MAX_X && y >= 0.4 && y <= ROWS - 0.5;
  }

  tryPlay(id: string, x: number, y: number): boolean {
    if (this.ended || this.paused) return false;
    const card = this.hand.find((h) => h.id === id);
    const def = CARD_MAP[id];
    if (!card || !def) return false;
    if (card.cd > 0 || this.mana < def.cost) {
      sfxPlay.deny();
      return false;
    }
    if (def.kind === "building") {
      if (!this.canPlaceBuilding(x, y)) {
        sfxPlay.deny();
        return false;
      }
      const { c, r } = this.worldToCell(x, y);
      this.spawnFromDef(def, "player", c, r);
      this.occupied.add(this.cellKey(c, r));
      sfxPlay.deploy();
    } else if (def.kind === "spell") {
      this.castSpell(def, x, y);
      sfxPlay.spell();
    } else {
      if (!this.canPlaceTroop(x, y)) {
        sfxPlay.deny();
        return false;
      }
      const n = def.count || 1;
      for (let i = 0; i < n; i++) {
        const ox = (i % 2) * 0.35 - (n > 1 ? 0.15 : 0);
        const oy = Math.floor(i / 2) * 0.35 - 0.1;
        this.spawnFromDef(def, "player", x + ox, y + oy);
      }
      sfxPlay.deploy();
    }
    this.mana -= def.cost;
    card.cd = 2.2 + def.cost * 0.45;
    card.maxCd = card.cd;
    this.selected = null;
    return true;
  }

  private spawnFromDef(def: CardDef, team: Team, x: number, y: number) {
    const lv = this.lv(def.id);
    const e: Ent = {
      id: this.nid(),
      defId: def.id,
      team,
      kind: def.kind === "spell" ? "troop" : def.kind,
      x,
      y,
      hp: Math.max(1, scaledStat(def.hp, lv)),
      maxHp: Math.max(1, scaledStat(def.hp, lv)),
      atk: scaledStat(def.atk, lv),
      range: def.range,
      rate: def.rate,
      speed: def.speed,
      splash: def.splash,
      flying: def.flying,
      special: def.special,
      cd: 0.15,
      age: 0,
      facing: team === "player" ? 1 : -1,
      state: def.speed > 0 ? "walk" : "idle",
      dieT: 0,
      stun: 0,
      slow: 0,
      burn: 0,
      firstHit: true,
      cell: def.kind === "building" ? this.worldToCell(x, y) : undefined,
      color: def.tint,
      radius: def.kind === "building" ? 0.55 : def.kind === "hero" ? 0.42 : 0.32,
    };
    this.ents.push(e);
    return e;
  }

  private castSpell(def: CardDef, x: number, y: number) {
    const lv = this.lv(def.id);
    const atk = scaledStat(def.atk, lv);
    if (def.special === "starfall") {
      this.zones.push({
        x,
        y,
        r: def.radius,
        life: def.duration,
        max: def.duration,
        dps: atk / def.duration,
        team: "player",
        kind: "star",
      });
      this.burst(x, y, "#c46cff", 18);
    } else if (def.special === "meteor") {
      this.zones.push({
        x,
        y,
        r: def.radius,
        life: 0.7,
        max: 0.7,
        dps: atk / 0.5,
        team: "player",
        kind: "fire",
      });
      this.shake = Math.min(1, this.shake + 0.7);
      this.hitstop = 0.08;
      this.burst(x, y, "#ff6a2a", 28);
      sfxPlay.explode();
    } else if (def.special === "freeze") {
      this.applyAoE(x, y, def.radius, atk, "player", "ice");
      this.burst(x, y, "#9ee7ff", 20);
      sfxPlay.freeze();
    } else {
      this.applyAoE(x, y, def.radius, atk, "player", "fire");
      this.burst(x, y, "#ff6a2a", 16);
      sfxPlay.explode();
    }
  }

  private applyAoE(x: number, y: number, r: number, dmg: number, team: Team, elem: "ice" | "fire") {
    const r2 = r * r;
    for (const e of this.ents) {
      if (e.team === team || e.state === "die") continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2 + e.radius * e.radius) {
        this.damage(e, dmg, elem === "ice" ? "#9ee7ff" : "#ff8844");
        if (elem === "ice") {
          e.stun = Math.max(e.stun, 2.2);
          e.slow = Math.max(e.slow, 2.6);
        } else {
          e.burn = Math.max(e.burn, 2.4);
        }
      }
    }
  }

  burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 3.5;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.4,
        max: 0.7,
        size: 0.08 + Math.random() * 0.12,
        color,
        kind: "spark",
      });
    }
  }

  floatNum(x: number, y: number, n: number, color = "#fff4c8") {
    this.parts.push({
      x,
      y: y - 0.2,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -1.4,
      life: 0.7,
      max: 0.7,
      size: 0.2,
      color,
      kind: "num",
      text: `${Math.round(n)}`,
    });
  }

  damage(e: Ent, raw: number, color = "#fff4c8") {
    if (e.state === "die" || raw <= 0) return;
    const dmg = Math.max(1, raw);
    e.hp -= dmg;
    this.floatNum(e.x, e.y - 0.4, dmg, color);
    if (e.kind === "castle") this.shake = Math.min(1, this.shake + 0.12);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e: Ent) {
    if (e.state === "die") return;
    e.state = "die";
    e.dieT = 0.45;
    e.hp = 0;
    this.burst(e.x, e.y, e.color, 10);
    if (e.special === "bomb") {
      this.applyAoE(e.x, e.y, e.splash || 1.6, e.atk, e.team, "fire");
      sfxPlay.explode();
    }
    if (e.cell) this.occupied.delete(this.cellKey(e.cell.c, e.cell.r));
    if (e.kind === "castle") {
      this.ended = {
        win: e.team === "enemy",
        playerHp: Math.max(0, this.playerCastle.hp),
        enemyHp: Math.max(0, this.enemyCastle.hp),
        elapsed: this.elapsed,
      };
      if (this.ended.win) sfxPlay.win();
      else sfxPlay.lose();
    }
  }

  private nearestEnemy(from: Ent, range: number): Ent | null {
    const r2 = range * range;
    let best: Ent | null = null;
    let bestD = 1e9;
    for (const e of this.ents) {
      if (e.team === from.team || e.state === "die") continue;
      if (e.flying && from.range < 2 && from.kind !== "building" && !from.flying) continue;
      const dx = e.x - from.x;
      const dy = e.y - from.y;
      const d = dx * dx + dy * dy;
      if (d <= r2 && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private goalX(e: Ent) {
    return e.team === "player" ? this.enemyCastle.x : this.playerCastle.x;
  }

  private fire(from: Ent, to: Ent) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    from.facing = dx >= 0 ? 1 : -1;
    let kind: Proj["kind"] = "bolt";
    let color = from.color;
    if (from.special === "freeze") {
      kind = "ice";
      color = "#9ee7ff";
    } else if (from.special === "burn" || from.special === "firetrail") {
      kind = "fire";
      color = "#ff6a2a";
    } else if (from.defId === "catapult") kind = "rock";
    else if (from.defId === "purple-mage" || from.defId === "fairy" || from.defId === "starfall") {
      kind = "magic";
      color = from.color;
    }
    const spd = kind === "rock" ? 5.5 : 9.5;
    this.projs.push({
      x: from.x,
      y: from.y - 0.25,
      tx: to.x,
      ty: to.y,
      vx: (dx / len) * spd,
      vy: (dy / len) * spd,
      dmg: from.atk,
      splash: from.splash,
      team: from.team,
      color,
      kind,
      life: 1.6,
      targetId: to.id,
    });
    if (from.special === "firetrail" && from.firstHit) {
      this.zones.push({
        x: to.x,
        y: to.y,
        r: 1.1,
        life: 3,
        max: 3,
        dps: from.atk * 0.35,
        team: from.team,
        kind: "fire",
      });
      from.firstHit = false;
    }
    if (this.elapsed - this.lastShootSfx > 0.07) {
      sfxPlay.shoot();
      this.lastShootSfx = this.elapsed;
    }
  }

  private melee(from: Ent, to: Ent) {
    from.facing = to.x >= from.x ? 1 : -1;
    let dmg = from.atk;
    if (from.special === "cleave") {
      this.applyAoE(to.x, to.y, 1.15, from.atk * 0.55, from.team, "fire");
    }
    this.damage(to, dmg, from.color);
    if (from.special === "freeze") {
      to.slow = Math.max(to.slow, 1.4);
    }
    if (from.special === "burn") to.burn = Math.max(to.burn, 1.6);
    if (from.special === "bomb") {
      this.kill(from);
      return;
    }
    sfxPlay.hit();
  }

  private spawnWave(dt: number) {
    this.spawnAcc += dt;
    const interval = Math.max(3.2, 7.2 - this.elapsed * 0.014);
    if (this.spawnAcc < interval) return;
    this.spawnAcc = 0;
    this.wave++;
    const n = 2 + Math.min(4, Math.floor(this.elapsed / 32));
    const spawners = this.ents.filter((e) => e.kind === "spawner" && e.state !== "die");
    for (let i = 0; i < n; i++) {
      const sp = spawners[i % Math.max(1, spawners.length)];
      const x = (sp?.x ?? 12) + (Math.random() - 0.5) * 0.8;
      const y = (sp?.y ?? 5) + (Math.random() - 0.5) * 1.4;
      const isGolem = this.wave % 5 === 0 && i === 0;
      const isBoss = this.elapsed > 95 && this.wave % 7 === 0 && i === 0;
      const hp = isBoss ? 2400 : isGolem ? 780 : 95 + this.wave * 10;
      const atk = isBoss ? 72 : isGolem ? 40 : 11 + this.wave * 0.9;
      this.ents.push({
        id: this.nid(),
        defId: isBoss ? "boss" : isGolem ? "ice-golem" : "ice-creep",
        team: "enemy",
        kind: isBoss ? "hero" : "troop",
        x,
        y,
        hp,
        maxHp: hp,
        atk,
        range: isBoss ? 2.4 : isGolem ? 1.2 : 0.95,
        rate: isBoss ? 0.7 : 0.9,
        speed: isBoss ? 0.65 : isGolem ? 0.6 : 1.15,
        splash: isBoss ? 1.1 : 0,
        flying: false,
        special: "freeze",
        cd: 0.2,
        age: 0,
        facing: -1,
        state: "walk",
        dieT: 0,
        stun: 0,
        slow: 0,
        burn: 0,
        firstHit: true,
        color: isBoss ? "#c9e8ff" : isGolem ? "#9ee7ff" : "#7ec8e3",
        radius: isBoss ? 0.55 : isGolem ? 0.5 : 0.28,
      });
    }
  }

  update(dt: number) {
    if (this.ended || this.paused) return;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= 0.15;
    }
    dt *= this.speed;
    this.elapsed += dt;
    this.time = Math.max(0, STAGE.duration - this.elapsed);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    let manaMul = 1;
    for (const e of this.ents) {
      if (e.team === "player" && e.special === "mana" && e.state !== "die") manaMul += 0.35;
    }
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * manaMul * dt);
    for (const h of this.hand) h.cd = Math.max(0, h.cd - dt);

    this.spawnWave(dt);

    for (const e of this.ents) {
      if (e.state === "die") {
        e.dieT -= dt;
        continue;
      }
      e.age += dt;
      e.cd = Math.max(0, e.cd - dt);
      e.stun = Math.max(0, e.stun - dt);
      e.slow = Math.max(0, e.slow - dt);
      if (e.burn > 0) {
        e.burn -= dt;
        this.damage(e, 18 * dt, "#ff8844");
      }
      if (e.stun > 0) {
        e.state = "idle";
        continue;
      }

      if (e.special === "heal" && e.cd <= 0) {
        for (const a of this.ents) {
          if (a.team !== e.team || a.state === "die") continue;
          if (Math.hypot(a.x - e.x, a.y - e.y) < 2.6) {
            a.hp = Math.min(a.maxHp, a.hp + 22);
          }
        }
      }

      const aggRange = e.speed > 0 ? Math.max(e.range, 2.4) : e.range;
      const t = this.nearestEnemy(e, aggRange);
      if (t && Math.hypot(t.x - e.x, t.y - e.y) <= e.range + t.radius) {
        e.state = "attack";
        if (e.cd <= 0 && e.atk > 0) {
          e.cd = e.rate > 0 ? 1 / e.rate : 1;
          if (e.range > 1.4 || e.kind === "building" || e.kind === "castle" || e.kind === "spawner") {
            this.fire(e, t);
          } else {
            this.melee(e, t);
          }
        }
      } else if (e.speed > 0) {
        e.state = "walk";
        const gx = t ? t.x : this.goalX(e);
        const gy = t ? t.y : e.team === "player" ? this.enemyCastle.y : this.playerCastle.y;
        let dx = gx - e.x;
        let dy = gy - e.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        // light separation
        for (const o of this.ents) {
          if (o === e || o.state === "die" || o.team !== e.team) continue;
          const sx = e.x - o.x;
          const sy = e.y - o.y;
          const d = Math.hypot(sx, sy);
          if (d > 0.01 && d < 0.55) {
            dx += (sx / d) * 0.35;
            dy += (sy / d) * 0.35;
          }
        }
        const slen = Math.hypot(dx, dy) || 1;
        const slow = e.slow > 0 ? 0.45 : 1;
        e.x += (dx / slen) * e.speed * slow * dt;
        e.y += (dy / slen) * e.speed * slow * dt;
        e.y = Math.max(0.4, Math.min(ROWS - 0.5, e.y));
        e.facing = dx >= 0 ? 1 : -1;
      } else {
        e.state = "idle";
        if (e.cd <= 0 && e.atk > 0) {
          const far = this.nearestEnemy(e, e.range);
          if (far) {
            e.cd = e.rate > 0 ? 1 / e.rate : 1;
            this.fire(e, far);
          }
        }
      }
    }

    for (const p of this.projs) {
      p.life -= dt;
      const tgt = this.ents.find((e) => e.id === p.targetId && e.state !== "die");
      if (tgt) {
        const dx = tgt.x - p.x;
        const dy = tgt.y - 0.1 - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const spd = Math.hypot(p.vx, p.vy);
        p.vx = (dx / len) * spd;
        p.vy = (dy / len) * spd;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let hit = tgt;
      if (!hit) {
        for (const e of this.ents) {
          if (e.team === p.team || e.state === "die") continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 0.2) {
            hit = e;
            break;
          }
        }
      } else if (Math.hypot(hit.x - p.x, hit.y - p.y) > 0.35 && p.life > 0) {
        hit = undefined;
      }
      if (hit) {
        this.damage(hit, p.dmg, p.color);
        if (p.kind === "ice") {
          hit.slow = Math.max(hit.slow, 1.5);
          hit.stun = Math.max(hit.stun, 0.15);
        }
        if (p.kind === "fire") hit.burn = Math.max(hit.burn, 1.2);
        if (p.splash > 0.2) {
          for (const e of this.ents) {
            if (e === hit || e.team === p.team || e.state === "die") continue;
            if (Math.hypot(e.x - hit.x, e.y - hit.y) <= p.splash) this.damage(e, p.dmg * 0.45, p.color);
          }
        }
        this.burst(p.x, p.y, p.color, 5);
        p.life = 0;
      }
    }
    this.projs = this.projs.filter((p) => p.life > 0 && p.x > -1 && p.x < COLS + 1);

    for (const z of this.zones) {
      z.life -= dt;
      if (z.life > 0) {
        for (const e of this.ents) {
          if (e.team === z.team || e.state === "die") continue;
          if (Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.radius) {
            this.damage(e, z.dps * dt, z.kind === "star" ? "#e0b0ff" : "#ff8844");
            if (z.kind === "ice") e.slow = Math.max(e.slow, 0.4);
          }
        }
        if (z.kind === "star" && Math.random() < dt * 6) {
          this.parts.push({
            x: z.x + (Math.random() - 0.5) * z.r * 1.6,
            y: z.y - 1.4,
            vx: 0,
            vy: 4,
            life: 0.4,
            max: 0.4,
            size: 0.12,
            color: "#e8c4ff",
            kind: "star",
          });
        }
      }
    }
    this.zones = this.zones.filter((z) => z.life > 0);

    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === "num" ? 0.8 : 1.6) * dt;
    }
    if (this.parts.length > 220) this.parts.splice(0, this.parts.length - 180);
    this.parts = this.parts.filter((p) => p.life > 0);
    this.ents = this.ents.filter((e) => !(e.state === "die" && e.dieT <= 0));

    if (!this.ended && this.time <= 0) {
      this.ended = {
        win: false,
        playerHp: Math.max(0, this.playerCastle.hp),
        enemyHp: Math.max(0, this.enemyCastle.hp),
        elapsed: this.elapsed,
      };
      sfxPlay.lose();
    }
  }
}
