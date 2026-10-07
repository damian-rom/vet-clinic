# Vet Clinic Platform

A web application for appointment booking, clinical planning, multi-visit care, and inventory control in a veterinary clinic.

## Structure

```
vet-clinic/
├── apps/
│   ├── web/          # Next.js 15 + React frontend
│   └── app/          # NestJS backend API
└── packages/
    ├── types/        # Shared TypeScript domain types
    ├── validation/   # Shared Zod validation schemas
    └── config/       # Shared clinic configuration constants
```

## Getting started

```bash
npm install
npm run dev
```
