# Who’s Lying?

A phone-friendly multiplayer deduction game. Everyone receives the secret word except the impostor, who sees only its category.

## Run it

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm start`.
4. Open `http://localhost:3000`.

For phones on the same Wi-Fi, use the computer’s local IPv4 address instead—for example, `http://192.168.1.5:3000`. On Windows, run `ipconfig` to find the address. Allow Node.js through Windows Firewall if prompted.

## Put it on the public web

The app is ready for any hosting service that supports Node.js or Docker:

- Start command: `npm start`
- Port: the server automatically uses the host’s `PORT` environment variable
- Health check: `/health`
- Docker: build with `docker build -t whos-lying .` and run with `docker run -p 3000:3000 whos-lying`

Once deployed, share the single HTTPS address with everyone. Players can use that same link from phones, tablets, or laptops, even when they are on different networks.

## Included

- 3–10 player rooms with four-character codes
- Private player/impostor role screens
- Built-in categories and words
- Host-created custom word packs
- Synced clue turns and clue history
- Anonymous voting, tie handling, and results
- Play-again flow with a fresh word and impostor
- No accounts, database, paid service, or package installation required

Rooms live in server memory and expire after six hours. Restarting or redeploying the server clears active rooms. Use one running server instance so every player in a room reaches the same game state.
