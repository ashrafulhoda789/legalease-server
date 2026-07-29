# ⚖️ LegalEase Backend – API Server & Database Integration

This is the backend REST API server for **LegalEase – Online Lawyer Hiring Platform**. It handles server-side business logic, database management using **MongoDB**, and integrates seamlessly with **Better Auth** for secure multi-role user authentication and session management.

---

## 🌐 Related Repositories & Live Links

- **Live Application:** [https://legalease-client-five.vercel.app](https://legalease-client-five.vercel.app)
- ** Backend Server:** [https://legalease-server-three.vercel.app/](https://legalease-server-three.vercel.app)

---

## ✨ Key Backend Features

-  **Authentication & Session Management**: Built with `Better Auth` and `@better-auth/mongo-adapter` for role-based access control (User, Lawyer, Admin).
-  **MongoDB Connection**: Direct database integration for managing profiles, appointment schedules, and law practice categories.
-  **Express REST APIs**: Fast, modular endpoints for user query processing, lawyer directory searches, and booking states.
-  **CORS & Environment Protection**: Secure cross-origin resource handling for client-side communication.

---

## 🛠️ Tech Stack

- **Runtime Environment:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (Native MongoDB Driver)
- **Authentication:** Better Auth (`@better-auth/mongo-adapter`)

---

## 📦 Packages Used

Viewers can easily install all backend dependencies by running the commands below:

### 1️⃣ Core Framework & Database
```bash
npm install express mongodb dotenv cors
