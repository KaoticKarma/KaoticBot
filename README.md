# KaoticBot 🤖

A comprehensive Kick chat bot for KaoticKarmaTV, featuring custom commands, moderation, loyalty points, alerts, and a web dashboard.

## Quick Start

### Prerequisites

- Node.js 20 or higher
- npm 10 or higher

### Installation

1. **Clone/Download the project**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Client Secret:
   ```
   KICK_CLIENT_SECRET=your_client_secret_here
   ```

4. **Generate secure secrets:**
   ```bash
   node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   ```
   Add these to your `.env` file.

5. **Start the bot:**
   ```bash
   npm run bot:dev
   ```

6. **Authenticate with Kick:**
   
   Open your browser and go to:
   ```
   http://localhost:3000/auth/login
   ```
   
   Follow the Kick login flow to authorize the bot.

## Project Structure

```
kaoticbot/
├── apps/
│   ├── bot/          # Bot backend (Node.js + Fastify)
│   └── dashboard/    # Web dashboard (React + Vite)
├── packages/
│   └── shared/       # Shared types and utilities
├── config/           # YAML configuration files
├── data/             # SQLite database
└── widgets/          # OBS overlay widgets
```

## Configuration

### Environment Variables (.env)

| Variable | Description |
|----------|-------------|
| `KICK_CLIENT_ID` | Your Kick app Client ID |
| `KICK_CLIENT_SECRET` | Your Kick app Client Secret |
| `KICK_BOT_USERNAME` | Bot account username |
| `KICK_CHANNEL` | Channel to connect to |
| `DATABASE_URL` | SQLite database path |
| `SESSION_SECRET` | 32-byte hex string for sessions |
| `JWT_SECRET` | 32-byte hex string for JWTs |

### Bot Configuration (config/default.yml)

Customize bot behavior including:
- Command prefix
- Moderation filters
- Points system settings
- Discord integration

## API Endpoints

### Authentication
- `GET /auth/status` - Check auth status
- `GET /auth/login` - Start OAuth flow
- `GET /auth/callback` - OAuth callback
- `POST /auth/logout` - Clear tokens

### Commands
- `GET /api/commands` - List all commands
- `POST /api/commands` - Create command
- `PUT /api/commands/:id` - Update command
- `DELETE /api/commands/:id` - Delete command

### Stats
- `GET /api/stats/overview` - Dashboard stats
- `GET /api/stats/leaderboard/points` - Top users by points
- `GET /api/stats/streams` - Recent stream sessions

## Development

```bash
# Run bot in development mode (with hot reload)
npm run bot:dev

# Run dashboard in development mode
npm run dashboard:dev

# Build for production
npm run build

# Run production
npm run start
```

## Features

- ✅ OAuth 2.1 + PKCE authentication
- ✅ Kick API integration
- ✅ SQLite database with Drizzle ORM
- ✅ REST API with Fastify
- ✅ Custom commands with variables
- 🚧 Chat WebSocket connection
- 🚧 Moderation system
- 🚧 Loyalty points
- 🚧 Alerts system
- 🚧 Discord integration
- 🚧 Web dashboard

## License

MIT
