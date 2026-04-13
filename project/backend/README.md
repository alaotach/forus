# ForUs Backend Server

Production-ready backend API for AI-powered features in the ForUs couples app.

## Why This Backend?

The HackClub AI proxy (`https://ai.hackclub.com/proxy/v1`) has CORS restrictions that prevent direct API calls from web browsers. This backend server acts as a proxy, handling all AI generation on the server side and exposing CORS-enabled endpoints for the frontend.

## Features

- ✅ Daily writing prompt generation
- ✅ Deep conversation question generation
- ✅ Echo AI companion chat responses
- ✅ Conflict resolution prompt generation
- ✅ CORS-enabled for web app access
- ✅ Error handling with fallback flags
- ✅ Environment-based configuration

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your HackClub API key:

```env
HACKCLUB_API_KEY=your_hackclub_api_key_here
PORT=3000
NODE_ENV=development
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` with auto-reload enabled.

### 4. Run Production Server

```bash
npm start
```

## API Endpoints

### Health Check
- **GET** `/health`
- Returns: `{ status: 'ok' }`

### Generate Daily Writing Prompt
- **POST** `/api/generate-prompt`
- Body: `{ context?: CoupleContext }`
- Returns: `{ prompt: string, usedFallback: boolean }`

### Generate Deep Question
- **POST** `/api/generate-question`
- Body: `{ context?: CoupleContext }`
- Returns: `{ question: string, usedFallback: boolean }`

### Echo AI Chat
- **POST** `/api/echo-chat`
- Body: `{ userMessage: string, context: CoupleContext, conversationHistory?: Array }`
- Returns: `{ response: string, usedFallback: boolean }`

### Generate Conflict Prompt
- **POST** `/api/generate-conflict-prompt`
- Body: `{ situation?: string }`
- Returns: `{ prompt: string, usedFallback: boolean }`

## Deployment

### Option 1: Railway
1. Create account at [railway.app](https://railway.app)
2. Create new project
3. Connect GitHub repo or deploy from local
4. Add environment variable: `HACKCLUB_API_KEY`
5. Railway will auto-detect Node.js and run `npm start`
6. Copy the public URL and set as `EXPO_PUBLIC_BACKEND_URL` in your app

### Option 2: Render
1. Create account at [render.com](https://render.com)
2. Create new Web Service
3. Connect GitHub repo
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variable: `HACKCLUB_API_KEY`
7. Copy the public URL

### Option 3: Heroku
```bash
heroku create forus-backend
heroku config:set HACKCLUB_API_KEY=your_key_here
git subtree push --prefix backend heroku main
```

## Frontend Configuration

After deploying, update your app's environment:

### Development (uses localhost)
No changes needed - `__DEV__` flag automatically uses `http://localhost:3000`

### Production
Add to your app's environment variables or `.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://your-backend-url.com
```

## Testing

Test endpoints locally:

```bash
# Health check
curl http://localhost:3000/health

# Generate prompt
curl -X POST http://localhost:3000/api/generate-prompt \
  -H "Content-Type: application/json" \
  -d '{"context":{"nickname":"John","partnerNickname":"Jane","coupleCode":"ABC123"}}'
```

## Troubleshooting

### Port already in use
Change the `PORT` in `.env` to a different port (e.g., 3001)

### API key not working
Verify your HackClub API key is correct and active

### CORS errors
The server has CORS enabled for all origins. If you still see CORS errors, check:
- Server is running and accessible
- Frontend is using correct backend URL
- No proxy/firewall blocking requests

## Architecture

```
Frontend (Expo App)
    ↓
Backend Server (Express.js)
    ↓
HackClub AI Proxy
    ↓
OpenAI API (gpt-oss-120b)
```

The backend adds:
- CORS headers for browser compatibility
- Error handling and fallback responses
- Request validation
- Environment-based configuration

## Monitoring

Production logs can be viewed via your hosting platform:
- Railway: Dashboard → Deployments → Logs
- Render: Dashboard → Logs tab
- Heroku: `heroku logs --tail`

## Security

- Never commit `.env` file to version control
- Rotate API keys regularly
- Use HTTPS in production
- Monitor API usage and costs
- Implement rate limiting for production use
