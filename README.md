# Transaction Ledger API

A backend API for a simple transaction ledger system. Users can create accounts, perform credit and debit transactions, retrieve balances, view transaction history, and transfer money between accounts.

## Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Database:** PostgreSQL (hosted on Supabase)
- **Hosting:** Render (free tier)

## Project Structure

```
src/
├── app.js                          # Express app entry point
├── config/
│   └── database.js                 # PostgreSQL connection pool
├── controllers/
│   ├── accountController.js        # Account create & balance logic
│   ├── transactionController.js    # Transaction add & history logic
│   └── transferController.js       # Money transfer logic
├── db/
│   └── migrate.js                  # Database migration script
├── middleware/
│   └── errorHandler.js             # Centralized error handling
└── routes/
    ├── accounts.js                 # Account routes
    ├── transactions.js             # Transaction routes
    └── transfers.js                # Transfer routes
```

## Setup & Run Locally

### Prerequisites
- Node.js v18 or newer
- A Supabase project (free tier) with the Postgres connection string

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/transaction-ledger-api.git
   cd transaction-ledger-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Supabase Postgres connection string:
   ```
   DATABASE_URL=postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   PORT=3000
   ```

4. **Run database migration**
   ```bash
   npm run migrate
   ```
   This creates the `accounts` and `transactions` tables with all necessary constraints and indexes.

5. **Start the server**
   ```bash
   npm start
   ```
   The API will be available at `http://localhost:3000`.

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/accounts` | Create a new account |
| GET | `/api/accounts/:id/balance` | Get account balance |
| POST | `/api/accounts/:id/transactions` | Add a transaction |
| GET | `/api/accounts/:id/transactions` | Get transaction history |
| POST | `/api/transfers` | Transfer money between accounts |

See [API Documentation](docs/API.md) for detailed request/response examples.

## Deployment (Render)

1. Push the code to a GitHub repository.
2. Go to [render.com](https://render.com) and create a new **Web Service**.
3. Connect your GitHub repo.
4. Set the following:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variables (`DATABASE_URL`, `PORT`) in the Render dashboard.
6. Deploy.

## Author

Kushal Dayanand
