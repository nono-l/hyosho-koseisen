import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GameApp } from "@/game/GameApp";

export const Route = createFileRoute("/")({ component: Home });

function Splash() {
  return (
    <div className="game-root">
      <div className="title">
        <img className="hero-art" src="/game/battlefield.jpg" alt="" />
        <h1>氷晶攻城戦</h1>
        <p>カードを戦場に置き、氷の本陣を砕け。</p>
        <button className="sortie" type="button">
          はじめる
        </button>
      </div>
    </div>
  );
}

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <Splash />;
  return <GameApp />;
}
