# API Documentation

**Base URL (local):** `http://localhost:3000/api`
**Base URL (production):** `https://transaction-ledger-api-8xej.onrender.com/api`

All request and response bodies use JSON. All timestamps are in ISO 8601 format (UTC).

---

## Health Check

### `GET /api/health`

**Response** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 1. Create Account

### `POST /api/accounts`

Creates a new account with a zero balance.

**Request Body**
```json
{
  "name": "John Doe"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Account holder name (non-empty) |

**Response** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "balance": 0,
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| 400 | Name is missing or empty |

---

## 2. Get Account Balance

### `GET /api/accounts/:accountId/balance`

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| accountId | UUID | Account identifier |

**Response** `200 OK`
```json
{
  "success": true,
  "data": {
    "account_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "balance": 150.00
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| 400 | Invalid UUID format |
| 404 | Account not found |

---

## 3. Add Transaction

### `POST /api/accounts/:accountId/transactions`

Adds a credit or debit transaction to an account. The transaction and balance update happen atomically.

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| accountId | UUID | Account identifier |

**Request Body**
```json
{
  "type": "credit",
  "amount": 100.00,
  "description": "Initial deposit",
  "reference_id": "DEP-001"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | `"credit"` or `"debit"` |
| amount | number | Yes | Must be greater than 0 |
| description | string | No | Description of the transaction |
| reference_id | string | Yes | Unique reference within the account |

**Response** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "account_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "credit",
    "amount": 100.00,
    "description": "Initial deposit",
    "reference_id": "DEP-001",
    "created_at": "2024-01-15T10:35:00.000Z",
    "balance_after": 100.00
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| 400 | Invalid account ID, type, amount, or missing reference_id |
| 404 | Account not found |
| 409 | Duplicate reference_id for this account |
| 422 | Insufficient balance for debit |

---

## 4. Get Transaction History

### `GET /api/accounts/:accountId/transactions`

Returns paginated transaction history, sorted latest-first.

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| accountId | UUID | Account identifier |

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| type | string | — | Filter by `"credit"` or `"debit"` |
| page | integer | 1 | Page number (starting from 1) |
| limit | integer | 10 | Records per page (1–100) |

**Example Request**
```
GET /api/accounts/550e8400-.../transactions?type=credit&page=1&limit=5
```

**Response** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "account_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "credit",
      "amount": 100.00,
      "description": "Initial deposit",
      "reference_id": "DEP-001",
      "created_at": "2024-01-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total_records": 1,
    "total_pages": 1
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| 400 | Invalid account ID, type filter, or pagination params |
| 404 | Account not found |

---

## 5. Money Transfer (Bonus)

### `POST /api/transfers`

Transfers money atomically from one account to another. Creates a debit on the source and a credit on the destination in a single database transaction.

**Request Body**
```json
{
  "from_account_id": "550e8400-e29b-41d4-a716-446655440000",
  "to_account_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "amount": 50.00,
  "description": "Payment for services",
  "reference_id": "TRF-001"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| from_account_id | UUID | Yes | Source account |
| to_account_id | UUID | Yes | Destination account |
| amount | number | Yes | Must be greater than 0 |
| description | string | No | Transfer description |
| reference_id | string | Yes | Unique transfer reference |

**Response** `201 Created`
```json
{
  "success": true,
  "data": {
    "transfer": {
      "from_account_id": "550e8400-...",
      "to_account_id": "6ba7b810-...",
      "amount": 50.00,
      "description": "Payment for services",
      "reference_id": "TRF-001"
    },
    "debit_transaction": {
      "id": "...",
      "created_at": "2024-01-15T11:00:00.000Z"
    },
    "credit_transaction": {
      "id": "...",
      "created_at": "2024-01-15T11:00:00.000Z"
    },
    "balances": {
      "from_account": 50.00,
      "to_account": 100.00
    }
  }
}
```

**Errors**
| Status | Condition |
|--------|-----------|
| 400 | Invalid account IDs, same source and destination, invalid amount, or missing reference_id |
| 404 | Source or destination account not found |
| 409 | Duplicate transfer reference_id |
| 422 | Insufficient balance in source account |

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description"
  }
}
```

### HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Resource created |
| 400 | Bad request / validation error |
| 404 | Resource not found |
| 409 | Conflict (duplicate reference_id) |
| 422 | Unprocessable (insufficient balance) |
| 500 | Internal server error |
