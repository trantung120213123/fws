// script.js
// Yêu cầu: có 1 trong các file sau trong cùng thư mục:
// - stockfish.worker.js (tốt nhất) OR
// - stockfish.js AND stockfish.wasm (stockfish.js sẽ load wasm từ cùng folder)
// Tải gợi ý: https://cdn.jsdelivr.net/npm/stockfish.wasm@0.10.0/ (jsDelivr). :contentReference[oaicite:2]{index=2}

let board = null;
let game = new Chess();
let engine = null;
let engineReady = false;
let engineLogEl = document.getElementById('engineLog');
let statusEl = document.getElementById('status');
let fenEl = document.getElementById('fen');
let pgnEl = document.getElementById('pgn');
let movelistEl = document.getElementById('movelist');

const config = {
  draggable: true,
  position: 'start',
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd
};

// init board
board = Chessboard('board', config);

// ---------- Engine init ----------
function startEngine(){
  // prefer stockfish.worker.js (safer), else try stockfish.js
  const tryWorkerFiles = ['stockfish.worker.js', 'stockfish.js'];
  let created = false;

  for (const f of tryWorkerFiles){
    try {
      engine = new Worker(f);
      created = true;
      logEngine(`Worker created from ${f}`);
      break;
    } catch (e) {
      // continue try next
      logEngine(`Không tạo được Worker từ ${f}: ${e.message || e}`);
    }
  }

  if (!created) {
    setStatus('Không thể tạo Worker. Hãy tải stockfish.worker.js hoặc stockfish.js + stockfish.wasm vào cùng thư mục.');
    return;
  }

  engine.onmessage = function(e){
    const line = e.data && (typeof e.data === 'string' ? e.data : JSON.stringify(e.data));
    if (!line) return;
    logEngine(line);

    if (line === 'uciok') {
      engineReady = true;
      setStatus('Engine ready (uciok)');
      engine.postMessage('isready');
      return;
    }
    if (line === 'readyok') {
      setStatus('Engine ready (readyok)');
      return;
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const best = parts[1];
      if (best && best !== '(none)') {
        const move = parseUciMove(best);
        if (move) {
          game.move({from: move.from, to: move.to, promotion: move.promotion});
          board.position(game.fen());
          updateStatus();
        }
      }
    }

    // optionally parse info lines for depth/score if you want eval display
    // lines starting with 'info' can be parsed here
  };

  // start UCI handshake
  engine.postMessage('uci');
  setStatus('Khởi tạo engine...');
}

function parseUciMove(uci){
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0,2);
  const to = uci.slice(2,4);
  let promotion = undefined;
  if (uci.length === 5) promotion = uci[4];
  return {from, to, promotion};
}

function logEngine(text){
  engineLogEl.textContent += text + '\n';
  engineLogEl.scrollTop = engineLogEl.scrollHeight;
}

function setStatus(text){
  statusEl.textContent = 'Status: ' + text;
}

function updateFenPgn(){
  fenEl.textContent = 'FEN: ' + game.fen();
  pgnEl.textContent = 'PGN: ' + game.pgn();
  movelistEl.innerHTML = '';
  const history = game.history({verbose:true});
  history.forEach((m, i) => {
    const li = document.createElement('li');
    li.textContent = `${m.san}`;
    movelistEl.appendChild(li);
  });
}

function updateStatus(){
  if (game.in_checkmate()) {
    setStatus('Checkmate — ' + (game.turn() === 'w' ? 'Black' : 'White') + ' wins');
  } else if (game.in_draw()) {
    setStatus('Draw');
  } else {
    setStatus((game.turn() === 'w' ? 'White' : 'Black') + ' to move' + (game.in_check() ? ' — in check' : ''));
  }
  updateFenPgn();
}

// --- Board handlers ---
function onDragStart(source, piece, position, orientation) {
  if (game.game_over()) return false;
  const autoPlay = document.getElementById('autoPlay').checked;
  if (autoPlay && game.turn() === 'b') return false;
  if ((piece.search(/^b/) !== -1 && game.turn() === 'w') ||
      (piece.search(/^w/) !== -1 && game.turn() === 'b')) {
    return false;
  }
}

function onDrop(source, target) {
  const move = game.move({
    from: source,
    to: target,
    promotion: 'q' // auto queen
  });

  if (move === null) {
    return 'snapback';
  } else {
    updateStatus();
    sendPositionToEngine();
    // small timeout then maybe engine move
    setTimeout(maybeEngineMove, 40);
  }
}

function onSnapEnd() {
  board.position(game.fen());
}

// --- Engine interaction ---
function sendPositionToEngine(){
  if (!engine || !engineReady) return;
  engine.postMessage('position fen ' + game.fen());
}

function maybeEngineMove(){
  if (!engine || !engineReady) return;
  if (game.game_over()) return;
  const autoPlay = document.getElementById('autoPlay').checked;
  if (!autoPlay) return;

  if (game.turn() === 'b') {
    const movetime = parseInt(document.getElementById('movetime').value) || 200;
    // you can also use 'go depth N' or setoption for skilllevel
    engine.postMessage('position fen ' + game.fen());
    engine.postMessage('go movetime ' + movetime);
    setStatus('Engine thinking...');
  }
}

// --- UI buttons ---
document.getElementById('newBtn').addEventListener('click', ()=>{
  game.reset();
  board.start();
  updateStatus();
  if (engine) engine.postMessage('ucinewgame');
  sendPositionToEngine();
});

document.getElementById('undoBtn').addEventListener('click', ()=>{
  game.undo();
  game.undo(); // undo two plies to revert player+engine
  board.position(game.fen());
  updateStatus();
  sendPositionToEngine();
});

document.getElementById('flipBtn').addEventListener('click', ()=>{ board.flip(); });

document.getElementById('level').addEventListener('change', ()=>{
  // optional: map level -> setoption Skill Level if engine supports it
  const level = parseInt(document.getElementById('level').value);
  // many WASM builds support "UCI_LimitStrength" + "UCI_Elo" or "Skill Level"
  // Example (uncomment if engine supports):
  // engine.postMessage('setoption name Skill Level value ' + level);
});

document.getElementById('movetime').addEventListener('change', ()=>{ /* no-op */ });
document.getElementById('autoPlay').addEventListener('change', ()=>{ maybeEngineMove(); });

// start
startEngine();
updateStatus();
updateFenPgn();

// poll fen/pgn update
setInterval(updateFenPgn, 700);

// if engine không sẵn sàng sau 2s, thông báo
setTimeout(()=>{
  if (!engineReady) logEngine('Engine chưa sẵn sàng sau 2s — kiểm tra stockfish.js/worker và stockfish.wasm trong thư mục.');
}, 2000);

