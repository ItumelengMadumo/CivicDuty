# 🏛️ CivicDuty

**Community-powered civic reporting platform** that enables residents to document, verify, and surface real-world issues in their living environments in a way that is safe, evidence-based, and resistant to abuse.

## 🌟 Features

### For Citizens
- **📝 Report Issues** - Document civic problems with photos, videos, and precise GPS location
- **📍 Location-Based** - Automatic GPS capture with manual adjustment support
- **📷 Media Evidence** - Attach up to 5 photos/videos per report with automatic compression
- **🌐 Offline-First** - Create reports offline, sync when connected
- **✅ Community Validation** - Confirm or flag reports to build credibility
- **📊 Trust System** - Build reputation through accurate reporting and validations

### For Administrators
- **📋 Report Moderation** - Review, verify, or reject reports
- **👥 User Management** - Manage users, roles, and bans
- **📤 Data Export** - Export verified data in CSV, JSON, or GeoJSON formats
- **📈 Analytics Dashboard** - Track community engagement and issue trends

### Technical Features
- **🔐 Anonymous + Identified Auth** - Start anonymously, upgrade to verified account
- **📱 Progressive Web App** - Install on any device, works offline
- **🗺️ Interactive Map** - Leaflet-based visualization of all reports
- **⚡ Real-time Sync** - Background sync when connectivity is restored
- **🔒 Privacy-First** - Device fingerprinting without tracking

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Angular 17)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Map View   │  │Report Form  │  │   Profile   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│  ┌─────────────────────────────────────────────────┐            │
│  │              Service Workers (PWA)              │            │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │            │
│  │  │ Caching │  │  Sync   │  │ Background Push │ │            │
│  │  └─────────┘  └─────────┘  └─────────────────┘ │            │
│  └─────────────────────────────────────────────────┘            │
│  ┌─────────────────────────────────────────────────┐            │
│  │              IndexedDB (Local Storage)          │            │
│  └─────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  REST API   │  │   Auth      │  │  Validation │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│  ┌─────────────────────────────────────────────────┐            │
│  │              Async SQLAlchemy                   │            │
│  └─────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
         │              │                    │
         ▼              ▼                    ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐
│ PostgreSQL  │  │    Redis    │  │  S3/MinIO Storage   │
└─────────────┘  └─────────────┘  └─────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for development)
- Python 3.11+ (for development)

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/civicduty.git
cd civicduty

# Copy environment variables
cp .env.example .env

# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost
# Backend API: http://localhost:8000
# MinIO Console: http://localhost:9001
```

### Manual Development Setup

#### Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/civicduty
export REDIS_URL=redis://localhost:6379
export SECRET_KEY=your-secret-key

# Run migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start development server
ng serve

# Build for production
ng build --configuration production
```

## 📱 PWA Installation

CivicDuty is a Progressive Web App that can be installed on any device:

1. **Desktop (Chrome/Edge)**: Click the install icon in the address bar
2. **Android**: Tap "Add to Home Screen" in the browser menu
3. **iOS**: Tap Share → "Add to Home Screen"

## 📊 Report Categories

| Category | Icon | Description |
|----------|------|-------------|
| Infrastructure | 🏗️ | Roads, bridges, public buildings |
| Utilities | ⚡ | Water, electricity, gas issues |
| Safety | 🚨 | Hazards, accidents, emergencies |
| Sanitation | 🗑️ | Waste, sewage, cleanliness |
| Environment | 🌳 | Parks, pollution, wildlife |
| Transportation | 🚌 | Public transit, traffic |
| Other | 📌 | Miscellaneous civic issues |

## 🔒 Security

- JWT-based authentication with refresh tokens
- Device fingerprinting for anonymous users
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS protection
- SQL injection prevention via SQLAlchemy
- XSS protection via Angular sanitization

## 📈 Trust & Validation System

Reports gain credibility through community validation:

```
Score = Σ(ValidationType × ValidatorTrust × ProximityBonus × MediaBonus)

Where:
- Confirmation = +1, Flag = -1, Spam = -2
- ProximityBonus = +0.5 if validator within 100m
- MediaBonus = +0.25 if validator adds media
```

**Scoring Thresholds:**
- Score ≥ 3.0 → Auto-verified
- Score ≤ -2.0 → Auto-rejected
- Otherwise → Manual review

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest --cov=app tests/

# Frontend tests
cd frontend
ng test
ng e2e
```

## 📦 Project Structure

```
civicduty/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/    # API routes
│   │   ├── core/                # Config, security
│   │   ├── db/                  # Database setup
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── services/            # Business logic
│   │   └── main.py              # FastAPI app
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/            # Services, guards, models
│   │   │   ├── features/        # Page components
│   │   │   └── shared/          # Reusable components
│   │   ├── environments/
│   │   └── styles.scss
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenStreetMap for map tiles
- The Angular and FastAPI communities
- All contributors and testers

---

**Made with ❤️ for civic engagement**
community-powered civic reporting system that enables residents to document, verify, and surface real-world issues in their living environments in a way that is safe, evidence-based, and resistant to abus
