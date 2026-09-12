# Video Mela - Backend API Service

[![Backend Repository](https://img.shields.io/badge/GitHub-Backend_Repo-181717?style=for-the-badge&logo=github)](https://github.com/vikrant48/Video_Mela_backend)
[![Frontend Repository](https://img.shields.io/badge/GitHub-Frontend_Repo-61DAFB?style=for-the-badge&logo=react)](https://github.com/vikrant48/Video_Mela_frontend)

A production-ready, decoupled RESTful backend API for **Video Mela**—a modern video streaming and content-sharing platform built with Node.js, Express, MongoDB Atlas, Cloudinary, and JWT Authentication.

---

## 🔗 Quick Links
- **Backend GitHub Repo**: [https://github.com/vikrant48/Video_Mela_backend](https://github.com/vikrant48/Video_Mela_backend)
- **Frontend GitHub Repo**: [https://github.com/vikrant48/Video_Mela_frontend](https://github.com/vikrant48/Video_Mela_frontend)
- **Data Model Workspace**: [Eraser.io Design Workspace](https://app.eraser.io/workspace/OO3HFmjKmUYmLl8JiwRk?origin=share)

---

## 🚀 Key Features

- **JWT Authentication & Security**: Secure HTTP-only cookies (`accessToken` & `refreshToken`), password encryption via `bcrypt`, and auto token renewal.
- **Media Upload Pipeline**: Streaming video and image uploads powered by `Multer` and `Cloudinary` CDN storage.
- **MongoDB Aggregation Pipelines**: Multi-stage aggregation queries for paginated video feeds, subscriber counters, comment threads, user watch history, and like states.
- **Robust Error Handling**: Custom API error class, unified status codes, and silent 401 interceptors.
- **Cold Start Optimization**: Integrated timeout handling for smooth Render deployment restarts.

---

## 🛠️ Technology Stack

- **Runtime Environment**: Node.js
- **Web Framework**: Express.js
- **Database & ODM**: MongoDB Atlas & Mongoose
- **Storage & CDN**: Cloudinary Media Management
- **File Parsing**: Multer middleware
- **Security & Tokens**: JSON Web Tokens (`jsonwebtoken`), `bcryptjs`, `cookie-parser`

---

## 📊 System Architecture & Diagrams

## 📐 1. High-Level System Architecture
VideoMela operates as a **Decoupled Client-Server SPA Architecture** with cloud media storage.
```mermaid
graph TB
    subgraph Frontend ["Client Layer (Frontend)"]
        UI["React SPA (Vite + Tailwind)"]
        State["Redux Toolkit Store"]
        Axios["Axios API Client (with Credentials)"]
        UI --> State
        State --> Axios
    end
    subgraph Server ["Server Layer (Express Backend)"]
        Cors["CORS Middleware"]
        CookieParser["Cookie Parser"]
        ExpressRouter["API Router (/api/v1)"]
        AuthMiddleware["JWT Auth Middleware (verifyJWT)"]
        MulterMiddleware["Multer MemoryStorage Middleware"]
        Controllers["Controller Handlers (Business Logic)"]
        Utils["Utils (ApiError, ApiResponse, asyncHandler)"]
        Axios -->|HTTP Requests with Cookies| Cors
        Cors --> CookieParser
        CookieParser --> ExpressRouter
        ExpressRouter --> AuthMiddleware
        ExpressRouter --> MulterMiddleware
        AuthMiddleware --> Controllers
        MulterMiddleware --> Controllers
        Controllers -.-> Utils
    end
    subgraph Data ["Data & Storage Layer"]
        MongoDB[("MongoDB Database (Mongoose ODM)")]
        Cloudinary["Cloudinary CDN (Images & Videos)"]
        Controllers -->|Aggregation Pipelines & Mongoose Queries| MongoDB
        Controllers -->|Upload Stream / Delete API| Cloudinary
    end

```

### 1. JWT Authentication & Refresh Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend (React)
    participant Auth as Auth Middleware (verifyJWT)
    participant API as Controller (Express)
    participant DB as MongoDB Atlas

    Client->>API: Request with HTTP-only Cookies
    API->>Auth: Pass request to verifyJWT
    alt Token is valid
        Auth->>DB: Fetch user by decoded _id
        DB-->>Auth: User record
        Auth-->>API: Attach req.user & next()
        API-->>Client: 200 OK (Data Payload)
    else Access Token Expired
        Auth-->>Client: 401 Unauthorized (Token Expired)
        Client->>API: POST /api/v1/users/refresh_token
        API->>DB: Validate Refresh Token
        alt Refresh Token Valid
            DB-->>API: User valid
            API-->>Client: 200 OK (New accessToken & refreshToken Cookies)
            Client->>API: Retry Original Request
        else Refresh Token Invalid
            API-->>Client: 401 Unauthorized (Login Required)
        end
    end
```
```mermaid
sequenceDiagram
    autonumber
    actor Client as React Client
    participant API as Express Router
    participant Auth as verifyJWT Middleware
    participant Controller as User Controller
    participant DB as MongoDB
    participant JWT as JWT Utility

    title User Login & Protected Request Lifecycle

    Client->>API: POST /api/v1/users/login { username/email, password }
    API->>Controller: loginUser()
    Controller->>DB: User.findOne({ username OR email })
    DB-->>Controller: Return User document (with hashed password)
    Controller->>DB: user.isPasswordCorrect(password) via bcrypt.compare()

    alt Password Valid
        Controller->>JWT: generateAccessToken() & generateRefreshToken()
        JWT-->>Controller: Returns AccessToken & RefreshToken
        Controller->>DB: Save refreshToken into user document
        Controller-->>Client: Set HttpOnly Cookies (accessToken, refreshToken) + JSON ApiResponse
    else Password Invalid
        Controller-->>Client: Throw ApiError(401, "password is incorrect")
    end

    note over Client, API: Subsequent Protected Request (e.g., Get Current User / Upload Video)

    Client->>API: GET /api/v1/users/current-user (with accessToken Cookie / Bearer Header)
    API->>Auth: verifyJWT()
    Auth->>Auth: Extract token from Cookie or Authorization header
    Auth->>JWT: jwt.verify(token, ACCESS_TOKEN_SECRET)
    
    alt Token Valid
        JWT-->>Auth: Decoded payload {_id, username, email}
        Auth->>DB: User.findById(_id).select("-password -refreshToken")
        DB-->>Auth: User document
        Auth->>API: req.user = user -> next()
        API->>Controller: getCurrentUser()
        Controller-->>Client: ApiResponse(200, user)
    else Token Expired / Invalid
        Auth-->>Client: ApiError(401, "Unauthorized / Token Expired")
        Client->>API: POST /api/v1/users/refresh-token (with refreshToken)
        API->>Controller: refreshAccessToken()
        Controller->>JWT: verifyRefreshToken()
        Controller->>DB: Verify stored refreshToken matches
        Controller->>JWT: Issue new Access & Refresh Tokens
        Controller-->>Client: Set updated HttpOnly Cookies
    end
```

---

### 3. Video Upload & Cloudinary Processing Pipeline

```mermaid
flowchart TD
    A[Client Submits Video Form & Thumbnail] --> B[Multer Middleware]
    B -->|Save temporary files| C[Local Disk /public/temp]
    C --> D[Upload Video to Cloudinary]
    C --> E[Upload Thumbnail to Cloudinary]
    D -->|Get CDN URL & Duration| F[Cloudinary CDN]
    E -->|Get Thumbnail CDN URL| F
    D --> G[Delete Local Temp Files]
    E --> G
    F --> H[Create Video Document in MongoDB]
    H --> I[Return 201 Created Response to Client]
```

---

