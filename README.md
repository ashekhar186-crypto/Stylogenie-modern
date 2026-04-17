# StyloGenie Modern

StyloGenie Modern is a full-stack AI fashion assistant that helps users digitize their wardrobe, understand clothing items with image-based classification, generate outfit recommendations, chat with an AI stylist, plan trip packing, schedule outfits on a calendar, and track wardrobe usage with analytics.

## Features

- AI clothing description and deep garment classification from uploaded images
- Digital wardrobe management with categories, colors, seasons, occasions, and style metadata
- Personalized outfit recommendation engine with compatibility and color-harmony logic
- AI fashion chat assistant with optional wardrobe-aware context
- Trip planner with packing suggestions, wardrobe matching, and travel styling help
- Outfit calendar for planning looks by date
- Wardrobe analytics including category breakdowns, gaps, trend insights, and wear tracking
- Authentication, protected routes, and member/admin views

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, React Query
- Backend: Express, TypeScript, Prisma, PostgreSQL
- AI integrations: local classifier, Ollama, Gemini, Groq, OpenRouter fallbacks
- Auth and security: JWT, cookies, Helmet, CORS, route protection, rate limiting

## Project Structure

```text
.
├── backend/      # Express API, Prisma schema, AI routes, middleware
├── frontend/     # Next.js app, pages, UI components, providers
├── package.json  # root workspace config
└── docker-compose.yml
```

## Core Modules

- `backend/src/routes/describe.ts`: image-based AI garment classification
- `backend/src/routes/recommend.ts`: outfit recommendation engine
- `backend/src/routes/chat.ts`: wardrobe-aware AI fashion assistant
- `backend/src/routes/trip.ts`: trip planner and packing suggestions
- `backend/src/routes/calendar.ts`: outfit planning calendar
- `backend/src/routes/stats.ts`: wardrobe insights and analytics

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Create a `backend/.env` file with your local configuration. Typical values include:

```bash
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
FRONTEND_URL=http://localhost:3000
PORT=4000
OPENROUTER_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
OPENWEATHER_API_KEY=
```

Only add the providers you actually use locally.

### 3. Run database setup

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate
cd ..
```

### 4. Start the apps

Backend:

```bash
cd backend
pnpm dev
```

Frontend:

```bash
cd frontend
pnpm dev
```

Frontend runs on `http://localhost:3000` and the backend API runs on `http://localhost:4000`.

## Available Scripts

Backend:

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm typecheck`
- `pnpm test`

Frontend:

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`

## Notes

- Keep `backend/.env` private and out of version control.
- Generated files such as `backend/dist/` and uploaded images in `backend/uploads/` are intentionally ignored.
- If GitHub ever flags a pushed secret, rotate that key immediately even if the push is blocked.

## Resume Description

Built StyloGenie, a full-stack AI fashion assistant using Next.js, React, Express, Prisma, and PostgreSQL that classifies clothing images, powers personalized outfit recommendations and fashion chat, and includes trip planning, outfit scheduling, and wardrobe analytics.
