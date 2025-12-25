# Deploy EDI.ai Frontend to Vercel

## Prerequisites
- Vercel account (free tier available)
- GitHub repository with your code
- Backend deployed on Render (see DEPLOY_RENDER.md)

## Deployment Steps

### 1. Push Code to GitHub

Ensure all changes are committed and pushed:
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 2. Import Project to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository: `https://github.com/illeniall239/EDI.git`
4. Configure the project:

**Project Settings:**
- **Framework Preset**: Next.js (auto-detected)
- **Root Directory**: `edi-frontend` ⚠️ **IMPORTANT: Set this!**
- **Build Command**: `npm run build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

### 3. Environment Variables

Click **"Environment Variables"** and add these:

**Required:**
```
NEXT_PUBLIC_SUPABASE_URL = https://xnoxgkkwqqtzvrvppabw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhub3hna2t3cXF0enZydnBwYWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NDc0MDMsImV4cCI6MjA2MzMyMzQwM30.0LVwAl_9x6K5RtvBMciMklWdlSyXEEOkSAlx1EzViSE
NEXT_PUBLIC_API_URL = https://your-backend-name.onrender.com
```

**Optional (based on features you use):**
```
NEXT_PUBLIC_GROQ_API_KEY = your-groq-key
GOOGLE_API_KEY = your-google-key
ELEVENLABS_API_KEY = your-elevenlabs-key
AZURE_API_KEY = your-azure-key
AZURE_REGION = eastus
AZURE_ENDPOINT = https://eastus.api.cognitive.microsoft.com/
PANDASAI_API_KEY = your-pandasai-key
CARTESIA_API_KEY = your-cartesia-key
SAMBANOVA_API_KEY = your-sambanova-key
OPENROUTER_API_KEY = your-openrouter-key
```

⚠️ **Important**: Replace `https://your-backend-name.onrender.com` with your actual Render backend URL.

### 4. Deploy

1. Click **"Deploy"**
2. Vercel will:
   - Clone your repository
   - Install dependencies from package.json
   - Build your Next.js app
   - Deploy to production
3. Wait for deployment (2-5 minutes)

### 5. Get Your Frontend URL

Once deployed, Vercel provides a URL like:
```
https://edi-frontend.vercel.app
```

Or use a custom domain from your Vercel settings.

## Post-Deployment Configuration

### Update Backend CORS

Once you have your Vercel URL, update your backend CORS to be more restrictive:

In `backend/main.py`, change:
```python
allow_origins=["*"]  # Current (allows all)
```

To:
```python
allow_origins=[
    "https://edi-frontend.vercel.app",  # Your Vercel URL
    "https://your-custom-domain.com",   # If you have one
    "http://localhost:3000"              # For local development
]
```

Then redeploy the backend on Render.

### Connect Frontend to Backend

1. Verify `NEXT_PUBLIC_API_URL` in Vercel environment variables points to your Render backend
2. Test API calls from your deployed frontend
3. Check browser console for any CORS or connection errors

## Vercel-Specific Features

### Automatic Deployments
- Every push to `main` branch triggers a new production deployment
- Pull requests get preview deployments automatically

### Environment Management
- **Production**: Environment variables for main branch
- **Preview**: Separate environment variables for PR previews
- **Development**: Local environment variables (.env.local)

### Custom Domains
1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. SSL certificate automatically provisioned

### Analytics & Monitoring
- Enable Vercel Analytics for performance metrics
- Set up error tracking with Vercel Monitoring
- View deployment logs in real-time

## Troubleshooting

### Build Fails

**Error: "Cannot find module"**
- Check all dependencies are in `package.json`
- Run `npm install` locally to verify

**Error: "Root directory not found"**
- Verify Root Directory is set to `edi-frontend` in project settings

### Runtime Errors

**API calls fail (404/CORS)**
- Check `NEXT_PUBLIC_API_URL` is set correctly
- Verify backend is running on Render
- Check backend CORS configuration

**Environment variables not working**
- Ensure variable names start with `NEXT_PUBLIC_` for client-side access
- Redeploy after adding new environment variables
- Check Vercel deployment logs for build-time errors

**Supabase connection fails**
- Verify Supabase URL and anon key are correct
- Check Supabase project is not paused (free tier)
- Review Supabase logs for authentication errors

### Performance Issues

**Slow initial load**
- Consider enabling Vercel Edge Functions
- Optimize images with Next.js Image component
- Enable Static Site Generation (SSG) where possible

**High bandwidth usage**
- Optimize API calls (reduce frequency, add caching)
- Compress images
- Use Vercel Analytics to identify bottlenecks

## Production Checklist

Before going live:

- [ ] Backend deployed and healthy on Render
- [ ] Frontend deployed successfully on Vercel
- [ ] All environment variables configured
- [ ] API calls working between frontend/backend
- [ ] Authentication flow tested with Supabase
- [ ] CORS properly configured (restrictive, not allowing all origins)
- [ ] Custom domain configured (optional)
- [ ] Error tracking enabled
- [ ] Analytics enabled
- [ ] Performance tested (Lighthouse score > 80)

## Cost Estimation

**Vercel Free Tier:**
- ✅ Unlimited deployments
- ✅ 100 GB bandwidth per month
- ✅ Custom domains
- ⚠️ Hobby plan limitations (no team features)

**Upgrade to Pro if you need:**
- Higher bandwidth limits
- Team collaboration features
- Advanced analytics
- Priority support

## Next Steps

1. Set up custom domain
2. Configure analytics and monitoring
3. Set up automated testing (GitHub Actions)
4. Enable preview deployments for PRs
5. Configure security headers
