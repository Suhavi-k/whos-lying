import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const rooms = new Map();

const PACKS = {
  "Everyday Things": ["Umbrella", "Toothbrush", "Backpack", "Mirror", "Candle", "Pillow", "Key", "Scissors", "Clock", "Sunglasses"],
  "Food & Drink":["Pizza", "Burger", "Pasta", "Sushi", "Tacos", "Sandwich", "Noodles", "Biryani", "Curry", "Salad", "Fries", "Ice Cream", "Chocolate", "Cake", "Donut", "Cookie", "Pancake", "Waffle", "Dumpling", "Momos", "Popcorn", "Apple", "Banana", "Mango", "Orange", "Watermelon", "Strawberry", "Grapes", "Cheese", "Butter", "Rice", "Bread", "Soup", "Omelette", "Hot Dog", "Shawarma", "Samosa", "Dosa", "Idli", "Pav Bhaji", "Lemonade", "Coffee"],
  "Places": ["Airport", "Library", "Beach", "Hospital", "Museum", "Cinema", "School", "Zoo", "Restaurant", "Stadium"],
  "Animals": ["Dog", "Cat", "Lion", "Tiger", "Elephant", "Giraffe", "Zebra", "Kangaroo", "Panda", "Bear", "Wolf", "Fox", "Rabbit", "Deer", "Horse", "Cow", "Goat", "Sheep", "Pig", "Monkey", "Gorilla", "Dolphin", "Shark", "Whale", "Penguin", "Owl", "Eagle", "Peacock", "Crocodile", "Snake", "Turtle", "Frog", "Camel", "Koala", "Octopus", "Flamingo", "Cheetah", "Rhino", "Hippopotamus", "Squirrel"],
  "Entertainment": ["Superhero", "Karaoke", "Video game", "Magic trick", "Cartoon", "Concert", "Podcast", "Board game", "Movie", "Circus"],
  "Countries": ["India", "Japan", "China", "United States", "Canada", "Brazil", "Australia", "Germany", "France", "Italy", "Spain", "Russia", "South Korea", "North Korea", "Mexico", "Argentina", "Egypt", "South Africa", "Nepal", "Bhutan", "Pakistan", "Bangladesh", "Sri Lanka", "New Zealand", "Norway", "Sweden", "Finland", "Iceland", "Switzerland", "Singapore"],
  "Video Games": ["Minecraft", "Valorant", "Fortnite", "Roblox", "PUBG", "Apex Legends", "Rocket League", "GTA V", "Terraria", "Among Us", "Clash Royale", "Clash of Clans", "Candy Crush", "Elden Ring", "Dark Souls", "Hollow Knight", "Celeste", "Stardew Valley", "Overwatch", "Call of Duty", "EA FC", "League of Legends", "Dota 2", "Genshin Impact", "Fall Guys", "Geometry Dash", "The Sims", "Skyrim", "The Legend of Zelda"],
  "Movies": ["Titanic", "Avatar", "Frozen", "Cars", "Coco", "Moana", "Up", "Jaws", "Inception", "Interstellar", "Joker", "Gladiator", "Shrek", "Minions", "Barbie", "Oppenheimer", "Dune", "Top Gun", "The Batman", "Superman", "Spider-Man", "Iron Man", "Avengers", "Deadpool", "The Lion King", "Jurassic Park", "Harry Potter", "Finding Nemo", "Toy Story", "Inside Out"],
  "TV Shows": ["Friends", "Stranger Things", "Wednesday", "Squid Game", "Breaking Bad", "Better Call Saul", "The Office", "Brooklyn Nine-Nine", "Game of Thrones", "House of the Dragon", "Loki", "WandaVision", "The Boys", "Arcane", "Money Heist", "Dark", "Sherlock", "Lucifer", "The Witcher", "The Last of Us"],
  "Sports": ["Football", "Cricket", "Basketball", "Tennis", "Badminton", "Volleyball", "Baseball", "Rugby", "Hockey", "Chess", "Boxing", "Wrestling", "Swimming", "Cycling", "Running", "Gymnastics", "Golf", "Table Tennis", "Formula 1", "Kabaddi"],
  "Technology": ["Phone", "Laptop", "Keyboard", "Mouse", "Monitor", "CPU", "GPU", "Headphones", "Earbuds", "Charger", "WiFi", "Bluetooth", "USB", "Camera", "Drone", "Smartwatch", "Tablet", "Printer", "Microphone", "Projector"]
};

const id = (n = 18) => randomBytes(n).toString("base64url");
const code = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result;
  do result = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); while (rooms.has(result));
  return result;
};
const clean = (value, max = 30) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

function nextImpostor(room) {
  const candidates = room.players
    .map((player) => player.id)
    .filter((playerId) => room.players.length === 1 || playerId !== room.lastImpostorId);
  return candidates[randomInt(candidates.length)];
}

function clueOrderFor(room) {
  const order = shuffle(room.players.map((player) => player.id));
  if (order.length > 1 && order[0] === room.impostorId) {
    const swapIndex = 1 + randomInt(order.length - 1);
    [order[0], order[swapIndex]] = [order[swapIndex], order[0]];
  }
  return order;
}

function roomFor(req, payload) {
  const room = rooms.get(clean(payload.code, 4).toUpperCase());
  if (!room) throw Error("Room not found");
  const player = room.players.find((p) => p.token === payload.token);
  if (!player) throw Error("You are no longer in this room");
  return { room, player };
}

function publicState(room, viewer) {
  if (room.phase === "reveal" && room.revealEndsAt && Date.now() >= room.revealEndsAt) room.phase = "clues";
  if (room.phase === "clueReview" && room.reviewEndsAt && Date.now() >= room.reviewEndsAt) {
    room.decisions = new Map();
    room.phase = "decision";
    room.reviewEndsAt = null;
  }
  const myTurn = room.phase === "clues" && room.turnOrder[room.turnIndex] === viewer.id;
  const voted = room.votes.has(viewer.id);
  const base = {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    me: { id: viewer.id, name: viewer.name },
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: true })),
    settings: room.settings,
    category: room.phase === "lobby" ? null : room.category,
    role: room.phase === "lobby" ? null : viewer.id === room.impostorId ? "impostor" : "player",
    word: room.phase === "lobby" || viewer.id === room.impostorId ? null : room.word,
    clues: room.clues,
    clueRound: room.clueRound,
    turnPlayerId: room.phase === "clues" ? room.turnOrder[room.turnIndex] : null,
    myTurn,
    voted,
    votesCast: room.votes.size,
    decided: room.decisions?.has(viewer.id) || false,
    decisionCount: room.decisions?.size || 0,
    result: room.result,
    ready: room.readyIds?.has(viewer.id) || false,
    readyCount: room.readyIds?.size || 0,
    kickThreshold: Math.floor(room.players.length / 2) + 1,
    myKickVoteTarget: [...(room.kickVotes || new Map()).entries()].find(([, voters]) => voters.has(viewer.id))?.[0] || null,
    kickVotes: Object.fromEntries(room.players.map((p) => [p.id, room.kickVotes?.get(p.id)?.size || 0])),
    revealEndsAt: room.phase === "reveal" ? room.revealEndsAt : null,
    reviewEndsAt: room.phase === "clueReview" ? room.reviewEndsAt : null
  };
  if (room.phase === "result") {
    base.word = room.word;
    base.impostorId = room.impostorId;
    base.voteCounts = Object.fromEntries(room.players.map((p) => [p.id, [...room.votes.values()].filter((v) => v === p.id).length]));
  }
  return base;
}

function resetToLobby(room) {
  room.phase = "lobby";
  room.category = null;
  room.word = null;
  room.impostorId = null;
  room.revealEndsAt = null;
  room.reviewEndsAt = null;
  room.turnOrder = [];
  room.turnIndex = 0;
  room.clues = [];
  room.clueRound = 1;
  room.votes = new Map();
  room.decisions = new Map();
  room.readyIds = new Set();
  room.kickVotes = new Map();
  room.result = null;
  room.updatedAt = Date.now();
}

function removePlayer(room, targetId) {
  const targetIndex = room.players.findIndex((player) => player.id === targetId);
  if (targetIndex === -1) throw Error("Player not found");
  const [target] = room.players.splice(targetIndex, 1);
  room.votes?.delete(target.id);
  room.decisions?.delete(target.id);
  room.readyIds?.delete(target.id);
  room.kickVotes?.delete(target.id);
  for (const voters of room.kickVotes?.values() || []) voters.delete(target.id);
  if (!room.players.length) {
    rooms.delete(room.code);
    return target;
  }
  if (room.hostId === target.id) room.hostId = room.players[0].id;
  resetToLobby(room);
  return target;
}

function startRound(room) {
  const source = room.customWords.length ? room.customWords : Object.entries(PACKS).flatMap(([category, words]) => words.map((word) => ({ category, word })));
  room.recentWords ||= [];
  const fresh = source.filter((entry) => !room.recentWords.includes(`${entry.category}::${entry.word}`));
  const pickFrom = fresh.length ? fresh : source;
  if (!fresh.length) room.recentWords = [];
  const pick = pickFrom[randomInt(pickFrom.length)];
  room.recentWords.push(`${pick.category}::${pick.word}`);
  room.recentWords = room.recentWords.slice(-Math.min(20, Math.max(3, source.length - 1)));
  room.category = pick.category;
  room.word = pick.word;
  room.impostorId = nextImpostor(room);
  room.lastImpostorId = room.impostorId;
  room.turnOrder = clueOrderFor(room);
  room.turnIndex = 0;
  room.clues = [];
  room.clueRound = 1;
  room.votes = new Map();
  room.decisions = new Map();
  room.readyIds = new Set();
  room.revealEndsAt = Date.now() + 6000;
  room.reviewEndsAt = null;
  room.result = null;
  room.phase = "reveal";
}

const actions = {
  create(payload) {
    const name = clean(payload.name);
    if (!name) throw Error("Enter your name");
    const roomCode = code();
    const player = { id: id(8), token: id(), name };
    rooms.set(roomCode, { code: roomCode, hostId: player.id, players: [player], phase: "lobby", settings: { maxPlayers: 10 }, customWords: [], recentWords: [], category: null, word: null, impostorId: null, lastImpostorId: null, impostorQueue: [], turnOrder: [], turnIndex: 0, clues: [], clueRound: 1, votes: new Map(), decisions: new Map(), readyIds: new Set(), kickVotes: new Map(), revealEndsAt: null, reviewEndsAt: null, result: null, updatedAt: Date.now() });
    return { code: roomCode, token: player.token };
  },
  join(payload) {
    const room = rooms.get(clean(payload.code, 4).toUpperCase());
    const name = clean(payload.name);
    if (!room) throw Error("That room doesn’t exist");
    if (room.phase !== "lobby") throw Error("That game has already started");
    if (!name) throw Error("Enter your name");
    if (room.players.length >= room.settings.maxPlayers) throw Error("That room is full");
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw Error("That name is already taken");
    const player = { id: id(8), token: id(), name };
    room.players.push(player); room.updatedAt = Date.now();
    return { code: room.code, token: player.token };
  },
  state(payload) {
    const { room, player } = roomFor(null, payload);
    room.kickVotes ||= new Map();
    return publicState(room, player);
  },
  leave(payload) {
    const roomCode = clean(payload.code, 4).toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return { ok: true, left: true };
    const playerIndex = room.players.findIndex((p) => p.token === payload.token);
    if (playerIndex === -1) return { ok: true, left: true };
    removePlayer(room, room.players[playerIndex].id);
    return { ok: true, left: true };
  },
  lobby(payload) {
    const { room, player } = roomFor(null, payload);
    if (player.id !== room.hostId) throw Error("Only the host can go back to the lobby");
    resetToLobby(room);
    return { ok: true };
  },
  kick(payload) {
    const { room, player } = roomFor(null, payload);
    if (player.id !== room.hostId) throw Error("Only the host can kick players");
    const targetId = String(payload.targetId || "");
    if (!targetId || targetId === player.id) throw Error("Choose another player");
    const target = room.players.find((p) => p.id === targetId);
    if (!target) throw Error("Player not found");
    removePlayer(room, target.id);
    return { ok: true, kicked: target.name };
  },
  votekick(payload) {
    const { room, player } = roomFor(null, payload);
    const targetId = String(payload.targetId || "");
    if (!targetId || targetId === player.id) throw Error("Choose another player");
    const target = room.players.find((p) => p.id === targetId);
    if (!target) throw Error("Player not found");
    room.kickVotes ||= new Map();
    for (const voters of room.kickVotes.values()) voters.delete(player.id);
    if (!room.kickVotes.has(target.id)) room.kickVotes.set(target.id, new Set());
    room.kickVotes.get(target.id).add(player.id);
    const threshold = Math.floor(room.players.length / 2) + 1;
    if (room.kickVotes.get(target.id).size >= threshold) {
      removePlayer(room, target.id);
      return { ok: true, kicked: target.name };
    }
    room.updatedAt = Date.now();
    return { ok: true, votes: room.kickVotes.get(target.id).size, threshold };
  },
  customize(payload) {
    const { room, player } = roomFor(null, payload);
    if (player.id !== room.hostId || room.phase !== "lobby") throw Error("Only the host can change the word pack");
    const category = clean(payload.category, 40);
    const words = String(payload.words ?? "").split(/[,\n]/).map((w) => clean(w, 50)).filter(Boolean);
    if (!category || words.length < 3) throw Error("Add a category and at least 3 words");
    room.customWords = words.map((word) => ({ category, word }));
    return { ok: true, count: words.length };
  },
  start(payload) {
    const { room, player } = roomFor(null, payload);
    if (player.id !== room.hostId) throw Error("Only the host can start");
    if (room.players.length < 3) throw Error("You need at least 3 players");
    startRound(room); return { ok: true };
  },
  ready(payload) {
    const { room } = roomFor(null, payload);
    if (room.phase !== "reveal") throw Error("The round has moved on");
    return { ok: true };
  },
  clue(payload) {
    const { room, player } = roomFor(null, payload);
    if (room.phase !== "clues" || room.turnOrder[room.turnIndex] !== player.id) throw Error("It isn’t your turn");
    const text = clean(payload.clue, 80);
    if (!text) throw Error("Enter a clue");
    if (text.toLowerCase() === room.word.toLowerCase()) throw Error("You can’t say the secret word");
    room.clues.push({ playerId: player.id, name: player.name, text, round: room.clueRound });
    room.turnIndex += 1;
    if (room.turnIndex >= room.turnOrder.length) {
      room.reviewEndsAt = Date.now() + 4500;
      room.phase = "clueReview";
    }
    return { ok: true };
  },
  decide(payload) {
    const { room, player } = roomFor(null, payload);
    if (room.phase !== "decision") throw Error("The group has already decided");
    if (room.decisions.has(player.id)) throw Error("You already chose");
    const choice = payload.choice === "clues" ? "clues" : payload.choice === "vote" ? "vote" : null;
    if (!choice) throw Error("Choose another clue round or vote now");
    room.decisions.set(player.id, choice);
    if (room.decisions.size === room.players.length) {
      const anotherCount = [...room.decisions.values()].filter((value) => value === "clues").length;
      const voteCount = room.players.length - anotherCount;
      if (anotherCount > voteCount) {
        room.clueRound += 1;
        room.turnOrder = clueOrderFor(room);
        room.turnIndex = 0;
        room.decisions = new Map();
        room.phase = "clues";
      } else {
        room.phase = "voting";
      }
    }
    return { ok: true };
  },
  vote(payload) {
    const { room, player } = roomFor(null, payload);
    if (room.phase !== "voting") throw Error("Voting isn’t open");
    if (room.votes.has(player.id)) throw Error("You already voted");
    const target = room.players.find((p) => p.id === payload.targetId);
    if (!target || target.id === player.id) throw Error("Choose another player");
    room.votes.set(player.id, target.id);
    if (room.votes.size === room.players.length) {
      const counts = room.players.map((p) => ({ id: p.id, count: [...room.votes.values()].filter((v) => v === p.id).length }));
      const max = Math.max(...counts.map((x) => x.count));
      const top = counts.filter((x) => x.count === max);
      room.result = { winner: top.length === 1 && top[0].id === room.impostorId ? "players" : "impostor", tie: top.length > 1 };
      room.phase = "result";
    }
    return { ok: true };
  },
  again(payload) {
    const { room, player } = roomFor(null, payload);
    if (player.id !== room.hostId) throw Error("Only the host can start another round");
    resetToLobby(room);
    return { ok: true };
  }
};

async function api(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const payload = body ? JSON.parse(body) : {};
    const action = req.url.split("/").pop();
    if (!actions[action]) throw Error("Unknown action");
    const result = actions[action](payload);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
  }
  if (req.method === "POST" && req.url.startsWith("/api/")) return api(req, res);
  const requested = req.url === "/" ? "index.html" : req.url.split("?")[0].slice(1);
  const file = normalize(join(ROOT, requested));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Cache-Control": "no-store"
    }); res.end(data);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(PORT, "0.0.0.0", () => console.log(`Who’s Lying is ready at http://localhost:${PORT}`));

setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [key, room] of rooms) if (room.updatedAt < cutoff) rooms.delete(key);
}, 60 * 60 * 1000).unref();
