'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// Game configuration types
type SpriteType = 'spaceship' | 'bird' | 'robot';
type BackgroundType = 'stars' | 'city' | 'grid';
type ObstaclePattern = 'asteroids' | 'walls' | 'blocks';
type SpeedType = 'slow' | 'medium' | 'fast';

interface GameConfig {
  sprite: SpriteType;
  background: BackgroundType;
  pattern: ObstaclePattern;
  speed: SpeedType;
}

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  vx?: number;
  vy: number;
}

interface GameState {
  isPlaying: boolean;
  isGameOver: boolean;
  score: number;
  player: Player;
  obstacles: Obstacle[];
}

// Audio system
class AudioSystem {
  private audioContext: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private isMusicPlaying: boolean = false;

  init() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.musicGain = this.audioContext.createGain();
      this.musicGain.connect(this.audioContext.destination);
      this.musicGain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    }
  }

  playBlip() {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.1);
  }

  playBoom() {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.5);
  }

  playStartSound() {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.2);
  }

  toggleMusic() {
    if (!this.audioContext || !this.musicGain) return;
    
    if (this.isMusicPlaying) {
      this.musicGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.isMusicPlaying = false;
    } else {
      this.musicGain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      this.playChiptune();
      this.isMusicPlaying = true;
    }
  }

  private playChiptune() {
    if (!this.audioContext || !this.musicGain) return;
    
    const notes = [440, 523, 659, 784, 659, 523];
    let noteIndex = 0;
    
    const playNote = () => {
      if (!this.audioContext || !this.musicGain || !this.isMusicPlaying) return;
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.musicGain);
      
      oscillator.frequency.setValueAtTime(notes[noteIndex], this.audioContext.currentTime);
      oscillator.type = 'square';
      gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);
      
      noteIndex = (noteIndex + 1) % notes.length;
      setTimeout(playNote, 400);
    };
    
    playNote();
  }
}

const audioSystem = new AudioSystem();

// Bolt Badge Component
const BoltBadge = () => {
  return (
    <div className="fixed top-4 right-4 z-50">
      <a 
        href="https://bolt.new" 
        target="_blank" 
        rel="noopener noreferrer"
        className="block w-12 h-12 hover:scale-110 transition-transform duration-200 opacity-80 hover:opacity-100"
        title="Built with Bolt"
      >
        <img
          src="https://raw.githubusercontent.com/kickiniteasy/bolt-hackathon-badge/main/src/public/bolt-badge/white_circle_360x360/white_circle_360x360.svg"
          alt="Built with Bolt"
          width="48"
          height="48"
          className="drop-shadow-lg rounded-full"
        />
      </a>
    </div>
  );
};

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Game configuration state
  const [config, setConfig] = useState<GameConfig>({
    sprite: 'spaceship',
    background: 'stars',
    pattern: 'asteroids',
    speed: 'medium'
  });
  
  const [gameState, setGameState] = useState<GameState>({
    isPlaying: false,
    isGameOver: false,
    score: 0,
    player: { x: 384, y: 568, width: 32, height: 32 },
    obstacles: []
  });
  
  const [showInstructions, setShowInstructions] = useState(true);
  const [showConfig, setShowConfig] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const keysPressed = useRef<Set<string>>(new Set());
  
  // Speed mapping
  const speedMap = {
    slow: 2,
    medium: 4,
    fast: 6
  };

  // Initialize audio system
  useEffect(() => {
    audioSystem.init();
  }, []);

  // Load configuration from URL params
  useEffect(() => {
    const sprite = searchParams.get('sprite') as SpriteType;
    const background = searchParams.get('bg') as BackgroundType;
    const pattern = searchParams.get('pattern') as ObstaclePattern;
    const speed = searchParams.get('speed') as SpeedType;
    
    if (sprite || background || pattern || speed) {
      setConfig(prev => ({
        sprite: sprite || prev.sprite,
        background: background || prev.background,
        pattern: pattern || prev.pattern,
        speed: speed || prev.speed
      }));
    }
  }, [searchParams]);

  // Update URL when config changes
  const updateURL = useCallback((newConfig: GameConfig) => {
    const params = new URLSearchParams();
    params.set('sprite', newConfig.sprite);
    params.set('bg', newConfig.background);
    params.set('pattern', newConfig.pattern);
    params.set('speed', newConfig.speed);
    router.push(`?${params.toString()}`);
  }, [router]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
        e.preventDefault();
        if (!keysPressed.current.has(key)) {
          keysPressed.current.add(key);
          audioSystem.playBlip();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Collision detection
  const checkCollision = (player: Player, obstacle: Obstacle): boolean => {
    return (
      player.x < obstacle.x + obstacle.width &&
      player.x + player.width > obstacle.x &&
      player.y < obstacle.y + obstacle.height &&
      player.y + player.height > obstacle.y
    );
  };

  // Generate obstacles based on pattern
  const generateObstacles = (pattern: ObstaclePattern): Obstacle[] => {
    const speed = speedMap[config.speed];
    
    switch (pattern) {
      case 'asteroids':
        return Array.from({ length: 8 }, () => ({
          x: Math.random() * 736, // 768 - 32
          y: Math.random() * -600,
          width: 32,
          height: 32,
          vy: speed
        }));
      
      case 'walls':
        return Array.from({ length: 3 }, (_, i) => ({
          x: i * 300,
          y: -100 - (i * 200),
          width: 200,
          height: 50,
          vx: i % 2 === 0 ? speed : -speed,
          vy: speed
        }));
      
      case 'blocks':
        return Array.from({ length: 12 }, () => ({
          x: Math.random() * 748, // 768 - 20
          y: Math.random() * -300,
          width: 20,
          height: 20,
          vy: speed
        }));
      
      default:
        return [];
    }
  };

  // Game loop
  const gameLoop = useCallback(() => {
    if (!gameState.isPlaying || gameState.isGameOver) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Update player position
    setGameState(prevState => {
      const newPlayer = { ...prevState.player };
      
      // Handle movement
      if (keysPressed.current.has('arrowleft') || keysPressed.current.has('a')) {
        newPlayer.x = Math.max(0, newPlayer.x - 10);
      }
      if (keysPressed.current.has('arrowright') || keysPressed.current.has('d')) {
        newPlayer.x = Math.min(768 - newPlayer.width, newPlayer.x + 10);
      }
      
      // Update obstacles
      const speed = speedMap[config.speed];
      const newObstacles = prevState.obstacles.map(obstacle => {
        const updatedObstacle = { ...obstacle };
        updatedObstacle.y += updatedObstacle.vy;
        
        if (updatedObstacle.vx) {
          updatedObstacle.x += updatedObstacle.vx;
          
          // Reverse direction if hitting canvas edges for walls
          if (config.pattern === 'walls') {
            if (updatedObstacle.x <= 0 || updatedObstacle.x >= 768 - updatedObstacle.width) {
              updatedObstacle.vx = -updatedObstacle.vx;
            }
          }
        }
        
        // Respawn obstacles that have moved off screen
        if (updatedObstacle.y > 600) {
          updatedObstacle.y = Math.random() * -200;
          if (config.pattern === 'asteroids' || config.pattern === 'blocks') {
            updatedObstacle.x = Math.random() * (768 - updatedObstacle.width);
          }
        }
        
        return updatedObstacle;
      });
      
      // Check collisions
      const collision = newObstacles.some(obstacle => checkCollision(newPlayer, obstacle));
      
      if (collision) {
        audioSystem.playBoom();
        return {
          ...prevState,
          isGameOver: true,
          player: newPlayer
        };
      }
      
      return {
        ...prevState,
        player: newPlayer,
        obstacles: newObstacles,
        score: prevState.score + 1
      };
    });
    
    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameState.isPlaying, gameState.isGameOver, config.speed, config.pattern]);

  // Start animation loop when game starts
  useEffect(() => {
    if (gameState.isPlaying && !gameState.isGameOver) {
      animationRef.current = requestAnimationFrame(gameLoop);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState.isPlaying, gameState.isGameOver, gameLoop]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, 800, 600);
    
    // Draw background
    ctx.save();
    switch (config.background) {
      case 'stars':
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < 100; i++) {
          const x = Math.random() * 800;
          const y = Math.random() * 600;
          ctx.fillRect(x, y, 2, 2);
        }
        break;
      
      case 'city':
        ctx.fillStyle = '#00FFFF';
        for (let i = 0; i < 10; i++) {
          const x = i * 80;
          const height = 100 + Math.random() * 200;
          ctx.fillRect(x, 600 - height, 60, height);
        }
        break;
      
      case 'grid':
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 800; i += 40) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 600);
          ctx.stroke();
        }
        for (let i = 0; i <= 600; i += 40) {
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(800, i);
          ctx.stroke();
        }
        break;
    }
    ctx.restore();
    
    if (gameState.isPlaying) {
      // Draw player
      ctx.save();
      ctx.fillStyle = '#00FF00';
      const { x, y, width, height } = gameState.player;
      
      switch (config.sprite) {
        case 'spaceship':
          ctx.beginPath();
          ctx.moveTo(x + width / 2, y);
          ctx.lineTo(x, y + height);
          ctx.lineTo(x + width, y + height);
          ctx.closePath();
          ctx.fill();
          break;
        
        case 'bird':
          ctx.beginPath();
          ctx.arc(x + width / 2, y + height / 2, width / 2, 0, 2 * Math.PI);
          ctx.fill();
          break;
        
        case 'robot':
          ctx.fillRect(x, y, width, height);
          break;
      }
      ctx.restore();
      
      // Draw obstacles
      ctx.save();
      gameState.obstacles.forEach(obstacle => {
        switch (config.pattern) {
          case 'asteroids':
            ctx.fillStyle = '#FF00FF';
            ctx.beginPath();
            ctx.arc(
              obstacle.x + obstacle.width / 2,
              obstacle.y + obstacle.height / 2,
              obstacle.width / 2,
              0,
              2 * Math.PI
            );
            ctx.fill();
            break;
          
          case 'walls':
            ctx.fillStyle = '#00FFFF';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            break;
          
          case 'blocks':
            ctx.fillStyle = '#FFFF00';
            ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
            break;
        }
      });
      ctx.restore();
      
      // Draw score
      ctx.save();
      ctx.fillStyle = '#00FF00';
      ctx.font = '16px "Press Start 2P"';
      ctx.fillText(`Score: ${Math.floor(gameState.score / 60)}`, 20, 40);
      ctx.restore();
    }
  }, [gameState, config]);

  const startGame = () => {
    audioSystem.playStartSound();
    updateURL(config);
    
    setGameState({
      isPlaying: true,
      isGameOver: false,
      score: 0,
      player: { x: 384, y: 568, width: 32, height: 32 },
      obstacles: generateObstacles(config.pattern)
    });
    
    setShowConfig(false);
    
    if (musicEnabled) {
      audioSystem.toggleMusic();
    }
  };

  const restartGame = () => {
    audioSystem.playStartSound();
    
    setGameState({
      isPlaying: true,
      isGameOver: false,
      score: 0,
      player: { x: 384, y: 568, width: 32, height: 32 },
      obstacles: generateObstacles(config.pattern)
    });
  };

  const reconfigureGame = () => {
    setGameState(prev => ({
      ...prev,
      isPlaying: false,
      isGameOver: false
    }));
    setShowConfig(true);
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = 'retro-game-screenshot.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const toggleMusic = () => {
    setMusicEnabled(!musicEnabled);
    audioSystem.toggleMusic();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white relative">
      {/* Bolt Badge */}
      <BoltBadge />

      {/* Instructions Overlay */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border-2 border-green-500 neon-border p-6 rounded-lg max-w-md">
            <h2 className="pixel-font text-green-500 neon-text text-lg mb-4">Game Instructions</h2>
            <p className="pixel-font text-sm mb-4 text-gray-300">
              Use arrow keys or WASD to move. Create your game below!
            </p>
            <button
              onClick={() => setShowInstructions(false)}
              className="pixel-font bg-green-500 hover:bg-green-400 text-black px-4 py-2 border-2 border-black transition-all duration-200 hover:shadow-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState.isGameOver && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-40 p-4">
          <div className="bg-gray-900 border-2 border-red-500 neon-border p-8 rounded-lg max-w-md w-full">
            <h2 className="pixel-font text-red-500 neon-text text-xl mb-6 text-center">Game Over!</h2>
            <p className="pixel-font text-white text-center mb-6">
              Final Score: {Math.floor(gameState.score / 60)} seconds
            </p>
            <div className="space-y-4">
              <button
                onClick={restartGame}
                className="w-full pixel-font bg-green-500 hover:bg-green-400 text-black px-4 py-3 border-2 border-black transition-all duration-200 pulse-neon"
              >
                Restart
              </button>
              <button
                onClick={reconfigureGame}
                className="w-full pixel-font bg-blue-500 hover:bg-blue-400 text-black px-4 py-3 border-2 border-black transition-all duration-200"
              >
                Reconfigure
              </button>
              <button
                onClick={downloadCanvas}
                className="w-full pixel-font bg-purple-500 hover:bg-purple-400 text-black px-4 py-3 border-2 border-black transition-all duration-200"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        <h1 className="pixel-font text-4xl text-center mb-8 text-cyan-500 neon-text">
          Retro Arcade Game Creator
        </h1>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Configuration Panel */}
          {showConfig && (
            <div className="w-full lg:w-1/3">
              <div className="bg-gray-800 border-2 border-cyan-500 neon-border p-6 rounded-lg">
                <h2 className="pixel-font text-cyan-500 neon-text text-xl mb-6">Game Configuration</h2>
                
                <div className="space-y-6">
                  {/* Sprite Selection */}
                  <div>
                    <label className="pixel-font text-green-500 block mb-2">Player Sprite:</label>
                    <select
                      value={config.sprite}
                      onChange={(e) => setConfig(prev => ({ ...prev, sprite: e.target.value as SpriteType }))}
                      className="w-full bg-gray-700 border-2 border-green-500 text-white pixel-font p-2 rounded"
                    >
                      <option value="spaceship">Spaceship (Triangle)</option>
                      <option value="bird">Bird (Circle)</option>
                      <option value="robot">Robot (Square)</option>
                    </select>
                  </div>

                  {/* Background Selection */}
                  <div>
                    <label className="pixel-font text-magenta-500 block mb-2">Background:</label>
                    <select
                      value={config.background}
                      onChange={(e) => setConfig(prev => ({ ...prev, background: e.target.value as BackgroundType }))}
                      className="w-full bg-gray-700 border-2 border-pink-500 text-white pixel-font p-2 rounded"
                    >
                      <option value="stars">Starry Sky</option>
                      <option value="city">Pixel City</option>
                      <option value="grid">Neon Grid</option>
                    </select>
                  </div>

                  {/* Obstacle Pattern */}
                  <div>
                    <label className="pixel-font text-yellow-500 block mb-2">Obstacle Pattern:</label>
                    <select
                      value={config.pattern}
                      onChange={(e) => setConfig(prev => ({ ...prev, pattern: e.target.value as ObstaclePattern }))}
                      className="w-full bg-gray-700 border-2 border-yellow-500 text-white pixel-font p-2 rounded"
                    >
                      <option value="asteroids">Falling Asteroids</option>
                      <option value="walls">Horizontal Walls</option>
                      <option value="blocks">Random Blocks</option>
                    </select>
                  </div>

                  {/* Speed Selection */}
                  <div>
                    <label className="pixel-font text-blue-500 block mb-2">Obstacle Speed:</label>
                    <select
                      value={config.speed}
                      onChange={(e) => setConfig(prev => ({ ...prev, speed: e.target.value as SpeedType }))}
                      className="w-full bg-gray-700 border-2 border-blue-500 text-white pixel-font p-2 rounded"
                    >
                      <option value="slow">Slow</option>
                      <option value="medium">Medium</option>
                      <option value="fast">Fast</option>
                    </select>
                  </div>

                  {/* Music Toggle */}
                  <div>
                    <label className="pixel-font text-purple-500 block mb-2">Music:</label>
                    <button
                      onClick={toggleMusic}
                      className={`w-full pixel-font px-4 py-2 border-2 border-purple-500 transition-all duration-200 ${
                        musicEnabled 
                          ? 'bg-purple-500 text-black' 
                          : 'bg-gray-700 text-purple-500 hover:bg-purple-500 hover:text-black'
                      }`}
                    >
                      {musicEnabled ? 'Music On' : 'Music Off'}
                    </button>
                  </div>

                  <button
                    onClick={startGame}
                    className="w-full pixel-font bg-green-500 hover:bg-green-400 text-black px-6 py-4 border-2 border-black transition-all duration-200 pulse-neon text-lg"
                  >
                    Start Game
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Game Canvas */}
          <div className="flex-1 flex justify-center">
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="border-2 border-white neon-border bg-gray-900 max-w-full h-auto"
                style={{ imageRendering: 'pixelated' }}
              />
              
              {!gameState.isPlaying && !showConfig && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                  <div className="text-center">
                    <p className="pixel-font text-white text-xl mb-4">Ready to Play!</p>
                    <button
                      onClick={startGame}
                      className="pixel-font bg-green-500 hover:bg-green-400 text-black px-6 py-3 border-2 border-black transition-all duration-200"
                    >
                      Start Game
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Info */}
        <div className="mt-8 text-center">
          <p className="pixel-font text-gray-400 text-sm">
            Use Arrow Keys or WASD to move • Avoid obstacles • Survive as long as possible!
          </p>
        </div>
      </div>
    </div>
  );
}