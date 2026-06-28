# Credit Default Dashboard

React + Tailwind dashboard for the deployed credit default prediction API.

## Local Development

```bash
npm install
npm run dev
```

The dashboard defaults to:

```text
https://api-credit.mohitkumar2007.in
```

## Vercel Deployment

Use this `dashboard` folder as the Vercel project root.

Settings:

```text
Framework Preset: Vite
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

Environment variable:

```text
VITE_API_BASE_URL=https://api-credit.mohitkumar2007.in
```

The included `vercel.json` sets the same build settings and adds an SPA rewrite to `index.html`.

After Vercel creates the production URL, the deployed API must allow that frontend origin. The API currently supports `*.vercel.app` through `CORS_ALLOWED_ORIGIN_REGEX`, and `credit.mohitkumar2007.in` through `CORS_ALLOWED_ORIGINS`.
