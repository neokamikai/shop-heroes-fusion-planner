# Cloud deploy notes

This project is prepared to be published at:

- host: `game-tools.bestcodetools.com`
- path: `/shop-heroes-planner`

## Expected runtime layout on server

- `/home/ubuntu/apps/shop-heroes-planner/current`
- `/home/ubuntu/apps/shop-heroes-planner/shared/.env.production`
- `/home/ubuntu/apps/shop-heroes-planner/shared/postgres-data`

## Frontend build expectations

Build with:

- `VITE_APP_BASE_PATH=/shop-heroes-planner/`
- `VITE_API_BASE_URL=/shop-heroes-planner/api`

After uploading the built `apps/web/dist` folder to the server, normalize permissions so Nginx can read nested assets:

- `find /home/ubuntu/apps/shop-heroes-planner/current/apps/web/dist -type d -exec chmod 755 {} ';'`
- `find /home/ubuntu/apps/shop-heroes-planner/current/apps/web/dist -type f -exec chmod 644 {} ';'`

## API runtime expectations

Suggested API port:

- `API_PORT=3101`

Suggested database port:

- `DB_PORT=54329`

## Infrastructure files

- `nginx/shop-heroes-planner.conf`
- `systemd/shop-heroes-planner-api.service`
- `docker-compose.postgres.yml`
