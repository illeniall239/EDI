# EDI.ai

AI-powered data analysis platform with intelligent spreadsheet capabilities, natural language processing, and automated insights generation.

## Features

- **Intelligent Spreadsheet**: UniverseJS-powered spreadsheet with natural language commands
- **AI-Powered Analysis**: Google Gemini integration for data insights and visualizations
- **Learn Mode**: Interactive tutorials and guided learning for spreadsheet mastery
- **Work Mode**: Professional data analysis with automated reporting
- **Natural Language Queries**: Ask questions about your data in plain English
- **Automated Visualizations**: AI-generated charts and graphs
- **PDF Report Generation**: Professional reports with insights and recommendations
- **Multi-workspace Support**: Organize different datasets and projects

## Tech Stack

### Frontend
- **Framework**: Next.js 15.3
- **UI**: React 19, Tailwind CSS 4
- **Spreadsheet**: UniverseJS 0.10.8
- **Auth**: Supabase Auth
- **Deployment**: Vercel

### Backend
- **Framework**: FastAPI (Python)
- **AI/ML**: Google Gemini, LangChain, PandasAI
- **Data Processing**: Pandas, NumPy, DuckDB
- **Database**: SQLite (development), PostgreSQL (production)
- **Deployment**: Render

## Project Structure

```
EDI.ai/
├── backend/                 # FastAPI backend
│   ├── main.py             # Main application
│   ├── agent_services.py   # LangChain agents
│   ├── data_handler.py     # Data processing
│   ├── report_generator.py # PDF reports
│   └── settings.py         # Configuration
├── edi-frontend/           # Next.js frontend
│   ├── src/
│   │   ├── app/           # Next.js 15 app router
│   │   ├── components/    # React components
│   │   ├── services/      # API services
│   │   ├── utils/         # Utilities
│   │   └── contexts/      # React contexts
│   └── public/            # Static assets
├── docs/                   # Documentation
│   ├── api.md
│   ├── complete-documentation.md
│   └── database/          # Schema files
└── .archive/              # Historical docs

```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Google Gemini API key
- Supabase account

### Local Development

#### 1. Clone Repository
```bash
git clone https://github.com/illeniall239/EDI.git
cd EDI
```

#### 2. Backend Setup
```bash
# Install Python dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Add your API keys to .env

# Run backend
cd backend
python main.py
# Server runs on http://localhost:8000
```

#### 3. Frontend Setup
```bash
cd edi-frontend

# Install dependencies
npm install

# Create .env.local
cp .env.example .env.local
# Add your environment variables

# Run development server
npm run dev
# App runs on http://localhost:3000
```

### Environment Variables

#### Backend (.env)
```env
GOOGLE_API_KEY=your-google-gemini-key
AZURE_API_KEY=your-azure-key (optional)
AZURE_REGION=eastus (optional)
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Deployment

### Deploy Backend to Render

See [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) for detailed instructions.

**Quick Steps:**
1. Push code to GitHub
2. Create new Web Service on Render
3. Set Root Directory to repository root
4. Configure environment variables
5. Deploy with:
   - Build: `pip install -r requirements.txt`
   - Start: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`

### Deploy Frontend to Vercel

See [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) for detailed instructions.

**Quick Steps:**
1. Import project from GitHub on Vercel
2. Set Root Directory to `edi-frontend`
3. Add environment variables (Supabase, API URL)
4. Deploy

## Documentation

- **[API Documentation](./docs/api.md)** - Backend API reference
- **[Complete Documentation](./docs/complete-documentation.md)** - Full system guide
- **[Database Schema](./docs/database/)** - Supabase schema files
- **[Deployment Guides](./DEPLOY_RENDER.md)** - Production deployment

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is private and proprietary.

## Support

For issues and questions:
- GitHub Issues: https://github.com/illeniall239/EDI/issues
- Documentation: See `/docs` folder

## Acknowledgments

- Built with Google Gemini AI
- Powered by UniverseJS spreadsheet engine
- Authentication by Supabase
- Deployed on Render + Vercel
