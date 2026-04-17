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

### Generate Media Upload URL
- **POST** `/generate-upload-url`
- Headers: `Authorization: Bearer <media_token>`
- Body: `{ type: 'image' | 'audio', userId: string, coupleCode: string, mimeType: string, fileSize: number, fileExtension?: string }`
- Returns:
    - `mediaDraft.fileKey`
    - `finalize.uploadTicket` (short-lived finalize token)
    - `upload.url` (short-lived signed S3 PUT URL)

### Complete Media Upload
- **POST** `/complete-upload`
- Headers: `Authorization: Bearer <media_token>`
- Body: `{ uploadTicket: string }`
- Returns:
    - `media.id` (metadata id)
    - `media.fileKey`
    - `media.proxyUrl` (stable backend URL: `/media/:id?raw=1`)

### Resolve / Stream Media
- **GET** `/media/:id`
- Headers: `Authorization: Bearer <media_token>`
- Returns JSON with short-lived `access.url` signed GET URL

### Direct Playback Redirect (no S3 exposure in app data)
- **GET** `/media/:id?raw=1`
- Headers: `Authorization: Bearer <media_token>`
- Returns HTTP 302 redirect to short-lived signed GET URL
- Useful for `Image`, `Video`, and audio players with a stable backend URL

### Issue Media Auth Token
- **POST** `/media/auth/token`
- Body: `{ userId: string, coupleCode: string }`
- Returns short-lived JWT for media endpoints

### Delete Media (lifecycle cleanup)
- **DELETE** `/media/:id`
- Headers: `Authorization: Bearer <media_token>`
- Deletes S3 object + metadata record

### Report Media Failure Metric
- **POST** `/media/metrics/failure`
- Headers: `Authorization: Bearer <media_token>`
- Body: `{ stage: 'generate_upload_url' | 's3_put' | 'complete_upload' | 'media_access' | 'media_download' | 'delete_media' | 'unknown', statusCode?: number, errorCode?: string, message?: string }`
- Returns: `202 Accepted`

### Read Media Failure Metrics Snapshot
- **GET** `/media/metrics/failure`
- Headers: `Authorization: Bearer <media_token>`
- Returns in-memory counters + recent failure events (for operational debugging)

## AWS Media Setup

1. Create a private S3 bucket and block public access.
2. Create a DynamoDB table for media metadata.
3. Add IAM permissions for `s3:PutObject`, `s3:GetObject`, `dynamodb:PutItem`, `dynamodb:GetItem`.
4. Configure environment variables in `backend/.env`:

```env
AWS_REGION=us-east-1
AWS_S3_BUCKET=forus-private-media
AWS_MEDIA_TABLE=forus-media-metadata
MEDIA_AUTH_JWT_SECRET=replace_with_strong_random_secret
MEDIA_AUTH_TOKEN_TTL_SECONDS=3600
MEDIA_UPLOAD_TICKET_TTL_SECONDS=900
MEDIA_RATE_LIMIT_WINDOW_MS=300000
MEDIA_RATE_LIMIT_MAX=180
MEDIA_METRICS_RECENT_EVENTS=100
S3_MAX_UPLOAD_BYTES=20971520
S3_UPLOAD_URL_TTL_SECONDS=300
S3_DOWNLOAD_URL_TTL_SECONDS=120

# Optional CloudFront signed delivery for media downloads
CLOUDFRONT_DOMAIN=your-distribution.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=your_cloudfront_key_pair_id
# CLOUDFRONT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"
# CLOUDFRONT_PRIVATE_KEY_BASE64=base64_encoded_private_key
```

### CloudFront Delivery (Recommended)

To reduce latency and offload media delivery, configure CloudFront in front of the private S3 bucket:

1. Create a CloudFront distribution with S3 origin and Origin Access Control (OAC).
2. Keep bucket public access blocked.
3. Configure backend env with:
    - `CLOUDFRONT_DOMAIN`
    - `CLOUDFRONT_KEY_PAIR_ID`
    - one of `CLOUDFRONT_PRIVATE_KEY` or `CLOUDFRONT_PRIVATE_KEY_BASE64`
4. Backend will automatically return CloudFront signed URLs from `GET /media/:id`.
5. If CloudFront vars are absent, backend safely falls back to S3 signed URLs.

### DynamoDB Table Shape

- Table name: `AWS_MEDIA_TABLE`
- Partition key: `id` (String)
- Stored item fields:
    - `id`
    - `fileKey`
    - `type`
    - `ownerId`
    - `coupleCode`
    - `createdAt`

## Legacy Data Migration

If you already have Firestore docs storing `mediaUrl`, run:

```bash
npm run migrate:media-schema
```

Requirements:
- Google application credentials for Firestore Admin SDK (`GOOGLE_APPLICATION_CREDENTIALS`)
- Existing media URLs in `/media/:id` format

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
