# Deploy EDI.ai Backend to Render

## Prerequisites
- Render account (free tier available)
- GitHub repository with your code

## Deployment Steps

### 1. Push Code to GitHub
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### 2. Create New Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `https://github.com/illeniall239/EDI.git`
4. Configure the service:

**Basic Settings:**
- **Name**: `edi-backend` (or your preferred name)
- **Region**: Oregon (or your preferred region)
- **Branch**: `main`
- **Root Directory**: Leave empty (uses repository root)
- **Runtime**: `Python 3`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`

**Instance Type:**
- Select **Free** (for testing) or **Starter** (for production)

### 3. Environment Variables

Add these environment variables in Render's dashboard:

Required:
- `GOOGLE_API_KEY` - Your Google Gemini API key
- `PYTHON_VERSION` - `3.11.0`

Optional (based on features you use):
- `AZURE_API_KEY` - Azure Speech Services
- `AZURE_REGION` - Azure region (e.g., "eastus")
- `AZURE_ENDPOINT` - Azure endpoint URL
- `PANDASAI_API_KEY` - PandasAI key (if using)
- `CARTESIA_API_KEY` - Cartesia key (if using)
- `SAMBANOVA_API_KEY` - SambaNova key (if using)
- `OPENROUTER_API_KEY` - OpenRouter key (if using)
- `ELEVENLABS_API_KEY` - ElevenLabs key (if using)
- `NEXT_PUBLIC_GROQ_API_KEY` - Groq key (if using)

### 4. Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Install dependencies from `requirements.txt`
   - Start your FastAPI backend
3. Wait for deployment to complete (5-10 minutes)

### 5. Get Your Backend URL

Once deployed, Render will provide a URL like:
```
https://edi-backend.onrender.com
```

### 6. Update Frontend Configuration

Update your Next.js frontend to use the new backend URL:

In `edi-frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=https://edi-backend.onrender.com
```

And update API calls in your frontend code to use this URL.

## Important Notes

### Free Tier Limitations
- Backend will spin down after 15 minutes of inactivity
- First request after spin-down takes 30-60 seconds (cold start)
- Consider upgrading to Starter plan for production

### File Storage
- Render's free tier has ephemeral storage
- Uploaded files and generated visualizations will be lost on restart
- Consider using cloud storage (AWS S3, Cloudinary) for persistent files

### Database
- Temporary SQLite databases work but are ephemeral
- For production, migrate to PostgreSQL (Render provides free PostgreSQL addon)

## Troubleshooting

### Build Fails
- Check `requirements.txt` is properly formatted
- Verify Python version compatibility
- Check Render build logs for specific errors

### App Crashes on Start
- Verify all required environment variables are set
- Check start command is correct
- Review Render logs for errors

### CORS Errors
- Backend already configured to allow all origins
- If issues persist, check browser console for specific CORS errors

## Monitoring

- **Logs**: View real-time logs in Render dashboard
- **Metrics**: Monitor CPU, memory, and request metrics
- **Alerts**: Set up email/Slack notifications for crashes

## Next Steps

1. Deploy frontend to Vercel/Netlify
2. Set up custom domain
3. Add PostgreSQL database
4. Configure cloud storage for files
5. Set up monitoring and error tracking
