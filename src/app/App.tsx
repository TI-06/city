import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from '../game/create-game';
import './app.css';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const game: Phaser.Game = createGame(host);

    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <main className="city-app" data-testid="city-app">
      <header className="city-hud">
        <strong>CITY</strong>
        <span>Development Build</span>
      </header>
      <div className="game-canvas-host" data-testid="game-canvas-host" ref={hostRef} />
    </main>
  );
}
