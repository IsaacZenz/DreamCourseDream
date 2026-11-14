import { startGame } from './render/game';

const parent = document.getElementById('game');
if (!parent) throw new Error('Missing #game element in index.html');
const game = startGame(parent);

// Exposed for local debugging and the screenshot/smoke tools.
(window as unknown as { __game: typeof game }).__game = game;
