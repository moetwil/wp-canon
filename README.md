# wp-canon
Clone your WordPress site into an AI-ready content repo.

## Local WordPress development

Requirements:
- Docker installed

Start local WordPress:

```sh
cd docker
docker compose up -d
```

Open:

```text
http://localhost:8080
```

Install WordPress manually. Recommended local credentials:

```text
username: admin
password: admin
```

Create an Application Password:

```text
Users -> Profile -> Application Passwords
```

Create a local `.env` in the project root from `.env.example`:

```env
WP_URL=http://localhost:8080
WP_USERNAME=admin
WP_APP_PASSWORD=your application password
```

Run:

```sh
npx tsx scripts/discover.ts
```

Do not commit `.env`.

The Docker WordPress setup includes a local development mu-plugin that enables Application Passwords over HTTP. This Docker setup is for local development only.
