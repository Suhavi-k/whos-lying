const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
let session = JSON.parse(localStorage.getItem("lying-session") || "null");
let state = null;
let poller = null;
let selectedVote = null;
let lastRender = "";

const esc = (s) => String(s ?? "").replace(/[&<>\"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '\"':"&quot;", "'":"&#39;" }[c]));
const brand = `<div class="brand"><span class="brand-mark">?</span> WHO’S LYING</div>`;
const RESULT_ICONS = {
  playersWin: "🕵️",
  impostorWin: "🎭"
};
const notify = (message) => { toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2600); };
async function api(action, data = {}) {
  const res = await fetch(`/api/${action}`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ ...session, ...data }) });
  const json = await res.json();
  if (!res.ok) throw Error(json.error || "Something went wrong");
  return json;
}
async function act(action, data) { try { await api(action, data); await refresh(); } catch (e) { notify(e.message); } }
async function leaveGame() {
  try { await api("leave"); } catch {}
  stopPolling();
  session = null;
  state = null;
  selectedVote = null;
  lastRender = "";
  localStorage.removeItem("lying-session");
  home();
}

function home() {
  stopPolling();
  app.innerHTML = `${brand}<section class="hero"><div class="eyebrow">A game of suspicious clues</div><h1>Blend in.<br><em>Don’t</em> get caught.</h1><p>Everyone knows the secret word—except one player. Give clever clues, spot the liar, and trust absolutely no one.</p></section><div class="actions"><button class="primary" data-open="create">Create room</button><button class="secondary" data-open="join">Join room</button></div>`;
  app.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => entry(b.dataset.open));
}
function entry(mode) {
  app.innerHTML = `${brand}<div class="spacer"></div><section class="card stack"><div><div class="eyebrow">${mode === "create" ? "Start the suspicion" : "Enter the circle"}</div><h2>${mode === "create" ? "Create a room" : "Join a room"}</h2></div><label>Your name<input id="name" maxlength="30" autocomplete="nickname" placeholder="e.g. Sneaky Sam"></label>${mode === "join" ? '<label>Room code<input id="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD"></label>' : ""}<button class="primary" id="go">${mode === "create" ? "Create room" : "Join game"}</button><button class="ghost" id="back">Go back</button></section><div class="spacer"></div>`;
  document.querySelector("#back").onclick = home;
  document.querySelector("#go").onclick = async () => { try { const result = await api(mode, { name:document.querySelector("#name").value, code:document.querySelector("#code")?.value }); session = result; localStorage.setItem("lying-session", JSON.stringify(session)); await refresh(); startPolling(); } catch(e) { notify(e.message); } };
}
function shell(content) {
  const hostControls = state.me.id === state.hostId && state.phase !== "lobby"
    ? `<button class="mini secondary" id="back-lobby">Lobby</button>`
    : "";
  const managePanel = state.phase !== "lobby" && state.players.length > 1
    ? `<details class="card manage-panel"><summary><strong>Manage players</strong></summary><div class="manage-list">${state.players.filter((p) => p.id !== state.me.id).map((p) => `<div class="manage-row"><span>${esc(p.name)}${p.id === state.hostId ? " · host" : ""}</span><div class="player-actions">${state.me.id === state.hostId ? `<button class="mini danger" data-kick="${p.id}">Kick</button>` : ""}<button class="mini secondary ${state.myKickVoteTarget === p.id ? "selected-action" : ""}" data-votekick="${p.id}">Votekick ${state.kickVotes?.[p.id] || 0}/${state.kickThreshold}</button></div></div>`).join("")}</div></details>`
    : "";
  return `<header class="top">${brand}<div class="room-tools"><span class="room-code">${esc(state.code)}</span>${hostControls}<button class="mini ghost danger-text" id="leave-game">Leave</button></div></header>${managePanel}${content}`;
}
function lobby() {
  const host = state.me.id === state.hostId;
  const playerRows = state.players.map((p) => {
    const isMe = p.id === state.me.id;
    const isHost = p.id === state.hostId;
    const kickCount = state.kickVotes?.[p.id] || 0;
    const votedForThis = state.myKickVoteTarget === p.id;
    const controls = isMe ? "" : `<div class="player-actions">${host ? `<button class="mini danger" data-kick="${p.id}">Kick</button>` : ""}<button class="mini secondary ${votedForThis ? "selected-action" : ""}" data-votekick="${p.id}">Votekick ${kickCount}/${state.kickThreshold}</button></div>`;
    return `<div class="player"><span class="avatar">${esc(p.name[0].toUpperCase())}</span><div class="player-main"><strong>${esc(p.name)}${isMe ? " (you)" : ""}</strong>${isHost ? '<span class="host">HOST</span>' : ""}</div>${controls}</div>`;
  }).join("");
  app.innerHTML = shell(`<section><div class="eyebrow">Room ${esc(state.code)}</div><h2>The suspects</h2><p>Share the code. You need at least 3 players. Votekick needs ${state.kickThreshold} vote${state.kickThreshold === 1 ? "" : "s"}.</p><div class="player-list">${playerRows}</div>${host ? `<details class="card"><summary><strong>Use a custom word pack</strong></summary><div class="stack" style="margin-top:16px"><label>Category<input id="custom-category" placeholder="e.g. Bollywood"></label><label>Words<textarea id="custom-words" placeholder="One per line or separated by commas"></textarea></label><button class="secondary" id="save-pack">Save custom pack</button></div></details><button class="primary" id="start" style="width:100%;margin-top:14px">Start game</button>` : `<div class="card center"><span class="pill">Waiting for the host</span><p style="margin-top:10px">The game will begin soon.</p></div>`}</section>`);
  if (host) {
    document.querySelector("#start").onclick = () => act("start");
    document.querySelector("#save-pack").onclick = async () => { try { const r = await api("customize", { category:document.querySelector("#custom-category").value, words:document.querySelector("#custom-words").value }); notify(`${r.count} custom words saved`); } catch(e) { notify(e.message); } };
    app.querySelectorAll("[data-kick]").forEach((button) => button.onclick = () => act("kick", { targetId:button.dataset.kick }));
  }
  app.querySelectorAll("[data-votekick]").forEach((button) => button.onclick = () => act("votekick", { targetId:button.dataset.votekick }));
}
function reveal() {
  const imp = state.role === "impostor";
  app.innerHTML = shell(`<section class="center"><div class="eyebrow">Your secret role</div><h2>${imp ? "Keep your cool." : "Choose your clue."}</h2><div class="card secret ${imp ? "impostor" : ""}"><span class="pill">${imp ? "YOU ARE THE IMPOSTOR" : esc(state.category)}</span><div class="word">${imp ? esc(state.category) : esc(state.word)}</div><p>${imp ? "You only know the category. Listen closely and blend in." : "Don’t say the word itself. Be helpful—but not too helpful."}</p></div><div class="auto-next"><span>Next: clue round</span></div></section>`);
}
function clues() {
  const turn = state.players.find((p) => p.id === state.turnPlayerId);
  const reference = state.role === "impostor"
    ? `<div class="round-reference impostor-ref"><span>Category</span><strong>${esc(state.category)}</strong><small>Secret word unknown</small></div>`
    : `<div class="round-reference"><span>${esc(state.category)}</span><strong>${esc(state.word)}</strong></div>`;
  const currentClues = state.clues.filter((clue) => clue.round === state.clueRound);
  app.innerHTML = shell(`<section><div class="eyebrow">Clue round ${state.clueRound}</div><h2>Say just enough.</h2>${reference}<div class="turn"><span class="pulse"></span><div><span class="tiny">CURRENT TURN</span><br><strong>${esc(turn?.name)}${state.myTurn ? " — that’s you!" : ""}</strong></div></div>${currentClues.length ? `<div class="clues">${currentClues.map((c) => `<div class="clue"><strong>${esc(c.name)}</strong><span>${esc(c.text)}</span></div>`).join("")}</div>` : ""}${state.myTurn ? `<div class="card stack"><label>Your clue<input id="clue" maxlength="80" placeholder="A related word or short phrase"></label><button class="primary" id="submit-clue">Lock in clue</button></div>` : `<div class="card center"><p>Waiting for the current clue.</p></div>`}</section>`);
  if (state.myTurn) document.querySelector("#submit-clue").onclick = () => act("clue", { clue:document.querySelector("#clue").value });
}
function clueReview() {
  const reference = state.role === "impostor"
    ? `<div class="round-reference impostor-ref"><span>Category</span><strong>${esc(state.category)}</strong><small>Secret word unknown</small></div>`
    : `<div class="round-reference"><span>${esc(state.category)}</span><strong>${esc(state.word)}</strong></div>`;
  const currentClues = state.clues.filter((clue) => clue.round === state.clueRound);
  app.innerHTML = shell(`<section><div class="eyebrow">Clue round ${state.clueRound} complete</div><h2>Review the clues.</h2>${reference}<div class="clues">${currentClues.map((c) => `<div class="clue"><strong>${esc(c.name)}</strong><span>${esc(c.text)}</span></div>`).join("")}</div><div class="card center"><p>Everyone gets a moment to read the final clue before deciding.</p></div></section>`);
}
function decision() {
  app.innerHTML = shell(`<section class="center"><div class="eyebrow">Round ${state.clueRound} complete</div><h2>Ready to accuse?</h2><p>Everyone chooses. The majority decides; a tie goes to voting.</p>${state.decided ? `<div class="card" style="margin-top:22px"><span class="pill">CHOICE LOCKED</span><p style="margin-top:9px">${state.decisionCount} of ${state.players.length} players have chosen.</p></div>` : `<div class="decision-grid"><button class="choice-card" data-choice="clues"><span>💬</span><strong>Another clue round</strong><small>Everyone gives one more clue</small></button><button class="choice-card danger" data-choice="vote"><span>🗳️</span><strong>Vote now</strong><small>Choose who you think is lying</small></button></div>`}</section>`);
  if (!state.decided) app.querySelectorAll("[data-choice]").forEach((button) => button.onclick = () => act("decide", { choice:button.dataset.choice }));
}
function voting() {
  app.innerHTML = shell(`<section><div class="eyebrow">Time to accuse</div><h2>Who’s lying?</h2><p>Choose carefully. A wrong vote hands the impostor the win.</p><div class="vote-grid">${state.players.filter((p) => p.id !== state.me.id).map((p) => `<button class="vote ${selectedVote === p.id ? "selected" : ""}" data-vote="${p.id}" ${state.voted ? "disabled" : ""}><span class="avatar">${esc(p.name[0])}</span><strong>${esc(p.name)}</strong></button>`).join("")}</div>${state.voted ? `<div class="card center"><span class="pill">VOTE LOCKED</span><p style="margin-top:8px">${state.votesCast} of ${state.players.length} votes are in.</p></div>` : `<button class="primary" id="cast" style="width:100%" ${!selectedVote ? "disabled" : ""}>Cast vote</button>`}</section>`);
  if (!state.voted) {
    app.querySelectorAll("[data-vote]").forEach((b) => b.onclick = () => { selectedVote = b.dataset.vote; voting(); });
    document.querySelector("#cast").onclick = () => act("vote", { targetId:selectedVote });
  }
}
function result() {
  const won = state.result.winner === "players";
  const imp = state.players.find((p) => p.id === state.impostorId);
  const max = Math.max(...Object.values(state.voteCounts), 1);
  app.innerHTML = shell(`<section class="center"><div class="result-icon">${won ? RESULT_ICONS.playersWin : RESULT_ICONS.impostorWin}</div><div class="eyebrow">${won ? "Case closed" : "Fooled you"}</div><h2>${won ? "Players win!" : "Impostor wins!"}</h2><p style="margin:10px 0 22px"><strong>${esc(imp.name)}</strong> was the impostor. The word was <strong>${esc(state.word)}</strong>.</p><div class="card stack" style="text-align:left">${state.players.map((p) => `<div><div style="display:flex;justify-content:space-between"><span>${esc(p.name)}${p.id === state.impostorId ? " 🎭" : ""}</span><strong>${state.voteCounts[p.id]} vote${state.voteCounts[p.id] === 1 ? "" : "s"}</strong></div><div class="score"><i style="width:${state.voteCounts[p.id] / max * 100}%"></i></div></div>`).join("")}</div>${state.me.id === state.hostId ? '<button class="primary" id="again" style="width:100%;margin-top:14px">Play another round</button>' : '<p style="margin-top:18px">Waiting for the host to start another round.</p>'}</section>`);
  if (state.me.id === state.hostId) document.querySelector("#again").onclick = () => act("again");
}
function render() {
  ({ lobby, reveal, clues, clueReview, decision, voting, result }[state.phase] || home)();
  if (state?.phase) wireRoomControls();
}
function wireRoomControls() {
  const leave = document.querySelector("#leave-game");
  if (leave) leave.onclick = leaveGame;
  const backLobby = document.querySelector("#back-lobby");
  if (backLobby) backLobby.onclick = () => act("lobby");
  if (state?.me?.id === state?.hostId) app.querySelectorAll("[data-kick]").forEach((button) => button.onclick = () => act("kick", { targetId:button.dataset.kick }));
  app.querySelectorAll("[data-votekick]").forEach((button) => button.onclick = () => act("votekick", { targetId:button.dataset.votekick }));
}
async function refresh() { if (!session) return home(); try { const next = await api("state"); const signature = JSON.stringify(next); state = next; if (signature !== lastRender) { lastRender = signature; render(); } } catch(e) { stopPolling(); session = null; localStorage.removeItem("lying-session"); notify(e.message); home(); } }
function startPolling() { stopPolling(); poller = setInterval(refresh, 1400); }
function stopPolling() { if (poller) clearInterval(poller); poller = null; }
if (session) { refresh(); startPolling(); } else home();
